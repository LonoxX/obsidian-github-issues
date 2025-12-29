import { App, TFile } from "obsidian";
import { GitHubTrackerSettings, RepositoryTracking, ProjectData } from "./types";
import { escapeBody } from "./util/escapeUtils";
import { NoticeManager } from "./notice-manager";
import { GitHubClient } from "./github-client";
import {
	createPullRequestTemplateData,
	processFilenameTemplate
} from "./util/templateUtils";
import { getEffectiveRepoSettings } from "./util/settingsUtils";
import { extractPersistBlocks, mergePersistBlocks } from "./util/persistUtils";
import { shouldUpdateContent, hasStatusChanged } from "./util/contentUtils";
import { FileHelpers } from "./util/file-helpers";
import { FolderPathManager } from "./folder-path-manager";
import { CleanupManager } from "./cleanup-manager";
import { ContentGenerator } from "./content-generator";

export class PullRequestFileManager {
	private fileHelpers: FileHelpers;
	private folderPathManager: FolderPathManager;
	private cleanupManager: CleanupManager;
	private contentGenerator: ContentGenerator;

	constructor(
		private app: App,
		private settings: GitHubTrackerSettings,
		private noticeManager: NoticeManager,
		private gitHubClient: GitHubClient,
	) {
		this.fileHelpers = new FileHelpers(app, noticeManager);
		this.folderPathManager = new FolderPathManager();
		this.cleanupManager = new CleanupManager(app, settings, noticeManager);
		this.contentGenerator = new ContentGenerator(this.fileHelpers);
	}

