import { Notice, Plugin } from "obsidian";
import {
	IssueTrackerSettings,
	DEFAULT_SETTINGS,
	DEFAULT_REPOSITORY_TRACKING,
	SettingsProfile,
	DEFAULT_REPOSITORY_PROFILE,
	DEFAULT_PROJECT_PROFILE,
	ProviderConfig,
	ProviderId,
	ProviderType,
} from "./types";
import { IssueProvider, ProviderExtraParams } from "./providers/provider";
import { ProviderRegistry } from "./providers/provider-registry";
import { GitHubProvider } from "./providers/github/github-provider";
import { GitLabProvider } from "./providers/gitlab/gitlab-provider";
import { FileManager } from "./file-manager";
import { IssueTrackerSettingTab } from "./settings-tab";
import { NoticeManager } from "./notice-manager";
import { GitHubKanbanView, KANBAN_VIEW_TYPE } from "./kanban-view";
import {
	getEffectiveRepoSettings,
	stripProfileFieldsFromRepo,
} from "./util/settingsUtils";

export default class IssueTrackerPlugin extends Plugin {
	settings: IssueTrackerSettings = DEFAULT_SETTINGS;
	public providerRegistry: ProviderRegistry = new ProviderRegistry();
	/** @deprecated Use providerRegistry.get("github") instead */
	public gitHubClient: IssueProvider | null = null;
	private fileManagers: Map<string, FileManager> = new Map();
	private noticeManager!: NoticeManager;
	private isSyncing: boolean = false;
	currentUser: string = "";
	private backgroundSyncIntervalId: number | null = null;

	/**
	 * Get the token for a specific provider, either from SecretStorage or from settings
	 */
	getProviderToken(providerId: ProviderId): string {
		const config = this.settings.providers.find((p) => p.id === providerId);
		if (!config) return "";
		if (config.useSecretStorage && config.secretTokenName) {
			try {
				const secret = this.app.secretStorage?.getSecret(
					config.secretTokenName,
				);
				if (secret) return secret;
				console.warn(
					`Secret "${config.secretTokenName}" not found in SecretStorage for provider ${providerId}`,
				);
			} catch (error) {
				console.error(
					`Error retrieving secret for provider ${providerId}:`,
					error,
				);
			}
		}
		return config.token || "";
	}

	/** @deprecated Use getProviderToken("github") instead */
	getGitHubToken(): string {
		return this.getProviderToken("github");
	}

	/**
	 * Check if SecretStorage is available (Obsidian 1.11)
	 */
	isSecretStorageAvailable(): boolean {
		return !!this.app.secretStorage;
	}

	/**
	 * Validate that the configured secret exists and has a value
	 */
	validateSecretStorage(providerId?: ProviderId): boolean {
		const config = this.settings.providers.find(
			(p) => p.id === (providerId ?? "github"),
		);
		if (!config || !config.useSecretStorage) return true;
		if (!config.secretTokenName) return false;
		try {
			const secret = this.app.secretStorage?.getSecret(
				config.secretTokenName,
			);
			return !!secret;
		} catch (error) {
			console.error("Error validating secret:", error);
			return false;
		}
	}

	/**
	 * Migrate token from settings to SecretStorage
	 */
	async migrateTokenToSecretStorage(
		secretName: string,
		providerId?: ProviderId,
	): Promise<boolean> {
		const pid = providerId ?? "github";
		if (!this.isSecretStorageAvailable()) {
			new Notice(
				"SecretStorage is not available. Please update Obsidian to version 1.11 or later.",
			);
			return false;
		}
		if (!this.app.secretStorage) {
			new Notice("SecretStorage is not initialized.");
			return false;
		}
		const config = this.settings.providers.find((p) => p.id === pid);
		if (!config || !config.token) {
			new Notice("No token to migrate. Please enter a token first.");
			return false;
		}
		try {
			this.app.secretStorage.setSecret(secretName, config.token);
			config.useSecretStorage = true;
			config.secretTokenName = secretName;
			config.token = "";
			await this.saveSettings();
			new Notice("Token successfully migrated to SecretStorage!");
			return true;
		} catch (error) {
			console.error("Failed to migrate token to SecretStorage:", error);
			new Notice("Failed to migrate token. See console for details.");
			return false;
		}
	}

	/**
	 * Get the provider for a specific repository
	 */
	private getProviderForRepo(repo: {
		provider?: ProviderId;
	}): IssueProvider | undefined {
		return this.providerRegistry.get(repo.provider ?? "github");
	}

	/**
	 * Get a FileManager bound to a specific provider
	 */
	private getFileManagerForProvider(provider: IssueProvider): FileManager {
		let fm = this.fileManagers.get(provider.id);
		if (!fm) {
			fm = new FileManager(
				this.app,
				this.settings,
				this.noticeManager,
				provider,
			);
			this.fileManagers.set(provider.id, fm);
		}
		return fm;
	}

	/**
	 * Build ProviderExtraParams for the given repository.
	 */
	private getExtraParams(repo: any): ProviderExtraParams | undefined {
		const provider = this.getProviderForRepo(repo);
		if (provider?.type === "gitlab" && repo.gitlabProjectId) {
			return { gitlabProjectId: repo.gitlabProjectId };
		}
		return undefined;
	}

