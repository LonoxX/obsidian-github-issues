import { App, Notice, Setting, setIcon } from "obsidian";
import { RepositoryTracking } from "../types";
import GitHubTrackerPlugin from "../main";
import { FolderSuggest } from "./folder-suggest";
import { FileSuggest } from "./file-suggest";

export class RepositoryRenderer {
	constructor(
		private app: App,
		private plugin: GitHubTrackerPlugin,
		private fetchLabels?: (repo: string, repoObj: RepositoryTracking, filterType: 'labelFilters' | 'prLabelFilters', textArea: HTMLTextAreaElement) => Promise<void>,
		private fetchCollaborators?: (repo: string, repoObj: RepositoryTracking, filterType: 'assigneeFilters' | 'prAssigneeFilters', textArea: HTMLTextAreaElement) => Promise<void>,
	) {}

	renderIssueSettings(
		container: HTMLElement,
		repo: RepositoryTracking,
	): void {
		new Setting(container).setName("Issues").setHeading();

		container
			.createEl("p", {
				text: "Configure how issues are tracked and stored",
			})
			.addClass("setting-item-description");

		const issuesSettingsContainer = container.createDiv(
			"github-issues-settings-group",
		);

		// Container for the standard issues folder setting
		const standardIssuesFolderContainer = issuesSettingsContainer.createDiv();

		// Container for the custom issues folder setting
		const customIssuesFolderContainer = issuesSettingsContainer.createDiv();

		new Setting(container)
			.setName("Track issues")
			.setDesc("Enable or disable issue tracking for this repository")
			.addToggle((toggle) =>
				toggle.setValue(repo.trackIssues).onChange(async (value) => {
					repo.trackIssues = value;
					issuesSettingsContainer.classList.toggle(
						"github-issues-settings-hidden",
						!value,
					);
					await this.plugin.saveSettings();
				}),
			);
		issuesSettingsContainer.classList.toggle(
			"github-issues-settings-hidden",
			!repo.trackIssues,
		);

		// Update container visibility based on custom folder setting
		const updateContainerVisibility = () => {
			standardIssuesFolderContainer.classList.toggle(
				"github-issues-settings-hidden",
				repo.useCustomIssueFolder,
			);
			customIssuesFolderContainer.classList.toggle(
				"github-issues-settings-hidden",
				!repo.useCustomIssueFolder,
			);
		};

		const issuesFolderSetting = new Setting(standardIssuesFolderContainer)
			.setName("Issues folder")
			.setDesc("The folder where issue files will be stored")
			.addText((text) => {
				text
					.setPlaceholder("GitHub Issues")
					.setValue(repo.issueFolder)
					.onChange(async (value) => {
						repo.issueFolder = value;
						await this.plugin.saveSettings();
					});

				// Add folder suggestion functionality
				new FolderSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📁")
					.setTooltip("Browse folders")
					.onClick(() => {
						// The folder suggest will be triggered when user types
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		new Setting(issuesSettingsContainer)
			.setName("Use custom folder")
			.setDesc("Instead of organizing issues by Owner/Repository, place all issues in a custom folder")
			.addToggle((toggle) => {
				toggle
					.setValue(repo.useCustomIssueFolder)
					.onChange(async (value) => {
						repo.useCustomIssueFolder = value;
						updateContainerVisibility();
						await this.plugin.saveSettings();
					});
			});

		// Create the custom folder container first
		const customIssueFolderContainer = issuesSettingsContainer.createDiv(
			"github-issues-settings-group",
		);
		customIssueFolderContainer.classList.toggle(
			"github-issues-settings-hidden",
			!repo.useCustomIssueFolder,
		);

		new Setting(customIssuesFolderContainer)
			.setName("Custom issues folder")
			.setDesc("Specific folder path where all issues will be placed (overrides the folder structure)")
			.addText((text) => {
				text
					.setPlaceholder("e.g., Issues, GitHub/All Issues")
					.setValue(repo.customIssueFolder)
					.onChange(async (value) => {
						repo.customIssueFolder = value;
						await this.plugin.saveSettings();
					});

				// Add folder suggestion functionality
				new FolderSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📁")
					.setTooltip("Browse folders")
					.onClick(() => {
						// The folder suggest will be triggered when user types
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		// Set initial visibility
		updateContainerVisibility();

		new Setting(issuesSettingsContainer)
			.setName("Issue update mode")
			.setDesc("How to handle updates to existing issues")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("none", "None - Don't update existing issues")
					.addOption("update", "Update - Overwrite existing content")
					.addOption("append", "Append - Add new content at the end")
					.setValue(repo.issueUpdateMode)
					.onChange(async (value) => {
						repo.issueUpdateMode = value as
							| "none"
							| "update"
							| "append";
						await this.plugin.saveSettings();
					}),
			);

		// Label filtering settings
		this.renderLabelFilter(issuesSettingsContainer, repo, 'issue');

		// Assignee filtering settings
		this.renderAssigneeFilter(issuesSettingsContainer, repo, 'issue');

		new Setting(issuesSettingsContainer)
			.setName("Default: Allow issue deletion")
			.setDesc(
				"If enabled, issue files will be set to be deleted from your vault when the issue is closed or no longer matches your filter criteria",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(repo.allowDeleteIssue)
					.onChange(async (value) => {
						repo.allowDeleteIssue = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(issuesSettingsContainer)
			.setName("Issue note template")
			.setDesc(
				"Template for issue note filenames. Available variables: {title}, {number}, {status}, {author}, {assignee}, {labels}, {repository}, {owner}, {repoName}, {type}, {created}, {updated}. Example: \"{title} - Issue {number}\""
			)
			.addText((text) =>
				text
					.setPlaceholder("Issue - {number}")
					.setValue(repo.issueNoteTemplate || "Issue - {number}")
					.onChange(async (value) => {
						repo.issueNoteTemplate = value || "Issue - {number}";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(issuesSettingsContainer)
			.setName("Use custom issue content template")
			.setDesc("Enable custom template file for issue content instead of the default format")
			.addToggle((toggle) => {
				toggle
					.setValue(repo.useCustomIssueContentTemplate)
					.onChange(async (value) => {
						repo.useCustomIssueContentTemplate = value;
						customIssueTemplateContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value
						);
						await this.plugin.saveSettings();
					});
			});

		// Create the custom template container
		const customIssueTemplateContainer = issuesSettingsContainer.createDiv(
			"github-issues-settings-group",
		);
		customIssueTemplateContainer.classList.toggle(
			"github-issues-settings-hidden",
			!repo.useCustomIssueContentTemplate,
		);

		new Setting(customIssueTemplateContainer)
			.setName("Issue content template file")
			.setDesc("Path to a markdown file that will be used as template for issue content. See /templates folder for examples.")
			.addText((text) => {
				text
					.setPlaceholder("templates/default-issue-template.md")
					.setValue(repo.issueContentTemplate || "")
					.onChange(async (value) => {
						repo.issueContentTemplate = value;
						await this.plugin.saveSettings();
					});

				// Add file suggestion functionality
				new FileSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📄")
					.setTooltip("Browse template files")
					.onClick(() => {
						// The file suggest will be triggered when user types
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		new Setting(issuesSettingsContainer)
			.setName("Include issue comments")
			.setDesc(
				"If enabled, comments from issues will be included in the generated files",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(repo.includeIssueComments)
					.onChange(async (value) => {
						repo.includeIssueComments = value;
						await this.plugin.saveSettings();
					}),
			);
	}

	renderPullRequestSettings(
		container: HTMLElement,
		repo: RepositoryTracking,
	): void {
		new Setting(container).setName("Pull requests").setHeading();

		container
			.createEl("p", {
				text: "Configure how pull requests are tracked and stored",
			})
			.addClass("setting-item-description");

		const pullRequestsSettingsContainer = container.createDiv(
			"github-issues-settings-group",
		);

		// Container for the standard pull requests folder setting
		const standardPRFolderContainer = pullRequestsSettingsContainer.createDiv();

		// Container for the custom pull requests folder setting
		const customPRFolderContainer = pullRequestsSettingsContainer.createDiv();

		new Setting(container)
			.setName("Track pull requests")
			.setDesc(
				"Enable or disable pull request tracking for this repository",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(repo.trackPullRequest)
					.onChange(async (value) => {
						repo.trackPullRequest = value;
						pullRequestsSettingsContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);
		pullRequestsSettingsContainer.classList.toggle(
			"github-issues-settings-hidden",
			!repo.trackPullRequest,
		);

		// Update container visibility based on custom folder setting
		const updatePRContainerVisibility = () => {
			standardPRFolderContainer.classList.toggle(
				"github-issues-settings-hidden",
				repo.useCustomPullRequestFolder,
			);
			customPRFolderContainer.classList.toggle(
				"github-issues-settings-hidden",
				!repo.useCustomPullRequestFolder,
			);
		};

		const pullRequestsFolderSetting = new Setting(standardPRFolderContainer)
			.setName("Pull requests folder")
			.setDesc("The folder where pull request files will be stored")
			.addText((text) => {
				text
					.setPlaceholder("GitHub Pull Requests")
					.setValue(repo.pullRequestFolder)
					.onChange(async (value) => {
						repo.pullRequestFolder = value;
						await this.plugin.saveSettings();
					});

				// Add folder suggestion functionality
				new FolderSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📁")
					.setTooltip("Browse folders")
					.onClick(() => {
						// The folder suggest will be triggered when user types
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		new Setting(pullRequestsSettingsContainer)
			.setName("Use custom folder")
			.setDesc("Instead of organizing pull requests by Owner/Repository, place all pull requests in a custom folder")
			.addToggle((toggle) => {
				toggle
					.setValue(repo.useCustomPullRequestFolder)
					.onChange(async (value) => {
						repo.useCustomPullRequestFolder = value;
						updatePRContainerVisibility();
						await this.plugin.saveSettings();
					});
			});

		new Setting(customPRFolderContainer)
			.setName("Custom pull requests folder")
			.setDesc("Specific folder path where all pull requests will be placed (overrides the folder structure)")
			.addText((text) => {
				text
					.setPlaceholder("e.g., Pull Requests, GitHub/All PRs")
					.setValue(repo.customPullRequestFolder)
					.onChange(async (value) => {
						repo.customPullRequestFolder = value;
						await this.plugin.saveSettings();
					});

				// Add folder suggestion functionality
				new FolderSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📁")
					.setTooltip("Browse folders")
					.onClick(() => {
						// The folder suggest will be triggered when user types
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		new Setting(pullRequestsSettingsContainer)
			.setName("Pull request update mode")
			.setDesc("How to handle updates to existing pull requests")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"none",
						"None - Don't update existing pull requests",
					)
					.addOption("update", "Update - Overwrite existing content")
					.addOption("append", "Append - Add new content at the end")
					.setValue(repo.pullRequestUpdateMode)
					.onChange(async (value) => {
						repo.pullRequestUpdateMode = value as
							| "none"
							| "update"
							| "append";
						await this.plugin.saveSettings();
					}),
			);

		// Label filtering settings for pull requests
		this.renderLabelFilter(pullRequestsSettingsContainer, repo, 'pr');

		// Assignee filtering settings for pull requests
		this.renderAssigneeFilter(pullRequestsSettingsContainer, repo, 'pr');

		new Setting(pullRequestsSettingsContainer)
			.setName("Pull request note template")
			.setDesc(
				"Template for pull request note filenames. Available variables: {title}, {number}, {status}, {author}, {assignee}, {labels}, {repository}, {owner}, {repoName}, {type}, {created}, {updated}. Example: \"{title} - PR {number}\""
			)
			.addText((text) =>
				text
					.setPlaceholder("PR - {number}")
					.setValue(repo.pullRequestNoteTemplate || "PR - {number}")
					.onChange(async (value) => {
						repo.pullRequestNoteTemplate = value || "PR - {number}";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(pullRequestsSettingsContainer)
			.setName("Use custom pull request content template")
			.setDesc("Enable custom template file for pull request content instead of the default format")
			.addToggle((toggle) => {
				toggle
					.setValue(repo.useCustomPullRequestContentTemplate)
					.onChange(async (value) => {
						repo.useCustomPullRequestContentTemplate = value;
						customPRTemplateContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value
						);
						await this.plugin.saveSettings();
					});
			});

		// Create the custom template container
		const customPRTemplateContainer = pullRequestsSettingsContainer.createDiv(
			"github-issues-settings-group",
		);
		customPRTemplateContainer.classList.toggle(
			"github-issues-settings-hidden",
			!repo.useCustomPullRequestContentTemplate,
		);

		new Setting(customPRTemplateContainer)
			.setName("Pull request content template file")
			.setDesc("Path to a markdown file that will be used as template for pull request content. See /templates folder for examples.")
			.addText((text) => {
				text
					.setPlaceholder("templates/default-pr-template.md")
					.setValue(repo.pullRequestContentTemplate || "")
					.onChange(async (value) => {
						repo.pullRequestContentTemplate = value;
						await this.plugin.saveSettings();
					});

				// Add file suggestion functionality
				new FileSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📄")
					.setTooltip("Browse template files")
					.onClick(() => {
						// The file suggest will be triggered when user types
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		new Setting(pullRequestsSettingsContainer)
			.setName("Default: Allow pull request deletion")
			.setDesc(
				"If enabled, pull request files will be set to be deleted from your vault when the pull request is closed or no longer matches your filter criteria",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(repo.allowDeletePullRequest)
					.onChange(async (value) => {
						repo.allowDeletePullRequest = value;
						await this.plugin.saveSettings();
					}),
			);

		// Set initial visibility
		updatePRContainerVisibility();
	}

	private renderLabelFilter(
		container: HTMLElement,
		repo: RepositoryTracking,
		type: 'issue' | 'pr'
	): void {
		const enableFilterProp = type === 'issue' ? 'enableLabelFilter' : 'enablePrLabelFilter';
		const filterModeProp = type === 'issue' ? 'labelFilterMode' : 'prLabelFilterMode';
		const filtersProp = type === 'issue' ? 'labelFilters' : 'prLabelFilters';
		const title = type === 'issue' ? 'issues' : 'pull requests';

		new Setting(container)
			.setName(`Filter ${title} by labels`)
			.setDesc(`Enable filtering ${title} based on their labels`)
			.addToggle((toggle) =>
				toggle
					.setValue(repo[enableFilterProp] ?? false)
					.onChange(async (value) => {
						repo[enableFilterProp] = value;
						labelFilterContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const labelFilterContainer = container.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		labelFilterContainer.classList.toggle(
			"github-issues-settings-hidden",
			!(repo[enableFilterProp] ?? false),
		);

		new Setting(labelFilterContainer)
			.setName("Label filter mode")
			.setDesc(`Choose whether to include or exclude ${title} with the specified labels`)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("include", `Include - Only show ${title} with these labels`)
					.addOption("exclude", `Exclude - Hide ${title} with these labels`)
					.setValue(repo[filterModeProp] ?? "include")
					.onChange(async (value) => {
						repo[filterModeProp] = value as "include" | "exclude";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(labelFilterContainer)
			.setName("Label filters")
			.setDesc("Comma-separated list of labels to filter by (case-sensitive)")
			.addTextArea((text) => {
				text
					.setPlaceholder("bug, enhancement, help wanted")
					.setValue((repo[filtersProp] || []).join(", "))
					.onChange(async (value) => {
						repo[filtersProp] = value
							.split(",")
							.map(label => label.trim())
							.filter(label => label.length > 0);
						await this.plugin.saveSettings();
					});

				return text;
			})
			.addButton((button) =>
				button
					.setButtonText("Fetch available labels")
					.setTooltip("Load labels from this repository to help with configuration")
					.onClick(async () => {
						const textArea = button.buttonEl.closest('.setting-item')?.querySelector('textarea');
						if (textArea && this.fetchLabels) {
							await this.fetchLabels(repo.repository, repo, filtersProp, textArea as HTMLTextAreaElement);
						}
					}),
			);
	}

	private renderAssigneeFilter(
		container: HTMLElement,
		repo: RepositoryTracking,
		type: 'issue' | 'pr'
	): void {
		const enableFilterProp = type === 'issue' ? 'enableAssigneeFilter' : 'enablePrAssigneeFilter';
		const filterModeProp = type === 'issue' ? 'assigneeFilterMode' : 'prAssigneeFilterMode';
		const filtersProp = type === 'issue' ? 'assigneeFilters' : 'prAssigneeFilters';
		const title = type === 'issue' ? 'issues' : 'pull requests';
		const titleShort = type === 'issue' ? 'Issues' : 'PRs';

		new Setting(container)
			.setName(`Filter ${title} by assignees`)
			.setDesc(`Enable filtering ${title} based on who they are assigned to`)
			.addToggle((toggle) =>
				toggle
					.setValue(repo[enableFilterProp] ?? false)
					.onChange(async (value) => {
						repo[enableFilterProp] = value;
						assigneeFilterContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const assigneeFilterContainer = container.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		assigneeFilterContainer.classList.toggle(
			"github-issues-settings-hidden",
			!(repo[enableFilterProp] ?? false),
		);

		new Setting(assigneeFilterContainer)
			.setName("Assignee filter mode")
			.setDesc(`Choose how to filter ${title} by assignees`)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("assigned-to-me", `Assigned to me - Only my ${title}`)
					.addOption("assigned-to-specific", "Assigned to specific users")
					.addOption("unassigned", `Unassigned - ${titleShort} with no assignee`)
					.addOption("any-assigned", `Any assigned - ${titleShort} with any assignee`)
					.setValue(repo[filterModeProp] ?? "assigned-to-me")
					.onChange(async (value) => {
						repo[filterModeProp] = value as "assigned-to-me" | "assigned-to-specific" | "unassigned" | "any-assigned";
						assigneeSpecificContainer.classList.toggle(
							"github-issues-settings-hidden",
							value !== "assigned-to-specific",
						);
						await this.plugin.saveSettings();
					}),
			);

		const assigneeSpecificContainer = assigneeFilterContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		assigneeSpecificContainer.classList.toggle(
			"github-issues-settings-hidden",
			(repo[filterModeProp] ?? "assigned-to-me") !== "assigned-to-specific",
		);

		new Setting(assigneeSpecificContainer)
			.setName("Specific assignees")
			.setDesc("Comma-separated list of GitHub usernames to filter by")
			.addTextArea((text) => {
				text
					.setPlaceholder("username1, username2, username3")
					.setValue((repo[filtersProp] || []).join(", "))
					.onChange(async (value) => {
						repo[filtersProp] = value
							.split(",")
							.map(username => username.trim())
							.filter(username => username.length > 0);
						await this.plugin.saveSettings();
					});

				return text;
			})
			.addButton((button) =>
				button
					.setButtonText("Fetch collaborators")
					.setTooltip("Load collaborators from this repository to help with configuration")
					.onClick(async () => {
						const textArea = button.buttonEl.closest('.setting-item')?.querySelector('textarea');
						if (textArea && this.fetchCollaborators) {
							await this.fetchCollaborators(repo.repository, repo, filtersProp, textArea as HTMLTextAreaElement);
						}
					}),
			);
	}
}
