import {
	App,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
	setIcon,
	TextComponent,
	TFolder,
	AbstractInputSuggest,
	TAbstractFile,
} from "obsidian";
import { RepositoryTracking, DEFAULT_REPOSITORY_TRACKING, TrackedProject } from "./types";
import GitHubTrackerPlugin from "./main";
import { FolderSuggest } from "./settings/folder-suggest";
import { FileSuggest } from "./settings/file-suggest";
import { RepositoryRenderer } from "./settings/repository-renderer";
import { UIHelpers } from "./settings/ui-helpers";
import { RepositoryListManager } from "./settings/repository-list-manager";
import { ModalManager } from "./settings/modal-manager";
import { ProjectListManager } from "./settings/project-list-manager";
import { ProjectRenderer } from "./settings/project-renderer";

export class GitHubTrackerSettingTab extends PluginSettingTab {
	private selectedRepositories: Set<string> = new Set();
	private repositoryRenderer: RepositoryRenderer;
	private repositoryListManager: RepositoryListManager;
	private modalManager: ModalManager;
	private projectListManager: ProjectListManager;
	private projectRenderer: ProjectRenderer;

	constructor(
		app: App,
		private plugin: GitHubTrackerPlugin,
	) {
		super(app, plugin);

		// Initialize managers
		this.modalManager = new ModalManager(this.app, this.plugin);
		this.repositoryRenderer = new RepositoryRenderer(
			this.app,
			this.plugin,
			(repoName, repo, filterType, textArea) => this.modalManager.fetchAndShowRepositoryLabels(repoName, repo, filterType, textArea),
			(repoName, repo, filterType, textArea) => this.modalManager.fetchAndShowRepositoryCollaborators(repoName, repo, filterType, textArea)
		);
		this.repositoryListManager = new RepositoryListManager(this.app, this.plugin);
		this.projectListManager = new ProjectListManager(this.app, this.plugin);
		this.projectRenderer = new ProjectRenderer(this.app, this.plugin);
	}	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.addClass("github-issues");

		// Header
		const headerEl = containerEl.createEl("div", { cls: "github-issues-settings-header" });
		headerEl.createEl("h2", { text: "GitHub Issues & Pull Requests" });

		const subtitleContainer = headerEl.createDiv({ cls: "github-issues-settings-subtitle" });
		subtitleContainer.createSpan({ text: "Sync your GitHub issues and pull requests in Obsidian" });

		const linksContainer = subtitleContainer.createDiv({ cls: "github-issues-subtitle-links" });

		const bugLink = linksContainer.createEl("a", {
			href: "https://github.com/LonoxX/obsidian-github-issues/issues/new",
			cls: "github-issues-bug-link",
		});
		bugLink.setAttribute("target", "_blank");
		const bugIcon = bugLink.createSpan({ cls: "github-issues-link-icon" });
		setIcon(bugIcon, "bug");
		bugLink.createSpan({ text: "Report Bug" });

		linksContainer.createSpan({ text: " • " });

		const sponsorLink = linksContainer.createEl("a", {
			href: "https://github.com/sponsors/LonoxX",
			cls: "github-issues-sponsor-link",
		});
		sponsorLink.setAttribute("target", "_blank");
		const sponsorIcon = sponsorLink.createSpan({ cls: "github-issues-link-icon" });
		setIcon(sponsorIcon, "heart");
		sponsorLink.createSpan({ text: "Support me" });

		linksContainer.createSpan({ text: " • " });

		const kofiLink = linksContainer.createEl("a", {
			href: "https://ko-fi.com/lonoxx",
			cls: "github-issues-kofi-link",
		});
		kofiLink.setAttribute("target", "_blank");
		const kofiIcon = kofiLink.createSpan({ cls: "github-issues-link-icon" });
		setIcon(kofiIcon, "coffee");
		kofiLink.createSpan({ text: "Ko-fi" });

		linksContainer.createSpan({ text: " • " });

		const bmcLink = linksContainer.createEl("a", {
			href: "https://buymeacoffee.com/lonoxx",
			cls: "github-issues-bmc-link",
		});
		bmcLink.setAttribute("target", "_blank");
		const bmcIcon = bmcLink.createSpan({ cls: "github-issues-link-icon" });
		setIcon(bmcIcon, "pizza");
		bmcLink.createSpan({ text: "Buy me a Pizza" });

		// Authentication Section
		const authContainer = containerEl.createDiv("github-issues-settings-group github-issues-settings-group-compact");
		new Setting(authContainer).setName("Authentication").setHeading();

		const tokenSetting = new Setting(authContainer)
			.setName("GitHub token")
			.setDesc("Your GitHub personal access token");

		let isTokenVisible = false;
		const tokenInput = tokenSetting.addText((text) => {
			text
				.setPlaceholder("Enter your GitHub token")
				.setValue(this.plugin.settings.githubToken)
				.onChange(async (value) => {
					this.plugin.settings.githubToken = value;
					await this.plugin.saveSettings();
					this.updateTokenBadge(); // Update badge when token changes
				});
			text.inputEl.type = "password";
			return text;
		});

		tokenSetting.addButton((button) => {
			button
				.setIcon("eye")
				.setTooltip("Show/hide token")
				.onClick(() => {
					isTokenVisible = !isTokenVisible;
					const inputEl = tokenSetting.controlEl.querySelector("input");
					if (inputEl) {
						inputEl.type = isTokenVisible ? "text" : "password";
					}
					button.setIcon(isTokenVisible ? "eye-off" : "eye");
				});
		});

		// Add token status badge
		const tokenBadgeContainer = authContainer.createDiv("github-issues-token-badge-container");
		// Update badge asynchronously without blocking the UI
		setTimeout(() => this.updateTokenBadge(tokenBadgeContainer), 0);

		const tokenInfo = authContainer.createEl("p", {
			text: "Please limit the token to the minimum permissions needed. Requirements are Issues, Pull Requests, and Repositories. ",
		});
		tokenInfo.addClass("github-issues-info-text");

		const infoLink = tokenInfo.createEl("a", {
			text: "Learn more",
		});
		infoLink.addClass("github-issues-info-link");
		infoLink.href =
			"https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token";
		infoLink.target = "_blank";

		// Sync Settings Section
		const syncContainer = containerEl.createDiv("github-issues-settings-group");
		new Setting(syncContainer).setName("Sync Settings").setHeading();