	/**
	 * For GitLab repos without a cached numeric project ID, resolve it once
	 * and persist it so subsequent API calls avoid %2F encoding issues.
	 */
	private async resolveGitLabProjectIds(): Promise<void> {
		// Resolve for all GitLab provider instances
		const glProviders = this.providerRegistry.getByType("gitlab");

		let changed = false;
		for (const glProvider of glProviders) {
			if (!glProvider.isReady()) continue;

			for (const repo of this.settings.repositories) {
				if (repo.provider !== glProvider.id || repo.gitlabProjectId)
					continue;

				const [owner, repoName] = repo.repository.split("/");
				if (!owner || !repoName) continue;

				const id = await (
					glProvider as GitLabProvider
				).resolveProjectId(owner, repoName);
				if (id !== undefined) {
					repo.gitlabProjectId = id;
					changed = true;
					this.noticeManager.debug(
						`Resolved GitLab project ID ${id} for ${repo.repository}`,
					);
				}
			}
		}
		if (changed) {
			await this.saveSettings();
		}
	}

	async sync() {
		if (this.isSyncing) {
			this.noticeManager.warning("Already syncing...");
			return;
		}

		this.isSyncing = true;
		try {
			this.noticeManager.info("Syncing issues and pull requests");
			await this.resolveGitLabProjectIds();
			await this.fetchIssues();
			await this.fetchPullRequests();
			await this.syncProjects();
			// Cleanup empty folders for each provider's file manager
			for (const fm of this.fileManagers.values()) {
				await fm.cleanupEmptyFolders();
			}

			this.noticeManager.success("Synced issues and pull requests");
		} catch (error: unknown) {
			this.noticeManager.error(
				"Error syncing issues and pull requests",
				error,
			);
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Sync items from tracked GitHub Projects (GitHub-only feature)
	 */
	private async syncProjects() {
		if (!this.settings.enableProjectTracking) {
			return;
		}

		const ghProvider =
			this.providerRegistry.get("github") ??
			this.providerRegistry.getByType("github")[0];
		if (!ghProvider?.isReady() || !ghProvider.supportsProjects()) {
			return;
		}
		this.noticeManager.setProviderPrefix(ghProvider.displayName);

		const ghFileManager = this.getFileManagerForProvider(ghProvider);

		const hasAnyFolderConfigured = (p: any) =>
			p.issueFolder ||
			p.pullRequestFolder ||
			p.customIssueFolder ||
			p.customPullRequestFolder;

		const enabledProjects = this.settings.trackedProjects.filter(
			(p) => p.enabled && hasAnyFolderConfigured(p),
		);

		if (enabledProjects.length === 0) {
			this.noticeManager.debug("No projects with folders configured");
			return;
		}

		for (const project of enabledProjects) {
			try {
				this.noticeManager.debug(`Syncing project: ${project.title}`);

				const items = await ghProvider.fetchProjectItems!(project.id);

				if (items.length === 0) {
					this.noticeManager.debug(
						`No items found in project ${project.title}`,
					);
					continue;
				}

				await ghFileManager.createProjectItemFiles(project, items);

				this.noticeManager.debug(
					`Processed ${items.length} items for project ${project.title}`,
				);
			} catch (error: unknown) {
				this.noticeManager.error(
					`Error syncing project ${project.title}`,
					error,
				);
			}
		}
	}

	async syncSingleRepository(repositoryName: string) {
		if (this.isSyncing) {
			this.noticeManager.warning("Already syncing...");
			return;
		}

		const repo = this.settings.repositories.find(
			(r) => r.repository === repositoryName,
		);

		if (!repo) {
			this.noticeManager.error(
				`Repository ${repositoryName} not found in settings`,
			);
			return;
		}

		const provider = this.getProviderForRepo(repo);
		if (!provider?.isReady()) {
			this.noticeManager.error(
				`Provider ${repo.provider ?? "github"} is not initialized or not ready`,
			);
			return;
		}
		this.noticeManager.setProviderPrefix(provider.displayName);

		const fileManager = this.getFileManagerForProvider(provider);
		const extra = this.getExtraParams(repo);

		this.isSyncing = true;
		try {
			const effectiveRepo = getEffectiveRepoSettings(repo, this.settings);
			this.noticeManager.info(`Syncing repository: ${repositoryName}`);
			const [owner, repoName] = repo.repository.split("/");
			if (!owner || !repoName) {
				this.noticeManager.error(
					`Invalid repository format: ${repositoryName}`,
				);
				return;
			}

			// Sync Issues
			if (effectiveRepo.trackIssues) {
				this.noticeManager.debug(
					`Fetching issues for ${effectiveRepo.repository}`,
				);
				const allIssuesIncludingRecentlyClosed =
					await provider.fetchRepositoryIssues(
						owner,
						repoName,
						true,
						this.settings.cleanupClosedIssuesDays,
						extra,
					);

				const openIssues = allIssuesIncludingRecentlyClosed.filter(
					(issue: { state: string }) => issue.state === "open",
				);

				const issuesToFilter = effectiveRepo.includeClosedIssues
					? allIssuesIncludingRecentlyClosed
					: openIssues;

				const filteredIssues = fileManager.filterIssues(
					effectiveRepo,
					issuesToFilter,
				);

				this.noticeManager.debug(
					`Processing ${filteredIssues.length} issues (from ${openIssues.length} open issues) for ${effectiveRepo.repository}`,
				);

				const currentIssueNumbers = new Set(
					filteredIssues.map((issue: any) => issue.number.toString()),
				);

				await fileManager.createIssueFiles(
					effectiveRepo,
					filteredIssues,
					allIssuesIncludingRecentlyClosed,
					currentIssueNumbers,
				);
			}

			// Sync Pull Requests
			if (effectiveRepo.trackPullRequest) {
				this.noticeManager.debug(
					`Fetching pull requests for ${effectiveRepo.repository}`,
				);

				const allPullRequestsIncludingRecentlyClosed =
					await provider.fetchRepositoryPullRequests(
						owner,
						repoName,
						true,
						this.settings.cleanupClosedIssuesDays,
						extra,
					);

				const openPullRequests =
					allPullRequestsIncludingRecentlyClosed.filter(
						(pr: { state: string }) => pr.state === "open",
					);

				const pullRequestsToFilter =
					effectiveRepo.includeClosedPullRequests
						? allPullRequestsIncludingRecentlyClosed
						: openPullRequests;

				const filteredPRs = fileManager.filterPullRequests(
					effectiveRepo,
					pullRequestsToFilter,
				);

				this.noticeManager.debug(
					`Processing ${filteredPRs.length} pull requests (from ${openPullRequests.length} open PRs) for ${effectiveRepo.repository}`,
				);

				const currentPRNumbers = new Set(
					filteredPRs.map((pr: any) => pr.number.toString()),
				);

				await fileManager.createPullRequestFiles(
					effectiveRepo,
					filteredPRs,
					allPullRequestsIncludingRecentlyClosed,
					currentPRNumbers,
				);
			}

			await fileManager.cleanupEmptyFolders();
			this.noticeManager.success(`Successfully synced ${repositoryName}`);
		} catch (error: unknown) {
			this.noticeManager.error(
				`Error syncing repository ${repositoryName}`,
				error,
			);
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Sync a single project by ID (GitHub-only)
	 */
	async syncSingleProject(projectId: string) {
		if (this.isSyncing) {
			this.noticeManager.warning("Already syncing...");
			return;
		}

		const ghProvider =
			this.providerRegistry.get("github") ??
			this.providerRegistry.getByType("github")[0];
		if (!ghProvider?.isReady() || !ghProvider.supportsProjects()) {
			this.noticeManager.error(
				"GitHub provider not initialized or doesn't support projects",
			);
			return;
		}

		const project = this.settings.trackedProjects.find(
			(p) => p.id === projectId,
		);

		if (!project) {
			this.noticeManager.error(
				`Project ${projectId} not found in settings`,
			);
			return;
		}

		const hasAnyFolder =
			project.issueFolder ||
			project.pullRequestFolder ||
			project.customIssueFolder ||
			project.customPullRequestFolder;

		if (!hasAnyFolder) {
			this.noticeManager.warning(
				`No folder configured for project ${project.title}. Please configure a folder in project settings.`,
			);
			return;
		}

		this.isSyncing = true;
		try {
			this.noticeManager.info(`Syncing project: ${project.title}`);

			const items = await ghProvider.fetchProjectItems!(project.id);

			if (items.length === 0) {
				this.noticeManager.info(
					`No items found in project ${project.title}`,
				);
			} else {
				const ghFileManager =
					this.getFileManagerForProvider(ghProvider);
				await ghFileManager.createProjectItemFiles(project, items);
				this.noticeManager.success(
					`Successfully synced ${items.length} items from ${project.title}`,
				);
			}
		} catch (error: unknown) {
			this.noticeManager.error(
				`Error syncing project ${project.title}`,
				error,
			);
		} finally {
			this.isSyncing = false;
		}
	}

	async onload() {
		await this.loadSettings();

		this.noticeManager = new NoticeManager(this.settings);
		this.initializeProviders();

		// Check if any provider is ready and fetch current user
		for (const provider of this.providerRegistry.getEnabled()) {
			if (provider.type === "github") {
				this.currentUser = await provider.fetchAuthenticatedUser();
				break;
			}
		}

		if (
			this.settings.syncOnStartup &&
			this.providerRegistry.getEnabled().length > 0
		) {
			new Promise((resolve) => setTimeout(resolve, 750)).then(
				async () => {
					await this.sync();
				},
			);
		}
		const ribbonIconEl = this.addRibbonIcon(
			"refresh-cw",
			"Issue Tracker",
			async (evt: MouseEvent) => {
				if (this.providerRegistry.getEnabled().length === 0) {
					new Notice(
						"Please set your provider token in settings first",
					);
					return;
				}
				await this.sync();
			},
		);
		ribbonIconEl.addClass("issue-tracker-ribbon-class");

		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Issue Tracker");
		this.addCommand({
			id: "sync-issues-and-pull-requests",
			name: "Sync all issues & pull requests",
			callback: () => this.sync(),
		});

		// Register Kanban View (GitHub-only)
		this.registerView(
			KANBAN_VIEW_TYPE,
			(leaf) =>
				new GitHubKanbanView(
					leaf,
					this.settings,
					this.providerRegistry.get("github") ??
						this.providerRegistry.getByType("github")[0] ??
						null,
				),
		);

		this.addCommand({
			id: "open-kanban-view",
			name: "Open GitHub Projects Kanban",
			callback: () => this.openKanbanView(),
		});

		this.addSettingTab(new IssueTrackerSettingTab(this.app, this));
		this.startBackgroundSync();
	}

	/**
	 * Initialize or re-initialize all configured providers.
	 */
	private initializeProviders(): void {
		this.providerRegistry.dispose();
		this.fileManagers.clear();

		for (const config of this.settings.providers) {
			if (!config.enabled) continue;

			let provider: IssueProvider;
			if (config.type === "github") {
				provider = new GitHubProvider(
					this.settings,
					this.noticeManager,
					() => this.getProviderToken(config.id),
					config,
				);
			} else if (config.type === "gitlab") {
				provider = new GitLabProvider(
					this.settings,
					this.noticeManager,
					() => this.getProviderToken(config.id),
					config,
				);
			} else {
				continue;
			}

			this.providerRegistry.register(provider);
		}

		// Keep legacy alias
		this.gitHubClient = this.providerRegistry.get("github") ?? null;
	}

	private async openKanbanView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(KANBAN_VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getLeaf();
		await leaf.setViewState({
			type: KANBAN_VIEW_TYPE,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
	}

	onunload() {
		this.stopBackgroundSync();
		this.providerRegistry.dispose();
	}

	stopBackgroundSync(): void {
		if (this.backgroundSyncIntervalId !== null) {
			clearInterval(this.backgroundSyncIntervalId);
			this.backgroundSyncIntervalId = null;
			this.noticeManager.debug("Background sync stopped.");
		}
	}

	startBackgroundSync(): void {
		this.stopBackgroundSync();
		if (
			this.settings.enableBackgroundSync &&
			this.settings.backgroundSyncInterval > 0
		) {
			const intervalMillis =
				this.settings.backgroundSyncInterval * 60 * 1000;
			this.backgroundSyncIntervalId = window.setInterval(async () => {
				if (this.providerRegistry.getEnabled().length > 0) {
					this.noticeManager.debug("Triggering background sync.");
					await this.sync();
				} else {
					this.noticeManager.debug(
						"Skipping background sync: no providers ready.",
					);
				}
			}, intervalMillis);
			this.noticeManager.info(
				`Background sync scheduled every ${this.settings.backgroundSyncInterval} minutes.`,
			);
		}
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

		// === Provider Migration: migrate old single-token format to providers array ===
		const legacy = loadedData as any;
		if (!legacy?.providers || legacy.providers.length === 0) {
			this.settings.providers = [
				{
					id: "github",
					type: "github" as ProviderType,
					enabled: true,
					token: legacy?.githubToken ?? "",
					useSecretStorage: legacy?.useSecretStorage ?? false,
					secretTokenName: legacy?.secretTokenName ?? "",
				},
				{
					id: "gitlab",
					type: "gitlab" as ProviderType,
					enabled: false,
					token: "",
					useSecretStorage: false,
					secretTokenName: "",
					baseUrl: "",
				},
			];
			// Clear legacy fields
			delete (this.settings as any).githubToken;
			delete (this.settings as any).useSecretStorage;
			delete (this.settings as any).secretTokenName;
			await this.saveData(this.settings);
		}

		// === Provider type migration: add 'type' field to existing ProviderConfigs ===
		let needsProviderTypeMigration = false;
		for (const pc of this.settings.providers) {
			if (!pc.type) {
				// Derive type from id for legacy configs
				if (pc.id === "github") {
					pc.type = "github";
				} else if (pc.id === "gitlab" || pc.id.startsWith("gitlab")) {
					pc.type = "gitlab";
				} else {
					pc.type = "github"; // safe fallback
				}
				needsProviderTypeMigration = true;
			}
		}
		if (needsProviderTypeMigration) {
			await this.saveData(this.settings);
		}

		// Ensure each repo has a provider field
		let needsProviderMigration = false;
		for (const repo of this.settings.repositories) {
			if (!repo.provider) {
				repo.provider = "github";
				needsProviderMigration = true;
			}
		}
		if (needsProviderMigration) {
			await this.saveData(this.settings);
		}

		// Ensure globalDefaults exists (migration for existing users)
		if (!this.settings.globalDefaults) {
			this.settings.globalDefaults = Object.assign(
				{},
				DEFAULT_SETTINGS.globalDefaults,
			);
		}

		// === Profile Migration ===
		if (!this.settings.profiles || this.settings.profiles.length === 0) {
			this.settings.profiles = [];

			// Create "Default Profile" from existing globalDefaults
			const defaultProfile: SettingsProfile = {
				id: "default",
				name: "Default Profile",
				type: "repository",
				issueUpdateMode: this.settings.globalDefaults.issueUpdateMode,
				allowDeleteIssue: this.settings.globalDefaults.allowDeleteIssue,
				issueFolder: this.settings.globalDefaults.issueFolder,
				issueNoteTemplate:
					this.settings.globalDefaults.issueNoteTemplate,
				issueContentTemplate:
					this.settings.globalDefaults.issueContentTemplate,
				useCustomIssueContentTemplate:
					this.settings.globalDefaults.useCustomIssueContentTemplate,
				includeIssueComments:
					this.settings.globalDefaults.includeIssueComments,
				pullRequestUpdateMode:
					this.settings.globalDefaults.pullRequestUpdateMode,
				allowDeletePullRequest:
					this.settings.globalDefaults.allowDeletePullRequest,
				pullRequestFolder:
					this.settings.globalDefaults.pullRequestFolder,
				pullRequestNoteTemplate:
					this.settings.globalDefaults.pullRequestNoteTemplate,
				pullRequestContentTemplate:
					this.settings.globalDefaults.pullRequestContentTemplate,
				useCustomPullRequestContentTemplate:
					this.settings.globalDefaults
						.useCustomPullRequestContentTemplate,
				includePullRequestComments:
					this.settings.globalDefaults.includePullRequestComments,
				includeClosedIssues:
					this.settings.globalDefaults.includeClosedIssues,
				includeClosedPullRequests:
					this.settings.globalDefaults.includeClosedPullRequests,
			};
			this.settings.profiles.push(defaultProfile);

			// Create "Default Project Profile"
			this.settings.profiles.push({ ...DEFAULT_PROJECT_PROFILE });

			// Migrate repositories
			this.settings.repositories = this.settings.repositories.map(
				(repo) => {
					const merged = Object.assign(
						{},
						DEFAULT_REPOSITORY_TRACKING,
						repo,
					);

					if ((repo as any).ignoreGlobalSettings) {
						// Repo had custom settings - create a dedicated profile
						const customProfileId = `migrated-${repo.repository.replace(/\//g, "-")}-${Date.now()}`;
						const customProfile: SettingsProfile = {
							id: customProfileId,
							name: `${repo.repository} (migrated)`,
							type: "repository",
							issueUpdateMode: merged.issueUpdateMode,
							allowDeleteIssue: merged.allowDeleteIssue,
							issueFolder: merged.issueFolder,
							issueNoteTemplate: merged.issueNoteTemplate,
							issueContentTemplate: merged.issueContentTemplate,
							useCustomIssueContentTemplate:
								merged.useCustomIssueContentTemplate,
							includeIssueComments: merged.includeIssueComments,
							pullRequestUpdateMode: merged.pullRequestUpdateMode,
							allowDeletePullRequest:
								merged.allowDeletePullRequest,
							pullRequestFolder: merged.pullRequestFolder,
							pullRequestNoteTemplate:
								merged.pullRequestNoteTemplate,
							pullRequestContentTemplate:
								merged.pullRequestContentTemplate,
							useCustomPullRequestContentTemplate:
								merged.useCustomPullRequestContentTemplate,
							includePullRequestComments:
								merged.includePullRequestComments,
							includeClosedIssues: merged.includeClosedIssues,
							includeClosedPullRequests:
								merged.includeClosedPullRequests,
						};
						this.settings.profiles.push(customProfile);
						merged.profileId = customProfileId;
					} else {
						merged.profileId = "default";
					}

					// Clean up deprecated field
					delete (merged as any).ignoreGlobalSettings;

					return merged;
				},
			);

			// Save migrated settings
			await this.saveData(this.settings);
		}

		// Cleanup: Remove empty migrated profiles and reassign repos to default
		let needsCleanup = false;
		for (const repo of this.settings.repositories) {
			if (repo.profileId && repo.profileId.startsWith("migrated-")) {
				const profile = this.settings.profiles.find(
					(p) => p.id === repo.profileId,
				);
				if (profile) {
					const hasCustomValues =
						profile.issueUpdateMode !== undefined ||
						profile.allowDeleteIssue !== undefined ||
						profile.issueFolder !== undefined ||
						profile.issueNoteTemplate !== undefined ||
						profile.issueContentTemplate !== undefined ||
						profile.useCustomIssueContentTemplate !== undefined ||
						profile.includeIssueComments !== undefined ||
						profile.pullRequestUpdateMode !== undefined ||
						profile.allowDeletePullRequest !== undefined ||
						profile.pullRequestFolder !== undefined ||
						profile.pullRequestNoteTemplate !== undefined ||
						profile.pullRequestContentTemplate !== undefined ||
						profile.useCustomPullRequestContentTemplate !==
							undefined ||
						profile.includePullRequestComments !== undefined ||
						profile.includeClosedIssues !== undefined ||
						profile.includeClosedPullRequests !== undefined ||
						profile.trackIssues !== undefined ||
						profile.trackPullRequest !== undefined;
					if (!hasCustomValues) {
						repo.profileId = "default";
						needsCleanup = true;
					}
				}
			}
		}
		if (needsCleanup) {
			// Remove orphaned profiles (no repo references them)
			const usedProfileIds = new Set(
				this.settings.repositories.map((r) => r.profileId),
			);
			this.settings.profiles = this.settings.profiles.filter(
				(p) =>
					p.id === "default" ||
					p.id === "default-project" ||
					usedProfileIds.has(p.id),
			);
			await this.saveData(this.settings);
		}

		// Migrate repos that still have old per-repo settings into their own profiles
		const defaultProfile =
			this.settings.profiles.find((p) => p.id === "default") ??
			DEFAULT_REPOSITORY_PROFILE;
		let needsSave = false;
		this.settings.repositories = this.settings.repositories.map((repo) => {
			// Skip repos that already have a non-default profile assigned
			if (repo.profileId && repo.profileId !== "default") {
				delete (repo as any).ignoreGlobalSettings;
				return repo;
			}

			// Check if repo actually has any profile-managed fields to migrate
			// (after stripProfileFieldsFromRepo they won't exist anymore)
			const hasProfileFields =
				(repo as any).issueUpdateMode !== undefined ||
				(repo as any).issueFolder !== undefined ||
				(repo as any).issueNoteTemplate !== undefined ||
				(repo as any).pullRequestUpdateMode !== undefined ||
				(repo as any).pullRequestFolder !== undefined ||
				(repo as any).pullRequestNoteTemplate !== undefined;

			if (!hasProfileFields) {
				// No profile-managed fields on repo-  nothing to migrate
				if (!repo.profileId) repo.profileId = "default";
				delete (repo as any).ignoreGlobalSettings;
				return repo;
			}

			const merged = Object.assign({}, DEFAULT_REPOSITORY_TRACKING, repo);

			// Check if repo has values that differ from the default profile
			const hasDiff =
				merged.issueUpdateMode !==
					(defaultProfile.issueUpdateMode ?? "none") ||
				merged.allowDeleteIssue !==
					(defaultProfile.allowDeleteIssue ?? true) ||
				merged.issueFolder !==
					(defaultProfile.issueFolder ?? "GitHub") ||
				merged.issueNoteTemplate !==
					(defaultProfile.issueNoteTemplate ?? "Issue - {number}") ||
				(merged.issueContentTemplate || "") !==
					(defaultProfile.issueContentTemplate ?? "") ||
				merged.includeIssueComments !==
					(defaultProfile.includeIssueComments ?? true) ||
				merged.includeClosedIssues !==
					(defaultProfile.includeClosedIssues ?? false) ||
				merged.pullRequestUpdateMode !==
					(defaultProfile.pullRequestUpdateMode ?? "none") ||
				merged.allowDeletePullRequest !==
					(defaultProfile.allowDeletePullRequest ?? true) ||
				merged.pullRequestFolder !==
					(defaultProfile.pullRequestFolder ??
						"GitHub Pull Requests") ||
				merged.pullRequestNoteTemplate !==
					(defaultProfile.pullRequestNoteTemplate ??
						"PR - {number}") ||
				(merged.pullRequestContentTemplate || "") !==
					(defaultProfile.pullRequestContentTemplate ?? "") ||
				merged.includePullRequestComments !==
					(defaultProfile.includePullRequestComments ?? true) ||
				merged.includeClosedPullRequests !==
					(defaultProfile.includeClosedPullRequests ?? false) ||
				(merged.includeSubIssues ?? false) !==
					(defaultProfile.includeSubIssues ?? false);

			if (hasDiff) {
				// Repo has custom values - create a dedicated profile
				const customProfileId = `migrated-${repo.repository.replace(/\//g, "-")}-${Date.now()}`;
				const customProfile: SettingsProfile = {
					id: customProfileId,
					name: `${repo.repository}`,
					type: "repository",
					issueUpdateMode: merged.issueUpdateMode,
					allowDeleteIssue: merged.allowDeleteIssue,
					issueFolder: merged.issueFolder,
					issueNoteTemplate: merged.issueNoteTemplate,
					issueContentTemplate: merged.issueContentTemplate,
					useCustomIssueContentTemplate:
						merged.useCustomIssueContentTemplate,
					includeIssueComments: merged.includeIssueComments,
					pullRequestUpdateMode: merged.pullRequestUpdateMode,
					allowDeletePullRequest: merged.allowDeletePullRequest,
					pullRequestFolder: merged.pullRequestFolder,
					pullRequestNoteTemplate: merged.pullRequestNoteTemplate,
					pullRequestContentTemplate:
						merged.pullRequestContentTemplate,
					useCustomPullRequestContentTemplate:
						merged.useCustomPullRequestContentTemplate,
					includePullRequestComments:
						merged.includePullRequestComments,
					includeClosedIssues: merged.includeClosedIssues,
					includeClosedPullRequests: merged.includeClosedPullRequests,
					includeSubIssues: merged.includeSubIssues ?? false,
				};
				this.settings.profiles.push(customProfile);
				repo.profileId = customProfileId;
				needsSave = true;
			} else {
				repo.profileId = "default";
			}

			delete (repo as any).ignoreGlobalSettings;
			return repo;
		});
		if (needsSave) {
			await this.saveData(this.settings);
		}

		// Migrate assigneeFilterMode/prAssigneeFilterMode/prReviewerFilterMode from string to array
		let needsFilterMigration = false;
		this.settings.repositories = this.settings.repositories.map((repo) => {
			const r = repo as any;
			if (r.assigneeFilterMode !== undefined && !r.assigneeFilterModes) {
				r.assigneeFilterModes = [r.assigneeFilterMode];
				needsFilterMigration = true;
			}
			if (
				r.prAssigneeFilterMode !== undefined &&
				!r.prAssigneeFilterModes
			) {
				r.prAssigneeFilterModes = [r.prAssigneeFilterMode];
				needsFilterMigration = true;
			}
			if (
				r.prReviewerFilterMode !== undefined &&
				!r.prReviewerFilterModes
			) {
				r.prReviewerFilterModes = [r.prReviewerFilterMode];
				needsFilterMigration = true;
			}
			return repo;
		});
		if (needsFilterMigration) {
			await this.saveData(this.settings);
		}

		// Migrate existing repositories to include new custom folder properties
		// Defaults first, then override with saved values
		this.settings.repositories = this.settings.repositories.map((repo) => {
			const merged = Object.assign({}, DEFAULT_REPOSITORY_TRACKING, repo);
			if (!merged.profileId) merged.profileId = "default";
			return merged;
		});

		// Migrate trackIssues/trackPullRequest from repos into their profiles
		let needsTrackMigration = false;
		for (const repo of this.settings.repositories) {
			// Check if repo still has trackIssues/trackPullRequest explicitly set
			// (they are now optional and profile-managed)
			if (
				(repo as any).trackIssues !== undefined ||
				(repo as any).trackPullRequest !== undefined
			) {
				const profileId = repo.profileId || "default";
				// Only migrate into non-default profiles (default profile would affect all repos)
				if (profileId !== "default") {
					const profile = this.settings.profiles.find(
						(p) => p.id === profileId,
					);
					if (profile && profile.type === "repository") {
						if (
							profile.trackIssues === undefined &&
							(repo as any).trackIssues !== undefined
						) {
							profile.trackIssues = (repo as any).trackIssues;
						}
						if (
							profile.trackPullRequest === undefined &&
							(repo as any).trackPullRequest !== undefined
						) {
							profile.trackPullRequest = (
								repo as any
							).trackPullRequest;
						}
					}
				}
				// Remove migrated fields from repo so migration doesn't re-trigger
				delete (repo as any).trackIssues;
				delete (repo as any).trackPullRequest;
				needsTrackMigration = true;
			}
		}
		if (needsTrackMigration) {
			await this.saveData(this.settings);
		}

		// Hydrate profile-managed fields onto each repo from its profile
		this.settings.repositories = this.settings.repositories.map((repo) => {
			return getEffectiveRepoSettings(repo, this.settings);
		});
	}

	async saveSettings() {
		// Sync "default" profile back to globalDefaults for backward compatibility
		const defaultProfile = this.settings.profiles.find(
			(p) => p.id === "default",
		);
		if (defaultProfile) {
			this.settings.globalDefaults = {
				issueUpdateMode: defaultProfile.issueUpdateMode ?? "none",
				allowDeleteIssue: defaultProfile.allowDeleteIssue ?? true,
				issueFolder: defaultProfile.issueFolder ?? "GitHub",
				issueNoteTemplate:
					defaultProfile.issueNoteTemplate ?? "Issue - {number}",
				issueContentTemplate: defaultProfile.issueContentTemplate ?? "",
				useCustomIssueContentTemplate:
					defaultProfile.useCustomIssueContentTemplate ?? false,
				includeIssueComments:
					defaultProfile.includeIssueComments ?? true,
				pullRequestUpdateMode:
					defaultProfile.pullRequestUpdateMode ?? "none",
				allowDeletePullRequest:
					defaultProfile.allowDeletePullRequest ?? true,
				pullRequestFolder:
					defaultProfile.pullRequestFolder ?? "GitHub Pull Requests",
				pullRequestNoteTemplate:
					defaultProfile.pullRequestNoteTemplate ?? "PR - {number}",
				pullRequestContentTemplate:
					defaultProfile.pullRequestContentTemplate ?? "",
				useCustomPullRequestContentTemplate:
					defaultProfile.useCustomPullRequestContentTemplate ?? false,
				includePullRequestComments:
					defaultProfile.includePullRequestComments ?? true,
				includeClosedIssues:
					defaultProfile.includeClosedIssues ?? false,
				includeClosedPullRequests:
					defaultProfile.includeClosedPullRequests ?? false,
			};
		}

		// Strip profile-managed fields from repos before persisting
		const dataToSave = {
			...this.settings,
			repositories: this.settings.repositories.map((repo) =>
				stripProfileFieldsFromRepo(repo),
			),
		};
		await this.saveData(dataToSave);

		// Re-hydrate in-memory repos so profile changes take effect immediately
		// Mutate existing objects in place to preserve closure references in the UI
		for (const repo of this.settings.repositories) {
			const effective = getEffectiveRepoSettings(repo, this.settings);
			Object.assign(repo, effective);
		}

		const token = this.getProviderToken("github");
		if (token) {
			(
				this.providerRegistry.get("github") ??
				this.providerRegistry.getByType("github")[0]
			)?.initializeClient();
		}
		// Re-initialize providers if config changed
		this.initializeProviders();
		if (this.noticeManager) {
			this.noticeManager = new NoticeManager(this.settings);
		}
		this.startBackgroundSync();
	}

	/**
	 * Fetch available repositories from a specific provider
	 */
	async fetchAvailableRepositories(providerId?: ProviderId) {
		const pid = providerId ?? "github";
		const provider = this.providerRegistry.get(pid);
		if (!provider) {
			this.noticeManager.error(`${pid} provider not initialized`);
			return [];
		}

		const token = this.getProviderToken(pid);
		if (!token) {
			this.noticeManager.error(
				`No ${pid} token provided. Please add your token in the settings.`,
			);
			return [];
		}

		try {
			provider.initializeClient();

			if (provider.type === "github" && !this.currentUser) {
				this.currentUser = await provider.fetchAuthenticatedUser();
			}

			return await provider.fetchAvailableRepositories();
		} catch (error: unknown) {
			this.noticeManager.error(
				"Error fetching available repositories",
				error,
			);
			return [];
		}
	}

	/**
	 * Fetch and process issues for all repositories
	 */
	private async fetchIssues() {
		try {
			for (const repo of this.settings.repositories) {
				const [owner, repoName] = repo.repository.split("/");
				if (!owner || !repoName) continue;

				const provider = this.getProviderForRepo(repo);
				if (!provider?.isReady()) continue;
				this.noticeManager.setProviderPrefix(provider.displayName);

				const fileManager = this.getFileManagerForProvider(provider);
				const extra = this.getExtraParams(repo);

				try {
					const effectiveRepo = getEffectiveRepoSettings(
						repo,
						this.settings,
					);
					if (!effectiveRepo.trackIssues) continue;
					this.noticeManager.debug(
						`Fetching issues for ${effectiveRepo.repository}`,
					);
					const allIssuesIncludingRecentlyClosed =
						await provider.fetchRepositoryIssues(
							owner,
							repoName,
							true,
							this.settings.cleanupClosedIssuesDays,
							extra,
						);

					const openIssues = allIssuesIncludingRecentlyClosed.filter(
						(issue: { state: string }) => issue.state === "open",
					);

					const issuesToFilter = effectiveRepo.includeClosedIssues
						? allIssuesIncludingRecentlyClosed
						: openIssues;

					const filteredIssues = fileManager.filterIssues(
						effectiveRepo,
						issuesToFilter,
					);

					this.noticeManager.debug(
						`Found ${allIssuesIncludingRecentlyClosed.length} total issues (${openIssues.length} open), ${filteredIssues.length} match filters for file creation/update`,
					);
					const currentIssueNumbers = new Set(
						filteredIssues.map((issue: { number: number }) =>
							issue.number.toString(),
						),
					);

					await fileManager.createIssueFiles(
						effectiveRepo,
						filteredIssues,
						allIssuesIncludingRecentlyClosed,
						currentIssueNumbers,
					);

					this.noticeManager.debug(
						`Processed ${filteredIssues.length} open issues for ${effectiveRepo.repository}`,
					);
				} catch (repoError: unknown) {
					this.noticeManager.error(
						`Error processing issues for repository ${repo.repository}`,
						repoError,
					);
				}
			}
		} catch (error: unknown) {
			this.noticeManager.error("Error fetching issues", error);
		}
	}

	/**
	 * Fetch and process pull requests for all repositories
	 */
	private async fetchPullRequests() {
		try {
			for (const repo of this.settings.repositories) {
				const [owner, repoName] = repo.repository.split("/");
				if (!owner || !repoName) continue;

				const provider = this.getProviderForRepo(repo);
				if (!provider?.isReady()) continue;
				this.noticeManager.setProviderPrefix(provider.displayName);

				const fileManager = this.getFileManagerForProvider(provider);
				const extra = this.getExtraParams(repo);

				try {
					const effectiveRepo = getEffectiveRepoSettings(
						repo,
						this.settings,
					);
					if (!effectiveRepo.trackPullRequest) continue;
					this.noticeManager.debug(
						`Fetching pull requests for ${effectiveRepo.repository}`,
					);

					const allPullRequestsIncludingRecentlyClosed =
						await provider.fetchRepositoryPullRequests(
							owner,
							repoName,
							true,
							this.settings.cleanupClosedIssuesDays,
							extra,
						);

					const openPullRequests =
						allPullRequestsIncludingRecentlyClosed.filter(
							(pr: { state: string }) => pr.state === "open",
						);

					const pullRequestsToFilter =
						effectiveRepo.includeClosedPullRequests
							? allPullRequestsIncludingRecentlyClosed
							: openPullRequests;

					const filteredPRs = fileManager.filterPullRequests(
						effectiveRepo,
						pullRequestsToFilter,
					);

					this.noticeManager.debug(
						`Found ${allPullRequestsIncludingRecentlyClosed.length} total pull requests (${openPullRequests.length} open), ${filteredPRs.length} match filters for file creation/update`,
					);

					const currentPRNumbers = new Set(
						filteredPRs.map((pr: { number: number }) =>
							pr.number.toString(),
						),
					);

					await fileManager.createPullRequestFiles(
						effectiveRepo,
						filteredPRs,
						allPullRequestsIncludingRecentlyClosed,
						currentPRNumbers,
					);

					this.noticeManager.debug(
						`Processed ${filteredPRs.length} open pull requests for ${effectiveRepo.repository}`,
					);
				} catch (repoError: unknown) {
					this.noticeManager.error(
						`Error processing pull requests for repository ${repo.repository}`,
						repoError,
					);
				}
			}
		} catch (error: unknown) {
			this.noticeManager.error("Error fetching pull requests", error);
		}
	}

	public showNotice(
		message: string,
		type: "info" | "warning" | "error" | "success" | "debug" = "info",
	): void {
		if (!this.noticeManager) {
			new Notice(message);
			return;
		}

		switch (type) {
			case "info":
				this.noticeManager.info(message);
				break;
			case "warning":
				this.noticeManager.warning(message);
				break;
			case "error":
				this.noticeManager.error(message);
				break;
			case "success":
				this.noticeManager.success(message);
				break;
			case "debug":
				this.noticeManager.debug(message);
				break;
			default:
				this.noticeManager.info(message);
				break;
		}
	}
}