	/**
	 * Create pull request files for a repository
	 */
	public async createPullRequestFiles(
		repo: RepositoryTracking,
		openPullRequests: any[],
		allPullRequestsIncludingRecentlyClosed: any[],
		_currentPRNumbers: Set<string>,
	): Promise<void> {
		// Apply global defaults to repository settings
		const effectiveRepo = getEffectiveRepoSettings(repo, this.settings.globalDefaults);

		const [owner, repoName] = effectiveRepo.repository.split("/");
		if (!owner || !repoName) return;

		const repoCleaned = repoName.replace(/\//g, "-");
		const ownerCleaned = owner.replace(/\//g, "-");

		await this.cleanupManager.cleanupDeletedPullRequests(
			effectiveRepo,
			ownerCleaned,
			repoCleaned,
			allPullRequestsIncludingRecentlyClosed,
		);

		// Batch fetch project data if tracking is enabled globally
		let projectDataMap = new Map<string, ProjectData[]>();
		if (this.settings.enableProjectTracking) {
			const nodeIds = openPullRequests
				.filter((pr: any) => pr.node_id)
				.map((pr: any) => pr.node_id);

			if (nodeIds.length > 0) {
				this.noticeManager.debug(
					`Fetching project data for ${nodeIds.length} pull requests`
				);
				projectDataMap = await this.gitHubClient.fetchProjectDataForItems(nodeIds);
			}
		}

		// Get tracked project IDs from global settings
		const trackedProjectIds = this.settings.trackedProjects.map(p => p.id);

		// Create or update pull request files (openPullRequests contains filtered PRs from main.ts)
		for (const pr of openPullRequests) {
			let projectData = pr.node_id ? projectDataMap.get(pr.node_id) : undefined;

			// Filter by tracked projects from global settings
			if (projectData && trackedProjectIds.length > 0) {
				projectData = projectData.filter(p =>
					trackedProjectIds.includes(p.projectId)
				);
			}

			await this.createOrUpdatePullRequestFile(
				effectiveRepo,
				ownerCleaned,
				repoCleaned,
				pr,
				projectData,
			);
		}
	}

	private async createOrUpdatePullRequestFile(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		pr: any,
		projectData?: ProjectData[],
	): Promise<void> {
		// Generate filename using template
		const templateData = createPullRequestTemplateData(pr, repo.repository);
		const baseFileName = processFilenameTemplate(
			repo.pullRequestNoteTemplate || "PR - {number}",
			templateData,
			this.settings.dateFormat
		);
		const fileName = `${baseFileName}.md`;
		const pullRequestFolderPath = this.folderPathManager.getPullRequestFolderPath(repo, ownerCleaned, repoCleaned);

		// Ensure folder structure exists
		if (repo.useCustomPullRequestFolder && repo.customPullRequestFolder && repo.customPullRequestFolder.trim()) {
			// For custom folders, just ensure the custom path exists
			await this.fileHelpers.ensureFolderExists(repo.customPullRequestFolder.trim());
		} else {
			// For default structure, ensure nested path exists
			await this.fileHelpers.ensureFolderExists(repo.pullRequestFolder);
			await this.fileHelpers.ensureFolderExists(`${repo.pullRequestFolder}/${ownerCleaned}`);
			await this.fileHelpers.ensureFolderExists(`${repo.pullRequestFolder}/${ownerCleaned}/${repoCleaned}`);
		}

		const file = this.app.vault.getAbstractFileByPath(`${pullRequestFolderPath}/${fileName}`);

		const [owner, repoName] = repo.repository.split("/");

		// Only fetch comments if they should be included
		let comments: any[] = [];
		if (repo.includePullRequestComments) {
			comments = await this.gitHubClient.fetchPullRequestComments(
				owner,
				repoName,
				pr.number,
			);
		} else {
			this.noticeManager.debug(
				`Skipping comments for PR ${pr.number}: repository setting disabled`,
			);
		}

		let content = await this.contentGenerator.createPullRequestContent(pr, repo, comments, this.settings, projectData);

		if (file) {
			if (file instanceof TFile) {
				// Use current repository updateMode setting (not the old value from file properties)
				const updateMode = repo.pullRequestUpdateMode;

				// Read existing content to check for changes
				const existingContent = await this.app.vault.read(file);

				// Check if status has changed (e.g., open -> closed)
				const statusHasChanged = hasStatusChanged(existingContent, pr.state);

				// If status changed, always update regardless of updateMode
				// Otherwise, respect the updateMode setting
				if (statusHasChanged || updateMode === "update") {
					// Check if content needs updating based on updated_at field
					if (!statusHasChanged && !shouldUpdateContent(existingContent, pr.updated_at)) {
						this.noticeManager.debug(
							`Skipped update for PR ${pr.number}: no changes detected (updated_at match)`
						);
						return;
					}

					// Extract persist blocks from existing content
					const persistBlocks = extractPersistBlocks(existingContent);

					// Create the complete new content with updated frontmatter
					let updatedContent = await this.contentGenerator.createPullRequestContent(
						pr,
						repo,
						comments,
						this.settings,
						projectData,
					);

					// Merge persist blocks back into new content
					if (persistBlocks.size > 0) {
						updatedContent = mergePersistBlocks(updatedContent, existingContent, persistBlocks);
						this.noticeManager.debug(
							`Restored ${persistBlocks.size} persist block(s) for PR ${pr.number}`
						);
					}

					await this.app.vault.modify(file, updatedContent);
					if (statusHasChanged) {
						this.noticeManager.debug(`Updated PR ${pr.number} (status changed to ${pr.state})`);
					} else {
						this.noticeManager.debug(`Updated PR ${pr.number}`);
					}
				} else if (updateMode === "append") {
					const shouldEscapeHashTags = repo.ignoreGlobalSettings ? repo.escapeHashTags : this.settings.escapeHashTags;
					content = `---\n### New status: "${
						pr.state
					}"\n\n# ${escapeBody(
						pr.title,
						this.settings.escapeMode,
						false,
					)}\n${
						pr.body
							? escapeBody(pr.body, this.settings.escapeMode, shouldEscapeHashTags)
							: "No description found"
					}\n`;
					if (comments.length > 0) {
						content += this.fileHelpers.formatComments(
							comments,
							this.settings.escapeMode,
							this.settings.dateFormat,
							shouldEscapeHashTags,
						);
					}

					const currentFileContent = await this.app.vault.read(file);
					const newContent = currentFileContent + "\n\n" + content;
					await this.app.vault.modify(file, newContent);
					this.noticeManager.debug(
						`Appended content to PR ${pr.number}`,
					);
				} else {
					this.noticeManager.debug(
						`Skipped update for PR ${pr.number} (mode: ${updateMode})`,
					);
				}
			}
		} else {
			await this.app.vault.create(`${pullRequestFolderPath}/${fileName}`, content);
			this.noticeManager.debug(`Created PR file for ${pr.number}`);
		}
	}

	public async cleanupEmptyPullRequestFolder(
		repo: RepositoryTracking,
		pullRequestFolder: string,
		ownerCleaned: string,
	): Promise<void> {
		return this.cleanupManager.cleanupEmptyPullRequestFolder(repo, pullRequestFolder, ownerCleaned);
	}
}