		new Setting(syncContainer)
			.setName("Sync on startup")
			.setDesc("Automatically sync when Obsidian starts")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syncOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.syncOnStartup = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(syncContainer)
			.setName("Enable background sync")
			.setDesc("Automatically sync periodically in the background")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBackgroundSync)
					.onChange(async (value) => {
						this.plugin.settings.enableBackgroundSync = value;
						await this.plugin.saveSettings();
						this.display(); // Refresh settings tab to show/hide interval
					}),
			);

		if (this.plugin.settings.enableBackgroundSync) {
			new Setting(syncContainer)
				.setName("Background sync interval")
				.setDesc("How often to sync in the background (minutes, min: 5)")
				.addText((text) =>
					text
						.setPlaceholder("30")
						.setValue(
							this.plugin.settings.backgroundSyncInterval.toString(),
						)
						.onChange(async (value) => {
							let numValue = parseInt(value, 10);
							if (isNaN(numValue) || numValue < 5) {
								numValue = 5;
								this.plugin.showNotice(
									"Background sync interval set to minimum 5 minutes.",
									"warning",
								);
							}
							this.plugin.settings.backgroundSyncInterval =
								numValue;
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(syncContainer)
			.setName("Cleanup closed items after (days)")
			.setDesc("Delete local files for items closed longer than this many days")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(
						this.plugin.settings.cleanupClosedIssuesDays.toString(),
					)
					.onChange(async (value) => {
						let numValue = parseInt(value, 10);
						if (isNaN(numValue) || numValue < 1) {
							numValue = 1;
							this.plugin.showNotice(
								"Cleanup check for closed items set to minimum 1 day.",
								"warning",
							);
						}
						this.plugin.settings.cleanupClosedIssuesDays = numValue;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(syncContainer)
			.setName("Notification level")
			.setDesc("Control the level of notifications shown during sync")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("minimal", "Minimal")
					.addOption("normal", "Normal")
					.addOption("extensive", "Extensive")
					.addOption("debug", "Debug")
					.setValue(this.plugin.settings.syncNoticeMode)
					.onChange(async (value) => {
						this.plugin.settings.syncNoticeMode = value as
							| "minimal"
							| "normal"
							| "extensive"
							| "debug";
						await this.plugin.saveSettings();
					});
			});

		// Advanced Settings Section
		const advancedContainer = containerEl.createDiv("github-issues-settings-group");
		new Setting(advancedContainer).setName("Advanced Settings").setHeading();

		// Template variables help
		UIHelpers.addTemplateVariablesHelp(advancedContainer, 'issue');

		// Persist blocks help
		UIHelpers.addPersistBlocksHelp(advancedContainer);

		new Setting(advancedContainer)
			.setName("Date format")
			.setDesc("Format for dates in issue files (e.g., yyyy-MM-dd HH:mm:ss)")
			.addText((text) =>
				text
					.setPlaceholder("yyyy-MM-dd HH:mm:ss")
					.setValue(this.plugin.settings.dateFormat)
					.onChange(async (value) => {
						this.plugin.settings.dateFormat = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(advancedContainer)
			.setName("Body content escaping")
			.setDesc("Security level for handling content from GitHub")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"disabled",
						"Disabled - No escaping (may allow malicious content)",
					)
					.addOption(
						"normal",
						"Normal - Basic escaping for plugins like templater and dataview",
					)
					.addOption(
						"strict",
						"Strict - Remove potentially dangerous characters",
					)
					.addOption(
						"veryStrict",
						"Very strict - Remove many special characters",
					)
					.setValue(this.plugin.settings.escapeMode)
					.onChange(async (value) => {
						if (value === "disabled") {
							const modal = new Modal(this.app);
							modal.titleEl.setText("Security Warning");
							modal.contentEl.setText(
								"Disabling body content escaping may allow malicious scripts to execute in your vault. Are you sure you want to continue?",
							);
							const buttonContainer = modal.contentEl.createDiv();
							buttonContainer.addClass(
								"github-issues-button-container",
							);

							const cancelButton =
								buttonContainer.createEl("button");
							cancelButton.setText("Cancel");
							cancelButton.onclick = () => {
								dropdown.setValue("strict");
								modal.close();
							};

							const continueButton =
								buttonContainer.createEl("button");
							continueButton.setText("Continue");
							continueButton.addClass("mod-warning");
							continueButton.onclick = async () => {
								this.plugin.settings.escapeMode = value as
									| "disabled"
									| "normal"
									| "strict"
									| "veryStrict";
								await this.plugin.saveSettings();
								modal.close();
							};

							modal.open();
							return;
						}
						this.plugin.settings.escapeMode = value as
							| "disabled"
							| "normal"
							| "strict"
							| "veryStrict";
						await this.plugin.saveSettings();
					}),
			);

		const escapingInfo = advancedContainer.createDiv("github-issues-info-text github-issues-escaping-info");

		const escapingDetails = escapingInfo.createEl("details");
		const escapingSummary = escapingDetails.createEl("summary", { cls: "github-issues-escaping-summary" });
		escapingSummary.textContent = "Escaping mode details";

		const escapingContent = escapingDetails.createDiv("github-issues-escaping-content");

		const warningP = escapingContent.createEl("p");
		warningP.textContent = "⚠️ CAUTION: Disabling escaping may allow malicious scripts to execute";
		warningP.addClass("github-issues-warning-text");

		escapingContent.createEl("p").textContent = "• Normal: Escapes template syntax like '`', '{{', '}}', '<%', '%>'";
		escapingContent.createEl("p").textContent = "• Strict: Only allows alphanumeric, '.,'()/[]{}*+-:\"' and whitespace";
		escapingContent.createEl("p").textContent = "• Very Strict: Only allows alphanumeric, '.,' and whitespace";

		new Setting(advancedContainer)
			.setName("Escape hash tags")
			.setDesc("Escape # characters that are not valid Markdown headers to prevent unintended Obsidian tags (e.g., #134 becomes \\#134)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.escapeHashTags)
					.onChange(async (value) => {
						this.plugin.settings.escapeHashTags = value;
						await this.plugin.saveSettings();
					}),
			);

		// Global Defaults Section
		const globalDefaultsContainer = containerEl.createDiv("github-issues-settings-group");
		const globalDefaultsHeader = new Setting(globalDefaultsContainer)
			.setName("Global Defaults")
			.setDesc("Default settings applied to all repositories (can be overridden per repository)")
			.setHeading();

		const globalDefaultsContent = globalDefaultsContainer.createDiv("github-issues-collapsible-content");

		// Add collapse toggle
		globalDefaultsHeader.addButton((button) => {
			button.setIcon("chevron-up");
			button.setClass("github-issues-collapse-toggle");
			button.onClick(() => {
				const isCollapsed = globalDefaultsContent.hasClass("github-issues-collapsed");
				if (isCollapsed) {
					globalDefaultsContent.removeClass("github-issues-collapsed");
					button.setIcon("chevron-up");
				} else {
					globalDefaultsContent.addClass("github-issues-collapsed");
					button.setIcon("chevron-down");
				}
			});
		});


		// Issues Subsection
		const issuesGlobalContainer = globalDefaultsContent.createDiv("github-issues-nested");
		new Setting(issuesGlobalContainer).setName("Issues").setHeading();

		new Setting(issuesGlobalContainer)
			.setName("Update mode")
			.setDesc("How to handle updates to existing issue files")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("none", "None - Don't update existing files")
					.addOption("update", "Update - Replace entire content")
					.addOption("append", "Append - Add new content")
					.setValue(this.plugin.settings.globalDefaults.issueUpdateMode)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.issueUpdateMode = value as "none" | "update" | "append";
						await this.plugin.saveSettings();
					})
			);

		new Setting(issuesGlobalContainer)
			.setName("Allow deletion")
			.setDesc("Allow deletion of local issue files when closed on GitHub")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.globalDefaults.allowDeleteIssue)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.allowDeleteIssue = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(issuesGlobalContainer)
			.setName("Folder")
			.setDesc("Default folder where issue files will be stored")
			.addText((text) => {
				text
					.setPlaceholder("GitHub")
					.setValue(this.plugin.settings.globalDefaults.issueFolder)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.issueFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(issuesGlobalContainer)
			.setName("Filename template")
			.setDesc("Template for issue filenames")
			.addText((text) =>
				text
					.setPlaceholder("Issue - {number}")
					.setValue(this.plugin.settings.globalDefaults.issueNoteTemplate)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.issueNoteTemplate = value;
						await this.plugin.saveSettings();
					})
			);


		new Setting(issuesGlobalContainer)
			.setName("Content template")
			.setDesc("Template file for issue content (optional)")
			.addText((text) => {
				text
					.setPlaceholder("")
					.setValue(this.plugin.settings.globalDefaults.issueContentTemplate)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.issueContentTemplate = value;
						await this.plugin.saveSettings();
					});
				new FileSuggest(this.app, text.inputEl);
			});

		new Setting(issuesGlobalContainer)
			.setName("Include comments")
			.setDesc("Include comments in issue files")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.globalDefaults.includeIssueComments)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.includeIssueComments = value;
						await this.plugin.saveSettings();
					})
			);

		// Pull Requests Subsection
		const prGlobalContainer = globalDefaultsContent.createDiv("github-issues-nested");
		new Setting(prGlobalContainer).setName("Pull Requests").setHeading();

		new Setting(prGlobalContainer)
			.setName("Update mode")
			.setDesc("How to handle updates to existing pull request files")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("none", "None - Don't update existing files")
					.addOption("update", "Update - Replace entire content")
					.addOption("append", "Append - Add new content")
					.setValue(this.plugin.settings.globalDefaults.pullRequestUpdateMode)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.pullRequestUpdateMode = value as "none" | "update" | "append";
						await this.plugin.saveSettings();
					})
			);

		new Setting(prGlobalContainer)
			.setName("Allow deletion")
			.setDesc("Allow deletion of local PR files when closed on GitHub")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.globalDefaults.allowDeletePullRequest)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.allowDeletePullRequest = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(prGlobalContainer)
			.setName("Folder")
			.setDesc("Default folder where pull request files will be stored")
			.addText((text) => {
				text
					.setPlaceholder("GitHub Pull Requests")
					.setValue(this.plugin.settings.globalDefaults.pullRequestFolder)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.pullRequestFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(prGlobalContainer)
			.setName("Filename template")
			.setDesc("Template for pull request filenames")
			.addText((text) =>
				text
					.setPlaceholder("PR - {number}")
					.setValue(this.plugin.settings.globalDefaults.pullRequestNoteTemplate)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.pullRequestNoteTemplate = value;
						await this.plugin.saveSettings();
					})
			);


		new Setting(prGlobalContainer)
			.setName("Content template")
			.setDesc("Template file for pull request content (optional)")
			.addText((text) => {
				text
					.setPlaceholder("")
					.setValue(this.plugin.settings.globalDefaults.pullRequestContentTemplate)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.pullRequestContentTemplate = value;
						await this.plugin.saveSettings();
					});
				new FileSuggest(this.app, text.inputEl);
			});

		new Setting(prGlobalContainer)
			.setName("Include comments")
			.setDesc("Include comments in pull request files")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.globalDefaults.includePullRequestComments)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.includePullRequestComments = value;
						await this.plugin.saveSettings();
					})
			);

		// GitHub Projects Section
		const projectsContainer = containerEl.createDiv("github-issues-settings-group github-issues-section-margin");

		new Setting(projectsContainer).setName("GitHub Projects").setHeading();

		projectsContainer
			.createEl("p", {
				text: "Track GitHub Projects (v2) and create notes for project items. Project fields are available as template variables.",
			})
			.addClass("setting-item-description");

		const projectSettingsContainer = projectsContainer.createDiv(
			"github-issues-settings-group",
		);

		// Tabs for Projects (like Repositories)
		const projectTabsContainer = projectSettingsContainer.createDiv(
			"github-issues-repos-tabs-container",
		);

		const trackedProjectsTab = projectTabsContainer.createEl("button", {
			text: "Tracked Projects",
		});
		trackedProjectsTab.addClass("github-issues-tab");
		trackedProjectsTab.addClass("mod-cta");

		const availableProjectsTab = projectTabsContainer.createEl("button", {
			text: "Available Projects",
		});
		availableProjectsTab.addClass("github-issues-tab");

		const trackedProjectsContent = projectSettingsContainer.createDiv(
			"github-issues-tab-content",
		);
		trackedProjectsContent.addClass("active");

		const availableProjectsContent = projectSettingsContainer.createDiv(
			"github-issues-tab-content",
		);

		// Tracked Projects content
		const projectListContainer = trackedProjectsContent.createDiv(
			"github-issues-project-list",
		);

		this.projectListManager.renderProjectsList(
			projectListContainer,
			() => this.display(),
			(container, project) => this.projectRenderer.renderProjectSettings(container, project),
			async (project) => {
				// Delete single project
				this.plugin.settings.trackedProjects = this.plugin.settings.trackedProjects.filter(
					p => p.id !== project.id
				);
				await this.plugin.saveSettings();
				new Notice(`Removed project: ${project.title}`);
				this.display();
			},
			async (projects) => {
				// Bulk delete projects
				const ids = new Set(projects.map(p => p.id));
				this.plugin.settings.trackedProjects = this.plugin.settings.trackedProjects.filter(
					p => !ids.has(p.id)
				);
				await this.plugin.saveSettings();
				new Notice(`Removed ${projects.length} projects`);
				this.display();
			}
		);

		// Available Projects content
		const loadProjectsButtonContainer = availableProjectsContent.createDiv(
			"github-issues-load-repos-container",
		);

		const projectsLoadDescription = loadProjectsButtonContainer.createEl("p", {
			text: "Load your GitHub Projects to add them to tracking.",
			cls: "github-issues-load-description",
		});

		const loadProjectsButton = loadProjectsButtonContainer.createEl("button");
		loadProjectsButton.addClass("github-issues-action-button");
		const projectsButtonIcon = loadProjectsButton.createEl("span", {
			cls: "github-issues-button-icon",
		});
		setIcon(projectsButtonIcon, "download");
		loadProjectsButton.createEl("span", { text: "Load Projects" });

		const projectsResultsContainer = availableProjectsContent.createDiv(
			"github-issues-repos-results-container",
		);
		projectsResultsContainer.addClass("github-issues-hidden");

		loadProjectsButton.onclick = async () => {
			loadProjectsButton.disabled = true;
			const buttonText = loadProjectsButton.querySelector("span:last-child");
			if (buttonText) {
				buttonText.textContent = "Loading...";
			}

			try {
				await this.renderAvailableProjects(projectsResultsContainer);
				projectsResultsContainer.removeClass("github-issues-hidden");
				loadProjectsButtonContainer.addClass("github-issues-hidden");
			} catch (error) {
				new Notice(`Error loading projects: ${error}`);
			} finally {
				loadProjectsButton.disabled = false;
				if (buttonText) {
					buttonText.textContent = "Load Projects";
				}
			}
		};

		// Tab switching
		trackedProjectsTab.onclick = () => {
			trackedProjectsTab.addClass("mod-cta");
			availableProjectsTab.removeClass("mod-cta");
			trackedProjectsContent.addClass("active");
			availableProjectsContent.removeClass("active");
		};

		availableProjectsTab.onclick = () => {
			availableProjectsTab.addClass("mod-cta");
			trackedProjectsTab.removeClass("mod-cta");
			availableProjectsContent.addClass("active");
			trackedProjectsContent.removeClass("active");
		};

		// Repositories Section
		const repoContainer = containerEl.createDiv("github-issues-settings-group github-issues-section-margin");

		new Setting(repoContainer).setName("Repositories").setHeading();
		const repoTabsContainer = repoContainer.createDiv(
			"github-issues-repos-tabs-container",
		);

		const trackedReposTab = repoTabsContainer.createEl("button", {
			text: "Tracked Repositories",
		});
		trackedReposTab.addClass("github-issues-tab");
		trackedReposTab.addClass("mod-cta");

		const availableReposTab = repoTabsContainer.createEl("button", {
			text: "Available Repositories",
		});
		availableReposTab.addClass("github-issues-tab");

		const trackedReposContent = repoContainer.createDiv(
			"github-issues-tab-content",
		);
		trackedReposContent.addClass("active");

		const availableReposContent = repoContainer.createDiv(
			"github-issues-tab-content",
		);

		const trackedHeader = trackedReposContent.createDiv(
			"github-issues-tracked-header",
		);

		const manualAddContainer = trackedHeader.createDiv(
			"github-issues-manual-add-container",
		);

		const manualAddHeaderContainer = manualAddContainer.createDiv(
			"github-issues-manual-add-header",
		);

		const addRepoHeading = manualAddHeaderContainer.createEl("h4", {
			text: "Add Repository Manually",
		});

		const addForm = manualAddContainer.createDiv(
			"github-issues-manual-add-form",
		);
		const formText = addForm.createEl("p", {
			text: "Enter the repository in owner/name format to add it to your tracked repositories.",
		});
		formText.addClass("github-issues-form-description");

		const inputContainer = addForm.createDiv(
			"github-issues-input-container",
		);
		const repoInput = inputContainer.createEl("input");
		repoInput.type = "text";
		repoInput.placeholder = "e.g., owner/repo-name";
		repoInput.addClass("github-issues-repo-input");

		const addButton = inputContainer.createEl("button", {
			text: "Add Repository",
		});
		addButton.addClass("github-issues-add-button");

	addButton.onclick = async () => {
		const repo = repoInput.value.trim();

		if (!repo) {
			new Notice("Please enter both owner and repository name");
			return;
		}

		await this.repositoryListManager.addRepository(repo);
		this.display();
		repoInput.value = "";
	};		const trackedSearchContainer = trackedReposContent.createDiv(
			"github-issues-search-container",
		);
		trackedSearchContainer.addClass("github-issues-tracked-search");
		const searchHeaderContainer = trackedSearchContainer.createDiv(
			"github-issues-search-header",
		);
		const searchIconContainer = searchHeaderContainer.createDiv(
			"github-issues-search-icon",
		);
		setIcon(searchIconContainer, "search");

		const searchLabel = searchHeaderContainer.createEl("label", {
			text: "Search tracked repositories",
		});
		searchLabel.addClass("github-issues-search-label");

		const searchInputContainer = trackedSearchContainer.createDiv(
			"github-issues-search-input-container",
		);
		const searchInput = searchInputContainer.createEl("input");
		searchInput.type = "text";
		searchInput.placeholder = "Filter by name or owner...";
		searchInput.addClass("github-issues-search-input");
		const clearButton = searchInputContainer.createDiv(
			"github-issues-search-clear-button github-issues-hidden",
		);
		setIcon(clearButton, "x");
		clearButton.addEventListener("click", () => {
			searchInput.value = "";
			clearButton.classList.add("github-issues-hidden");
			searchInput.dispatchEvent(new Event("input"));
			searchInput.focus();
		});

		const statsCounter = trackedSearchContainer.createDiv(
			"github-issues-stats-counter",
		);
		statsCounter.setText(
			`Showing all ${this.plugin.settings.repositories.length} repositories`,
		);
		searchInput.addEventListener("input", () => {
			const searchTerm = searchInput.value.toLowerCase();

			if (searchTerm.length > 0) {
				clearButton.classList.remove("github-issues-hidden");
			} else {
				clearButton.classList.add("github-issues-hidden");
			}

			const repoItems = trackedReposContent.querySelectorAll(
				".github-issues-repo-settings",
			);
			let visibleRepositories = 0;

			const visibleReposByOwner: Record<string, number> = {};

			repoItems.forEach((item) => {
				const repoName =
					item.getAttribute("data-repo-name")?.toLowerCase() || "";
				const ownerName =
					item.getAttribute("data-owner-name")?.toLowerCase() || "";
				const fullName =
					item.getAttribute("data-full-name")?.toLowerCase() || "";

				if (
					fullName.includes(searchTerm) ||
					repoName.includes(searchTerm) ||
					ownerName.includes(searchTerm)
				) {
					(item as HTMLElement).classList.remove(
						"github-issues-hidden",
					);
					visibleRepositories++;

					if (!visibleReposByOwner[ownerName]) {
						visibleReposByOwner[ownerName] = 0;
					}
					visibleReposByOwner[ownerName]++;
				} else {
					(item as HTMLElement).classList.add("github-issues-hidden");
				}
			});

			const ownerGroups = trackedReposContent.querySelectorAll(
				".github-issues-repo-owner-group",
			);
			ownerGroups.forEach((group) => {
				const ownerName =
					group.getAttribute("data-owner")?.toLowerCase() || "";

				if (
					visibleReposByOwner[ownerName] &&
					visibleReposByOwner[ownerName] > 0
				) {
					(group as HTMLElement).classList.remove(
						"github-issues-hidden",
					);
				} else {
					(group as HTMLElement).classList.add(
						"github-issues-hidden",
					);
				}
			});

			if (searchTerm.length > 0) {
				statsCounter.setText(
					`Showing ${visibleRepositories} of ${this.plugin.settings.repositories.length} repositories`,
				);
			} else {
				statsCounter.setText(
					`Showing all ${this.plugin.settings.repositories.length} repositories`,
				);
			}

			const noRepos = trackedReposContent.querySelector(
				".github-issues-no-repos",
			);
			if (noRepos) {
				noRepos.classList.toggle(
					"github-issues-hidden",
					visibleRepositories > 0,
				);
			}

			const noResults = trackedReposContent.querySelector(
				".github-issues-no-results",
			);
			if (noResults) {
				noResults.classList.toggle(
					"github-issues-hidden",
					visibleRepositories > 0 ||
						this.plugin.settings.repositories.length === 0,
				);
			}
		});

		const loadButtonContainer = availableReposContent.createDiv(
			"github-issues-load-repos-container",
		);

		const loadDescription = loadButtonContainer.createEl("p", {
			text: "Load your GitHub repositories to add them to tracking.",
			cls: "github-issues-load-description",
		});

		const loadButton = loadButtonContainer.createEl("button");
		loadButton.addClass("github-issues-action-button");
		const buttonIcon = loadButton.createEl("span", {
			cls: "github-issues-button-icon",
		});
		setIcon(buttonIcon, "download");
		loadButton.createEl("span", { text: "Load Repositories" });

		const reposResultsContainer = availableReposContent.createDiv(
			"github-issues-repos-results-container",
		);
		reposResultsContainer.addClass("github-issues-hidden");

		loadButton.onclick = async () => {
			loadButton.disabled = true;
			const buttonText = loadButton.querySelector("span:last-child");
			if (buttonText) {
				buttonText.textContent = "Loading...";
			}

			await this.renderAvailableRepositories(reposResultsContainer);
			reposResultsContainer.removeClass("github-issues-hidden");
			loadButtonContainer.addClass("github-issues-hidden");
		};

		this.repositoryListManager.renderRepositoriesList(
			trackedReposContent,
			() => this.display(),
			(containerEl, repo) => this.repositoryRenderer.renderIssueSettings(containerEl, repo),
			(containerEl, repo) => this.repositoryRenderer.renderPullRequestSettings(containerEl, repo),
			(repo) => this.modalManager.showDeleteRepositoryModal(repo, () => this.display()),
			(repos) => this.modalManager.showBulkDeleteRepositoriesModal(repos, () => this.display())
		);

		trackedReposTab.onclick = () => {
			trackedReposTab.addClass("mod-cta");
			availableReposTab.removeClass("mod-cta");
			trackedReposContent.addClass("active");
			availableReposContent.removeClass("active");
		};

		availableReposTab.onclick = () => {
			availableReposTab.addClass("mod-cta");
			trackedReposTab.removeClass("mod-cta");
			availableReposContent.addClass("active");
			trackedReposContent.removeClass("active");
		};
	}

	private showAddRepositoryModal(): void {
		const modal = new Modal(this.app);
		modal.containerEl.addClass("github-issues-modal");
		modal.titleEl.setText("Add repository");

		const formContainer = modal.contentEl.createDiv();
		formContainer.addClass("github-issues-form-container");

		const tabsContainer = formContainer.createDiv();
		tabsContainer.addClass("github-issues-tabs-container");

		const manualTab = tabsContainer.createEl("button");
		manualTab.setText("Manual entry");
		manualTab.addClass("mod-cta");

		const githubTab = tabsContainer.createEl("button");
		githubTab.setText("From GitHub");

		const manualContent = formContainer.createDiv();
		manualContent.addClass("github-issues-tab-content");
		manualContent.addClass("active");

		const githubContent = formContainer.createDiv();
		githubContent.addClass("github-issues-tab-content");

		const manualForm = manualContent.createDiv();
		manualForm.addClass("github-issues-manual-form-container");

		const repoContainer = manualForm.createDiv();
		repoContainer.addClass("github-issues-container");
		repoContainer.createEl("label", { text: "Repository (owner/name)" });
		const repoInput = repoContainer.createEl("input");
		repoInput.type = "text";
		repoInput.placeholder = "e.g., owner/repo-name";

		const githubList = githubContent.createDiv();
		githubList.addClass("github-issues-list");

		manualTab.onclick = () => {
			manualTab.addClass("mod-cta");
			githubTab.removeClass("mod-cta");
			manualContent.addClass("active");
			githubContent.removeClass("active");

			buttonContainer.addClass("github-issues-visible-flex");
			buttonContainer.removeClass("github-issues-hidden");
		};

		githubTab.onclick = async () => {
			githubTab.addClass("mod-cta");
			manualTab.removeClass("mod-cta");
			manualContent.removeClass("active");
			githubContent.addClass("active");
			buttonContainer.addClass("github-issues-hidden");
			buttonContainer.removeClass("github-issues-visible-flex");
			await this.renderGitHubRepositories(githubList, modal);
		};

		const buttonContainer = formContainer.createDiv();
		buttonContainer.addClass("github-issues-button-container");

		const cancelButton = buttonContainer.createEl("button");
		cancelButton.setText("Cancel");
		cancelButton.onclick = () => modal.close();

	const addButton = buttonContainer.createEl("button");
	addButton.setText("Add");
	addButton.onclick = async () => {
		const repo = repoInput.value.trim();

		if (!repo) {
			new Notice("Please enter both owner and repository name");
			return;
		}

		await this.repositoryListManager.addRepository(repo);
		this.display();
		modal.close();
	};		modal.open();
	}

	private async renderGitHubRepositories(
		container: HTMLElement,
		modal?: Modal,
	): Promise<void> {
		container.empty();
		container.createEl("p", { text: "Loading repositories..." });

		try {
			const repos = await this.plugin.fetchAvailableRepositories();

			container.empty();

			const searchContainer = container.createDiv(
				"github-issues-search-container",
			);
			searchContainer.addClass("github-issues-modal-search");

			const searchHeaderContainer = searchContainer.createDiv(
				"github-issues-search-header",
			);
			const searchIconContainer = searchHeaderContainer.createDiv(
				"github-issues-search-icon",
			);
			setIcon(searchIconContainer, "search");

			const searchLabel = searchHeaderContainer.createEl("label", {
				text: "Search repositories",
			});
			searchLabel.addClass("github-issues-search-label");

			const searchInputContainer = searchContainer.createDiv(
				"github-issues-search-input-container",
			);
			const searchInput = searchInputContainer.createEl("input");
			searchInput.type = "text";
			searchInput.placeholder = "Filter by name or owner...";
			searchInput.addClass("github-issues-search-input");
			const clearButton = searchInputContainer.createDiv(
				"github-issues-search-clear-button github-issues-hidden",
			);
			setIcon(clearButton, "x");
			clearButton.addEventListener("click", () => {
				searchInput.value = "";
				clearButton.classList.add("github-issues-hidden");
				searchInput.dispatchEvent(new Event("input"));
				searchInput.focus();
			});

			const statsCounter = searchContainer.createDiv(
				"github-issues-stats-counter",
			);
			statsCounter.setText(`Showing all ${repos.length} repositories`);

			const repoListContainer = container.createDiv(
				"github-issues-repo-list",
			);

			const noResultsMessage = container.createDiv(
				"github-issues-no-results",
			);
			const noResultsIcon = noResultsMessage.createDiv(
				"github-issues-no-results-icon",
			);
			setIcon(noResultsIcon, "minus-circle");
			const noResultsText = noResultsMessage.createDiv(
				"github-issues-no-results-text",
			);
			noResultsText.setText("No matching repositories found");
			noResultsMessage.addClass("github-issues-hidden");

			const reposByOwner: Record<
				string,
				{ owner: string; repos: any[] }
			> = {};

			// Sort and group repositories by owner
			for (const repo of repos) {
				const ownerName = repo.owner.login;
				if (!reposByOwner[ownerName]) {
					reposByOwner[ownerName] = {
						owner: ownerName,
						repos: [],
					};
				}
				reposByOwner[ownerName].repos.push(repo);
			}

			// Sort owners alphabetically
			const sortedOwners = Object.keys(reposByOwner).sort();

			// Render each owner group
			for (const ownerName of sortedOwners) {
				const ownerData = reposByOwner[ownerName];
				const ownerContainer = repoListContainer.createDiv();
				ownerContainer.addClass("github-issues-repo-owner-group");
				ownerContainer.setAttribute(
					"data-owner",
					ownerName.toLowerCase(),
				);

				const ownerHeader = ownerContainer.createDiv(
					"github-issues-repo-owner-header",
				);
				const ownerIcon = ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-icon",
				});
				setIcon(ownerIcon, "user");
				ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-name",
					text: ownerName,
				});
				ownerHeader.createEl("span", {
					cls: "github-issues-repo-count",
					text: ownerData.repos.length.toString(),
				});

				// Sort repositories by name
				ownerData.repos.sort((a, b) => a.name.localeCompare(b.name));

				const reposContainer = ownerContainer.createDiv(
					"github-issues-owner-repos",
				);

				for (const repo of ownerData.repos) {
					const repoName = `${repo.owner.login}/${repo.name}`;
					const isTracked = this.plugin.settings.repositories.some(
						(r) => r.repository === repoName,
					);

					const repoItem = reposContainer.createDiv();
					repoItem.addClass("github-issues-item");
					repoItem.setAttribute(
						"data-repo-name",
						repo.name.toLowerCase(),
					);
					repoItem.setAttribute(
						"data-owner-name",
						repo.owner.login.toLowerCase(),
					);
					repoItem.setAttribute(
						"data-full-name",
						repoName.toLowerCase(),
					);
				const repoInfoContainer = repoItem.createDiv(
					"github-issues-repo-info",
				);

				// Always create checkbox for consistent alignment
				const checkboxContainer = repoInfoContainer.createDiv(
					"github-issues-repo-checkbox",
				);
				const checkbox = checkboxContainer.createEl("input");
				checkbox.type = "checkbox";
				checkbox.addClass("github-issues-checkbox");

				if (isTracked) {
					checkbox.addClass("github-issues-checkbox-hidden");
				}

				const repoIcon = repoInfoContainer.createDiv(
					"github-issues-repo-icon",
				);
				setIcon(repoIcon, "github");
				const repoText = repoInfoContainer.createEl("span");
					repoText.setText(repo.name);
					repoText.addClass("github-issues-repo-name");

					const actionContainer = repoItem.createDiv(
						"github-issues-repo-action",
					);

					if (!isTracked) {
						const addButton = actionContainer.createEl("button");
						const addIcon = addButton.createEl("span", {
							cls: "github-issues-button-icon",
							text: "+",
						});
						addButton.createEl("span", {
							cls: "github-issues-button-text",
							text: "Add",
						});
						addButton.addClass("github-issues-add-button");
						addButton.onclick = async () => {
							await this.repositoryListManager.addRepository(repoName);
						this.display();
							new Notice(`Added repository: ${repoName}`);
							addButton.remove();

							const trackedContainer = actionContainer.createDiv(
								"github-issues-tracked-container",
							);
							const trackedText =
								trackedContainer.createEl("span");
							trackedText.setText("Tracked");
							trackedText.addClass("github-issues-info-text");
							this.display();

							const visibleItems =
								repoListContainer.querySelectorAll(
									".github-issues-item:not(.github-issues-hidden)",
								);
							statsCounter.setText(
								`Showing ${visibleItems.length} of ${repos.length} repositories`,
							);
						};
					} else {
						const trackedContainer = actionContainer.createDiv(
							"github-issues-tracked-container",
						);
						const trackedText = trackedContainer.createEl("span");
						trackedText.setText("Tracked");
						trackedText.addClass("github-issues-info-text");
					}
				}
			}

			searchInput.addEventListener("input", () => {
				const searchTerm = searchInput.value.toLowerCase();

				if (searchTerm.length > 0) {
					clearButton.classList.remove("github-issues-hidden");
				} else {
					clearButton.classList.add("github-issues-hidden");
				}

				const repoItems = repoListContainer.querySelectorAll(
					".github-issues-item",
				);
				let visibleCount = 0;

				const visibleReposByOwner: Record<string, number> = {};

				repoItems.forEach((item) => {
					const repoName = item.getAttribute("data-repo-name") || "";
					const ownerName =
						item.getAttribute("data-owner-name") || "";
					const fullName = item.getAttribute("data-full-name") || "";

					if (
						fullName.includes(searchTerm) ||
						repoName.includes(searchTerm) ||
						ownerName.includes(searchTerm)
					) {
						(item as HTMLElement).classList.remove(
							"github-issues-hidden",
						);
						visibleCount++;
						if (!visibleReposByOwner[ownerName]) {
							visibleReposByOwner[ownerName] = 0;
						}
						visibleReposByOwner[ownerName]++;
					} else {
						(item as HTMLElement).classList.add(
							"github-issues-hidden",
						);
					}
				});

				const ownerGroups = repoListContainer.querySelectorAll(
					".github-issues-repo-owner-group",
				);
				ownerGroups.forEach((group) => {
					const ownerName = group.getAttribute("data-owner") || "";

					if (
						visibleReposByOwner[ownerName] &&
						visibleReposByOwner[ownerName] > 0
					) {
						(group as HTMLElement).classList.remove(
							"github-issues-hidden",
						);
					} else {
						(group as HTMLElement).classList.add(
							"github-issues-hidden",
						);
					}
				});

				if (searchTerm.length > 0) {
					statsCounter.setText(
						`Showing ${visibleCount} of ${repos.length} repositories`,
					);
				} else {
					statsCounter.setText(
						`Showing all ${repos.length} repositories`,
					);
				}

				noResultsMessage.classList.toggle(
					"github-issues-hidden",
					visibleCount > 0,
				);
			});
		} catch (error) {
			container.empty();
			container.createEl("p", {
				text: `Error loading repositories: ${(error as Error).message}`,
			});
		}
	}

	private async renderAvailableRepositories(
		container: HTMLElement,
	): Promise<void> {
		container.empty();


		try {
			const repos = await this.plugin.fetchAvailableRepositories();

			const untrackedRepos = repos.filter((repo) => {
				const repoName = `${repo.owner.login}/${repo.name}`;
				return !this.plugin.settings.repositories.some(
					(r) => r.repository === repoName,
				);
			});

			container.empty();

			const actionsBar = container.createDiv("github-issues-actions-bar");

			const bulkActionsContainer = actionsBar.createDiv(
				"github-issues-bulk-actions",
			);
			bulkActionsContainer.addClass(
				"github-issues-bulk-actions-container",
			);

			const selectionControls = bulkActionsContainer.createDiv(
				"github-issues-selection-controls",
			);
			const selectAllButton = selectionControls.createEl("button");
			const selectAllIcon = selectAllButton.createEl("span", {
				cls: "github-issues-button-icon",
			});
			setIcon(selectAllIcon, "check");
			selectAllButton.createEl("span", {
				cls: "github-issues-button-text",
				text: "Select all",
			});
			selectAllButton.addClass("github-issues-select-all-button");
			const selectNoneButton = selectionControls.createEl("button");
			const selectNoneIcon = selectNoneButton.createEl("span", {
				cls: "github-issues-button-icon",
			});
			setIcon(selectNoneIcon, "x");
			selectNoneButton.createEl("span", {
				cls: "github-issues-button-text",
				text: "Select none",
			});
			selectNoneButton.addClass("github-issues-select-none-button");
			const addSelectedButton = bulkActionsContainer.createEl("button");
			addSelectedButton.createEl("span", {
				cls: "github-issues-button-icon",
				text: "+",
			});
			const buttonTextContainer = addSelectedButton.createEl("span", {
				cls: "github-issues-button-text",
			});
			buttonTextContainer.setText("Add Selected (");
			buttonTextContainer.createEl("span", {
				cls: "selected-count",
				text: "0",
			});
			buttonTextContainer.appendText(")");
			addSelectedButton.addClass("github-issues-add-selected-button");
			addSelectedButton.disabled = true;

			const searchContainer = actionsBar.createDiv(
				"github-issues-search-container",
			);
			searchContainer.addClass("github-issues-search-modern");

			const searchInputWrapper = searchContainer.createDiv(
				"github-issues-search-wrapper",
			);
			const searchIconContainer = searchInputWrapper.createDiv(
				"github-issues-search-icon",
			);
			setIcon(searchIconContainer, "search");

			const searchInput = searchInputWrapper.createEl("input");
			searchInput.type = "text";
			searchInput.placeholder = "Search repositories...";
			searchInput.addClass("github-issues-search-input-modern");
			const clearButton = searchInputWrapper.createDiv(
				"github-issues-clear-button github-issues-hidden",
			);
			setIcon(clearButton, "x");
			clearButton.addEventListener("click", () => {
				searchInput.value = "";
				clearButton.classList.add("github-issues-hidden");
				searchInput.dispatchEvent(new Event("input"));
				searchInput.focus();
			});

			const statsCounter = searchContainer.createDiv(
				"github-issues-stats-counter",
			);

			statsCounter.setText(`Showing all ${repos.length} repositories`);
			const repoListContainer = container.createDiv(
				"github-issues-repo-list",
			);
			const noResultsMessage = container.createDiv(
				"github-issues-no-results",
			);
			const noResultsIcon = noResultsMessage.createDiv(
				"github-issues-no-results-icon",
			);
			setIcon(noResultsIcon, "minus-circle");
			const noResultsText = noResultsMessage.createDiv(
				"github-issues-no-results-text",
			);
			noResultsText.setText("No matching repositories found");
			noResultsMessage.addClass("github-issues-hidden");

			const reposByOwner: Record<
				string,
				{ owner: string; repos: any[] }
			> = {};
			for (const repo of repos) {
				const ownerName = repo.owner.login;
				if (!reposByOwner[ownerName]) {
					reposByOwner[ownerName] = {
						owner: ownerName,
						repos: [],
					};
				}
				reposByOwner[ownerName].repos.push(repo);
			}

			const sortedOwners = Object.keys(reposByOwner).sort();

			const updateSelectionUI = () => {
				const selectedCount = this.selectedRepositories.size;
				const selectedCountSpan = addSelectedButton.querySelector(
					".selected-count",
				) as HTMLElement;
				if (selectedCountSpan) {
					selectedCountSpan.textContent = selectedCount.toString();
				}
				addSelectedButton.disabled = selectedCount === 0;
			};

			for (const ownerName of sortedOwners) {
				const ownerData = reposByOwner[ownerName];
				const ownerContainer = repoListContainer.createDiv();
				ownerContainer.addClass("github-issues-repo-owner-group");
				ownerContainer.setAttribute(
					"data-owner",
					ownerName.toLowerCase(),
				);
				const ownerHeader = ownerContainer.createDiv(
					"github-issues-repo-owner-header",
				);

				// Chevron icon for collapse/expand
				const chevronIcon = ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-chevron",
				});
				setIcon(chevronIcon, "chevron-right");

				const ownerIcon = ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-icon",
				});
				setIcon(ownerIcon, "user");
				ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-name",
					text: ownerName,
				});
				ownerHeader.createEl("span", {
					cls: "github-issues-repo-count",
					text: ownerData.repos.length.toString(),
				});

				ownerData.repos.sort((a, b) => a.name.localeCompare(b.name));

				const reposContainer = ownerContainer.createDiv(
					"github-issues-owner-repos",
				);

				// Make owner header collapsible
				ownerHeader.addEventListener("click", (e) => {
					e.stopPropagation();
					const isExpanded = ownerContainer.classList.contains("github-issues-owner-expanded");
					if (isExpanded) {
						ownerContainer.classList.remove("github-issues-owner-expanded");
						setIcon(chevronIcon, "chevron-right");
					} else {
						ownerContainer.classList.add("github-issues-owner-expanded");
						setIcon(chevronIcon, "chevron-down");
					}
				});

				// Add repository items
				for (const repo of ownerData.repos) {
					const repoName = `${repo.owner.login}/${repo.name}`;
					const isTracked = this.plugin.settings.repositories.some(
						(r) => r.repository === repoName,
					);

					const repoItem = reposContainer.createDiv();
					repoItem.addClass("github-issues-item");
					repoItem.setAttribute(
						"data-repo-name",
						repo.name.toLowerCase(),
					);
					repoItem.setAttribute(
						"data-owner-name",
						repo.owner.login.toLowerCase(),
					);
					repoItem.setAttribute(
						"data-full-name",
						repoName.toLowerCase(),
					);

					const repoInfoContainer = repoItem.createDiv(
						"github-issues-repo-info",
					);

					if (!isTracked) {
						const checkboxContainer = repoInfoContainer.createDiv(
							"github-issues-repo-checkbox",
						);
						const checkbox = checkboxContainer.createEl("input");
						checkbox.type = "checkbox";
						checkbox.addClass("github-issues-checkbox");
						checkbox.checked =
							this.selectedRepositories.has(repoName);

						checkbox.addEventListener("change", () => {
							if (checkbox.checked) {
								this.selectedRepositories.add(repoName);
							} else {
								this.selectedRepositories.delete(repoName);
							}
							updateSelectionUI();
						});
					}
					const repoIcon = repoInfoContainer.createDiv(
						"github-issues-repo-icon",
					);
					setIcon(repoIcon, "github");

					const repoText = repoInfoContainer.createEl("span");
					repoText.setText(repo.name);
					repoText.addClass("github-issues-repo-name");

					const actionContainer = repoItem.createDiv(
						"github-issues-repo-action",
					);
					if (isTracked) {
						const trackedContainer = actionContainer.createDiv(
							"github-issues-tracked-container",
						);
						const trackedText = trackedContainer.createEl("span");
						trackedText.setText("Tracked");
						trackedText.addClass("github-issues-info-text");
					}
				}
			}

			selectAllButton.onclick = () => {
				const checkboxes = repoListContainer.querySelectorAll(
					'.github-issues-checkbox:not([data-tracked="true"])',
				) as NodeListOf<HTMLInputElement>;
				checkboxes.forEach((checkbox) => {
					const repoItem = checkbox.closest(".github-issues-item");
					if (
						repoItem &&
						!repoItem.classList.contains("github-issues-hidden")
					) {
						checkbox.checked = true;
						const repoName = repoItem
							.getAttribute("data-full-name")
							?.replace(/\s+/g, "");
						if (repoName) {
							const ownerName =
								repoItem.getAttribute("data-owner-name");
							const repoNameOnly =
								repoItem.getAttribute("data-repo-name");
							if (ownerName && repoNameOnly) {
								const fullRepoName = `${ownerName}/${repoNameOnly}`;
								this.selectedRepositories.add(fullRepoName);
							}
						}
					}
				});
				updateSelectionUI();
			};

			selectNoneButton.onclick = () => {
				const checkboxes = repoListContainer.querySelectorAll(
					".github-issues-checkbox",
				) as NodeListOf<HTMLInputElement>;
				checkboxes.forEach((checkbox) => {
					checkbox.checked = false;
				});
				this.selectedRepositories.clear();
				updateSelectionUI();
			};

			addSelectedButton.onclick = async () => {
				if (this.selectedRepositories.size > 0) {
					const selectedRepos = Array.from(this.selectedRepositories);
					await this.repositoryListManager.addMultipleRepositories(selectedRepos);
					await this.renderAvailableRepositories(container);
				}
			};

			searchInput.addEventListener("input", () => {
				const searchTerm = searchInput.value.toLowerCase();

				if (searchTerm.length > 0) {
					clearButton.classList.remove("github-issues-hidden");
				} else {
					clearButton.classList.add("github-issues-hidden");
				}

				const repoItems = repoListContainer.querySelectorAll(
					".github-issues-item",
				);
				let visibleCount = 0;
				const visibleReposByOwner: Record<string, number> = {};

				repoItems.forEach((item) => {
					const repoName = item.getAttribute("data-repo-name") || "";
					const ownerName =
						item.getAttribute("data-owner-name") || "";
					const fullName = item.getAttribute("data-full-name") || "";

					if (
						fullName.includes(searchTerm) ||
						repoName.includes(searchTerm) ||
						ownerName.includes(searchTerm)
					) {
						(item as HTMLElement).classList.remove(
							"github-issues-hidden",
						);
						visibleCount++;
						if (!visibleReposByOwner[ownerName]) {
							visibleReposByOwner[ownerName] = 0;
						}
						visibleReposByOwner[ownerName]++;
					} else {
						(item as HTMLElement).classList.add(
							"github-issues-hidden",
						);
					}
				});

				const ownerGroups = repoListContainer.querySelectorAll(
					".github-issues-repo-owner-group",
				);
				ownerGroups.forEach((group) => {
					const ownerName = group.getAttribute("data-owner") || "";

					if (
						visibleReposByOwner[ownerName] &&
						visibleReposByOwner[ownerName] > 0
					) {
						(group as HTMLElement).classList.remove(
							"github-issues-hidden",
						);
					} else {
						(group as HTMLElement).classList.add(
							"github-issues-hidden",
						);
					}
				});

				if (searchTerm.length > 0) {
					statsCounter.setText(
						`Showing ${visibleCount} of ${repos.length} repositories`,
					);
				} else {
					statsCounter.setText(
						`Showing all ${repos.length} repositories`,
					);
				}

				noResultsMessage.classList.toggle(
					"github-issues-hidden",
					visibleCount > 0,
				);
			});

			updateSelectionUI();
		} catch (error) {
			container.empty();
			container.createEl("p", {
				text: `Error loading repositories: ${(error as Error).message}`,
			});
		}
	}

	/**
	 * Fetch and display available labels for a repository
	 */
	private async updateTokenBadge(container?: HTMLElement): Promise<void> {
		const badgeContainer = container || this.containerEl.querySelector(".github-issues-token-badge-container") as HTMLElement;
		if (!badgeContainer) return;

		badgeContainer.empty();

		if (!this.plugin.settings.githubToken) {
			const badge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-invalid");
			badge.setText("No token");
			return;
		}

		if (!this.plugin.gitHubClient) {
			const badge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-error");
			badge.setText("Client not initialized");
			return;
		}

		// Show loading state
		const loadingBadge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-loading");
		loadingBadge.setText("Validating token...");

		try {
			// Initialize client with current token
			this.plugin.gitHubClient.initializeClient(this.plugin.settings.githubToken);

			// Validate token and get information
			const [tokenInfo, rateLimit] = await Promise.all([
				this.plugin.gitHubClient.validateToken(),
				this.plugin.gitHubClient.getRateLimit()
			]);

			// Clear loading state
			badgeContainer.empty();

			if (tokenInfo.valid) {
				// Valid token badge
				const validBadge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-valid");
				validBadge.setText("✓ Valid token");

				// Scopes badge
				if (tokenInfo.scopes.length > 0) {
					const scopesBadge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-scopes");
					scopesBadge.setText(`Scopes: ${tokenInfo.scopes.join(", ")}`);
				}

				// Rate limit badge
				if (rateLimit) {
					const rateLimitBadge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-rate-limit");
					rateLimitBadge.setText(`Rate Limit: ${rateLimit.remaining}/${rateLimit.limit}`);
				}
			} else {
				const invalidBadge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-invalid");
				invalidBadge.setText("✗ Invalid token");
			}
		} catch (error) {
			// Clear loading state and show error
			badgeContainer.empty();
			const errorBadge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-error");
			errorBadge.setText("Error validating token");
		}
	}

	/**
	 * Load projects from all tracked repositories
	 */
	private async loadProjectsFromRepositories(): Promise<void> {
		if (!this.plugin.gitHubClient) {
			throw new Error("GitHub client not initialized");
		}

		if (this.plugin.settings.repositories.length === 0) {
			this.plugin.showNotice("No repositories tracked. Please add repositories first before loading projects.", "warning");
			return;
		}

		this.plugin.showNotice(`[Projects] Starting to load projects from ${this.plugin.settings.repositories.length} repositories`, "debug");

		const allProjects: Map<string, { id: string; title: string; number: number; url: string; owner: string }> = new Map();
		let reposAttempted = 0;
		let reposFailed = 0;

		for (const repo of this.plugin.settings.repositories) {
			const [owner, repoName] = repo.repository.split("/");
			if (!owner || !repoName) continue;
			reposAttempted++;

			try {
				const projects = await this.plugin.gitHubClient.fetchProjectsForRepository(owner, repoName);

				for (const project of projects) {
					if (!allProjects.has(project.id)) {
						allProjects.set(project.id, {
							id: project.id,
							title: project.title,
							number: project.number,
							url: project.url,
							owner: owner,
						});
					}
				}
			} catch (error) {
				reposFailed++;
				console.error(`Error fetching projects for ${repo.repository}:`, error);
			}
		}

		// Merge with existing tracked projects (preserve enabled state)
		const existingProjects = new Map(
			this.plugin.settings.trackedProjects.map(p => [p.id, p])
		);

		const newTrackedProjects: typeof this.plugin.settings.trackedProjects = [];

		for (const [id, project] of allProjects) {
			const existing = existingProjects.get(id);

			// Fetch status options for each project
			let statusOptions = existing?.statusOptions;
			if (!statusOptions) {
				try {
					statusOptions = await this.plugin.gitHubClient!.fetchProjectStatusOptions(project.id);
				} catch {
					statusOptions = [];
				}
			}

			newTrackedProjects.push({
				id: project.id,
				title: project.title,
				number: project.number,
				url: project.url,
				owner: project.owner,
				enabled: existing?.enabled ?? true, // Default to enabled for new projects
				statusOptions: statusOptions,
				customStatusOrder: existing?.customStatusOrder,
				useCustomStatusOrder: existing?.useCustomStatusOrder ?? false,
			});
		}

		this.plugin.settings.trackedProjects = newTrackedProjects;
		await this.plugin.saveSettings();

		if (newTrackedProjects.length === 0 && reposAttempted > 0 && reposFailed > 0) {
			new Notice(
				`No projects loaded. Failed to fetch from ${reposFailed}/${reposAttempted} repositories. Check your GitHub token has Projects access (e.g. read:project) and that you can access the repos/projects.`,
			);
		} else {
			new Notice(`Found ${newTrackedProjects.length} projects`);
		}
	}

	/**
	 * Load projects directly from a specific repository
	 */
	private async loadProjectsFromDirectRepository(owner: string, repoName: string): Promise<void> {
		if (!this.plugin.gitHubClient) {
			throw new Error("GitHub client not initialized");
		}

		this.plugin.showNotice(`[Projects] Loading projects from ${owner}/${repoName}`, "debug");

		try {
			const projects = await this.plugin.gitHubClient.fetchProjectsForRepository(owner, repoName);

			// Merge with existing tracked projects (preserve enabled state)
			const existingProjects = new Map(
				this.plugin.settings.trackedProjects.map(p => [p.id, p])
			);

			const newTrackedProjects: typeof this.plugin.settings.trackedProjects = [...this.plugin.settings.trackedProjects];

			for (const project of projects) {
				const existing = existingProjects.get(project.id);
				if (!existing) {
					// Add new project
					newTrackedProjects.push({
						id: project.id,
						title: project.title,
						number: project.number,
						url: project.url,
						owner: owner,
						enabled: true, // Default to enabled for new projects
					});
				}
			}

			this.plugin.settings.trackedProjects = newTrackedProjects;
			await this.plugin.saveSettings();

			const newProjectsCount = projects.length - (existingProjects.size - newTrackedProjects.length + projects.length);
			new Notice(`Found ${projects.length} projects from ${owner}/${repoName}`);
		} catch (error) {
			console.error(`Error fetching projects for ${owner}/${repoName}:`, error);
			throw new Error(`Failed to load projects from ${owner}/${repoName}: ${error}`);
		}
	}

	/**
	 * Render available projects list (similar to renderAvailableRepositories)
	 */
	private async renderAvailableProjects(
		container: HTMLElement,
	): Promise<void> {
		container.empty();

		if (!this.plugin.gitHubClient) {
			container.createEl("p", { text: "GitHub client not initialized" });
			return;
		}

		try {
			// Fetch all available projects from user and orgs
			const fetchedProjects = await this.plugin.gitHubClient.fetchAllAvailableProjects();

			const projects = fetchedProjects.map(p => ({
				id: p.id,
				title: p.title,
				number: p.number,
				url: p.url,
				owner: p.owner || "unknown",
				closed: p.closed,
			}));

			container.empty();

			// Actions bar
			const actionsBar = container.createDiv("github-issues-actions-bar");

			const bulkActionsContainer = actionsBar.createDiv(
				"github-issues-bulk-actions",
			);
			bulkActionsContainer.addClass("github-issues-bulk-actions-container");

			const selectionControls = bulkActionsContainer.createDiv(
				"github-issues-selection-controls",
			);
			const selectAllButton = selectionControls.createEl("button");
			const selectAllIcon = selectAllButton.createEl("span", {
				cls: "github-issues-button-icon",
			});
			setIcon(selectAllIcon, "check");
			selectAllButton.createEl("span", {
				cls: "github-issues-button-text",
				text: "Select all",
			});
			selectAllButton.addClass("github-issues-select-all-button");

			const selectNoneButton = selectionControls.createEl("button");
			const selectNoneIcon = selectNoneButton.createEl("span", {
				cls: "github-issues-button-icon",
			});
			setIcon(selectNoneIcon, "x");
			selectNoneButton.createEl("span", {
				cls: "github-issues-button-text",
				text: "Select none",
			});
			selectNoneButton.addClass("github-issues-select-none-button");

			const addSelectedButton = bulkActionsContainer.createEl("button");
			addSelectedButton.createEl("span", {
				cls: "github-issues-button-icon",
				text: "+",
			});
			const buttonTextContainer = addSelectedButton.createEl("span", {
				cls: "github-issues-button-text",
			});
			buttonTextContainer.setText("Add Selected (");
			buttonTextContainer.createEl("span", {
				cls: "selected-count",
				text: "0",
			});
			buttonTextContainer.appendText(")");
			addSelectedButton.addClass("github-issues-add-selected-button");
			addSelectedButton.disabled = true;

			// Search container
			const searchContainer = actionsBar.createDiv(
				"github-issues-search-container",
			);
			searchContainer.addClass("github-issues-search-modern");

			const searchInputWrapper = searchContainer.createDiv(
				"github-issues-search-wrapper",
			);
			const searchIconContainer = searchInputWrapper.createDiv(
				"github-issues-search-icon",
			);
			setIcon(searchIconContainer, "search");

			const searchInput = searchInputWrapper.createEl("input");
			searchInput.type = "text";
			searchInput.placeholder = "Search projects...";
			searchInput.addClass("github-issues-search-input-modern");

			const clearButton = searchInputWrapper.createDiv(
				"github-issues-clear-button github-issues-hidden",
			);
			setIcon(clearButton, "x");
			clearButton.addEventListener("click", () => {
				searchInput.value = "";
				clearButton.classList.add("github-issues-hidden");
				searchInput.dispatchEvent(new Event("input"));
				searchInput.focus();
			});

			const statsCounter = searchContainer.createDiv(
				"github-issues-stats-counter",
			);
			statsCounter.setText(`Showing all ${projects.length} projects`);

			// Project list container
			const projectListContainer = container.createDiv(
				"github-issues-repo-list",
			);

			const noResultsMessage = container.createDiv(
				"github-issues-no-results",
			);
			const noResultsIcon = noResultsMessage.createDiv(
				"github-issues-no-results-icon",
			);
			setIcon(noResultsIcon, "minus-circle");
			const noResultsText = noResultsMessage.createDiv(
				"github-issues-no-results-text",
			);
			noResultsText.setText("No matching projects found");
			noResultsMessage.addClass("github-issues-hidden");

			// Group projects by owner
			const projectsByOwner: Record<string, typeof projects> = {};
			for (const project of projects) {
				if (!projectsByOwner[project.owner]) {
					projectsByOwner[project.owner] = [];
				}
				projectsByOwner[project.owner].push(project);
			}

			const sortedOwners = Object.keys(projectsByOwner).sort();

			// Track selected projects
			const selectedProjects = new Set<string>();

			const updateSelectionUI = () => {
				const selectedCount = selectedProjects.size;
				const selectedCountSpan = addSelectedButton.querySelector(
					".selected-count",
				) as HTMLElement;
				if (selectedCountSpan) {
					selectedCountSpan.textContent = selectedCount.toString();
				}
				addSelectedButton.disabled = selectedCount === 0;
			};

			for (const ownerName of sortedOwners) {
				const ownerProjects = projectsByOwner[ownerName];
				const ownerContainer = projectListContainer.createDiv();
				ownerContainer.addClass("github-issues-repo-owner-group");
				ownerContainer.setAttribute("data-owner", ownerName.toLowerCase());

				const ownerHeader = ownerContainer.createDiv(
					"github-issues-repo-owner-header",
				);

				const chevronIcon = ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-chevron",
				});
				setIcon(chevronIcon, "chevron-right");

				const ownerIcon = ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-icon",
				});
				setIcon(ownerIcon, "user");
				ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-name",
					text: ownerName,
				});
				ownerHeader.createEl("span", {
					cls: "github-issues-repo-count",
					text: ownerProjects.length.toString(),
				});

				// Sort projects by title
				ownerProjects.sort((a, b) => a.title.localeCompare(b.title));

				const projectsListContainer = ownerContainer.createDiv(
					"github-issues-owner-repos",
				);

				// Make owner header collapsible
				ownerHeader.addEventListener("click", (e) => {
					e.stopPropagation();
					const isExpanded = ownerContainer.classList.contains("github-issues-owner-expanded");
					if (isExpanded) {
						ownerContainer.classList.remove("github-issues-owner-expanded");
						setIcon(chevronIcon, "chevron-right");
					} else {
						ownerContainer.classList.add("github-issues-owner-expanded");
						setIcon(chevronIcon, "chevron-down");
					}
				});

				for (const project of ownerProjects) {
					const isTracked = this.plugin.settings.trackedProjects.some(
						(p) => p.id === project.id,
					);

					const projectItem = projectsListContainer.createDiv();
					projectItem.addClass("github-issues-item");
					projectItem.setAttribute("data-project-id", project.id);
					projectItem.setAttribute("data-project-title", project.title.toLowerCase());
					projectItem.setAttribute("data-owner-name", project.owner.toLowerCase());

					const projectInfoContainer = projectItem.createDiv(
						"github-issues-repo-info",
					);

					if (!isTracked) {
						const checkboxContainer = projectInfoContainer.createDiv(
							"github-issues-repo-checkbox",
						);
						const checkbox = checkboxContainer.createEl("input");
						checkbox.type = "checkbox";
						checkbox.addClass("github-issues-checkbox");
						checkbox.checked = selectedProjects.has(project.id);

						checkbox.addEventListener("change", () => {
							if (checkbox.checked) {
								selectedProjects.add(project.id);
							} else {
								selectedProjects.delete(project.id);
							}
							updateSelectionUI();
						});
					}

					const projectIcon = projectInfoContainer.createDiv(
						"github-issues-repo-icon",
					);
					setIcon(projectIcon, "layout-dashboard");

					const projectText = projectInfoContainer.createEl("span");
					projectText.setText(project.title);
					projectText.addClass("github-issues-repo-name");

					projectInfoContainer.createEl("span", {
						text: ` #${project.number}`,
						cls: "github-issues-project-number",
					});

					if (project.closed) {
						projectInfoContainer.createEl("span", {
							text: "Closed",
							cls: "github-issues-closed-badge",
						});
					}

					const actionContainer = projectItem.createDiv(
						"github-issues-repo-action",
					);

					if (isTracked) {
						const trackedContainer = actionContainer.createDiv(
							"github-issues-tracked-container",
						);
						const trackedText = trackedContainer.createEl("span");
						trackedText.setText("Tracked");
						trackedText.addClass("github-issues-info-text");
					}
				}
			}

			// Select all button
			selectAllButton.onclick = () => {
				const checkboxes = projectListContainer.querySelectorAll(
					".github-issues-checkbox",
				) as NodeListOf<HTMLInputElement>;
				checkboxes.forEach((checkbox) => {
					const projectItem = checkbox.closest(".github-issues-item");
					if (
						projectItem &&
						!projectItem.classList.contains("github-issues-hidden")
					) {
						checkbox.checked = true;
						const projectId = projectItem.getAttribute("data-project-id");
						if (projectId) {
							selectedProjects.add(projectId);
						}
					}
				});
				updateSelectionUI();
			};

			// Select none button
			selectNoneButton.onclick = () => {
				const checkboxes = projectListContainer.querySelectorAll(
					".github-issues-checkbox",
				) as NodeListOf<HTMLInputElement>;
				checkboxes.forEach((checkbox) => {
					checkbox.checked = false;
				});
				selectedProjects.clear();
				updateSelectionUI();
			};

			// Add selected button
			addSelectedButton.onclick = async () => {
				if (selectedProjects.size > 0) {
					const existingProjects = new Map(
						this.plugin.settings.trackedProjects.map(p => [p.id, p])
					);

					for (const projectId of selectedProjects) {
						if (!existingProjects.has(projectId)) {
							const project = projects.find(p => p.id === projectId);
							if (project) {
								// Fetch status options
								let statusOptions: any[] = [];
								try {
									statusOptions = await this.plugin.gitHubClient!.fetchProjectStatusOptions(project.id);
								} catch {
									// Ignore errors
								}

								this.plugin.settings.trackedProjects.push({
									id: project.id,
									title: project.title,
									number: project.number,
									url: project.url,
									owner: project.owner,
									enabled: true,
									issueFolder: "GitHub/{project}",
									statusOptions: statusOptions,
								});
							}
						}
					}

					await this.plugin.saveSettings();
					new Notice(`Added ${selectedProjects.size} projects`);
					this.display();
				}
			};

			// Search functionality
			searchInput.addEventListener("input", () => {
				const searchTerm = searchInput.value.toLowerCase();

				if (searchTerm.length > 0) {
					clearButton.classList.remove("github-issues-hidden");
				} else {
					clearButton.classList.add("github-issues-hidden");
				}

				const projectItems = projectListContainer.querySelectorAll(
					".github-issues-item",
				);
				let visibleCount = 0;
				const visibleProjectsByOwner: Record<string, number> = {};

				projectItems.forEach((item) => {
					const projectTitle = item.getAttribute("data-project-title") || "";
					const ownerName = item.getAttribute("data-owner-name") || "";

					if (
						projectTitle.includes(searchTerm) ||
						ownerName.includes(searchTerm)
					) {
						(item as HTMLElement).classList.remove("github-issues-hidden");
						visibleCount++;
						if (!visibleProjectsByOwner[ownerName]) {
							visibleProjectsByOwner[ownerName] = 0;
						}
						visibleProjectsByOwner[ownerName]++;
					} else {
						(item as HTMLElement).classList.add("github-issues-hidden");
					}
				});

				const ownerGroups = projectListContainer.querySelectorAll(
					".github-issues-repo-owner-group",
				);
				ownerGroups.forEach((group) => {
					const ownerName = group.getAttribute("data-owner") || "";

					if (
						visibleProjectsByOwner[ownerName] &&
						visibleProjectsByOwner[ownerName] > 0
					) {
						(group as HTMLElement).classList.remove("github-issues-hidden");
					} else {
						(group as HTMLElement).classList.add("github-issues-hidden");
					}
				});

				if (searchTerm.length > 0) {
					statsCounter.setText(
						`Showing ${visibleCount} of ${projects.length} projects`,
					);
				} else {
					statsCounter.setText(`Showing all ${projects.length} projects`);
				}

				noResultsMessage.classList.toggle(
					"github-issues-hidden",
					visibleCount > 0,
				);
			});

			updateSelectionUI();
		} catch (error) {
			container.empty();
			container.createEl("p", {
				text: `Error loading projects: ${(error as Error).message}`,
			});
		}
	}
}
