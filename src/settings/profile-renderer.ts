import { App, Modal, Notice, Setting, SettingGroup } from "obsidian";
import {
	DEFAULT_PROJECT_FOLDER_TEMPLATE,
	SettingsProfile,
	ProfileType,
	DEFAULT_REPOSITORY_PROFILE,
	DEFAULT_PROJECT_PROFILE,
} from "../types";
import IssueTrackerPlugin from "../main";
import { ConfirmModal } from "./confirm-modal";
import { FolderSuggest } from "./folder-suggest";
import { FileSuggest } from "./file-suggest";

export class ProfileRenderer {
	private selectedProfileId: string = "default";

	constructor(
		private app: App,
		private plugin: IssueTrackerPlugin,
	) {}

	/**
	 * Render settings fields for a repository-type profile
	 */
	/** Render the editor of one profile (repository or project type). */
	renderProfileEditor(
		container: HTMLElement,
		profile: SettingsProfile,
	): void {
		if (profile.type === "repository") {
			this.renderRepositoryProfileSettings(container, profile);
		} else {
			this.renderProjectProfileSettings(container, profile);
		}
	}

	private renderRepositoryProfileSettings(
		container: HTMLElement,
		profile: SettingsProfile,
	): void {
		// Issues subsection
		const issuesContainer = new SettingGroup(container).setHeading(
			"Issues",
		).listEl;

		new Setting(issuesContainer)
			.setName("Track issues")
			.setDesc("Sync issues of these repositories")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.trackIssues ?? true)
					.onChange(async (value) => {
						profile.trackIssues = value;
						issuesSettingsContainer.classList.toggle(
							"github-issues-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const issuesSettingsContainer = issuesContainer.createDiv(
			"github-issues-subgroup",
		);
		issuesSettingsContainer.classList.toggle(
			"github-issues-hidden",
			!(profile.trackIssues ?? true),
		);

		new Setting(issuesSettingsContainer)
			.setName("Update mode")
			.setDesc("How to handle updates to existing issue files")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("none", "None - Don't update existing files")
					.addOption("update", "Update - Replace entire content")
					.addOption("append", "Append - Add new content")
					.setValue(profile.issueUpdateMode ?? "none")
					.onChange(async (value) => {
						profile.issueUpdateMode = value as
							"none" | "update" | "append";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(issuesSettingsContainer)
			.setName("Allow deletion")
			.setDesc("Delete notes when closed on the server")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.allowDeleteIssue ?? true)
					.onChange(async (value) => {
						profile.allowDeleteIssue = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(issuesSettingsContainer)
			.setName("Folder")
			.setDesc("Placeholders: {provider}, {owner}, {repo}")
			.addText((text) => {
				text.setPlaceholder("GitHub")
					.setValue(profile.issueFolder ?? "GitHub")
					.onChange(async (value) => {
						profile.issueFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(issuesSettingsContainer)
			.setName("Filename template")
			.setDesc("Template for issue filenames")
			.addText((text) =>
				text
					.setPlaceholder("Issue - {number}")
					.setValue(profile.issueNoteTemplate ?? "Issue - {number}")
					.onChange(async (value) => {
						profile.issueNoteTemplate = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(issuesSettingsContainer)
			.setName("Content template")
			.setDesc("Template file for issue content (optional)")
			.addText((text) => {
				text.setPlaceholder("")
					.setValue(profile.issueContentTemplate ?? "")
					.onChange(async (value) => {
						profile.issueContentTemplate = value;
						profile.useCustomIssueContentTemplate = !!value;
						await this.plugin.saveSettings();
					});
				new FileSuggest(this.app, text.inputEl);
			});

		new Setting(issuesSettingsContainer)
			.setName("Include comments")
			.setDesc("Include comments in issue files")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.includeIssueComments ?? true)
					.onChange(async (value) => {
						profile.includeIssueComments = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(issuesSettingsContainer)
			.setName("Include closed issues")
			.setDesc("Also track closed issues")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.includeClosedIssues ?? false)
					.onChange(async (value) => {
						profile.includeClosedIssues = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(issuesSettingsContainer)
			.setName("Include sub-issues")
			.setDesc("Include sub-issues in generated issue files")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.includeSubIssues ?? false)
					.onChange(async (value) => {
						profile.includeSubIssues = value;
						await this.plugin.saveSettings();
					}),
			);

		// Issue filter defaults
		new Setting(issuesSettingsContainer)
			.setName("Issue filters")
			.setHeading();

		new Setting(issuesSettingsContainer)
			.setName("Filter issues by labels")
			.setDesc("Default label filter")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.enableLabelFilter !== undefined)
					.onChange(async (value) => {
						if (value) {
							profile.enableLabelFilter = true;
						} else {
							delete (
								profile as unknown as Record<string, unknown>
							).enableLabelFilter;
						}
						issueLabelFilterControls.classList.toggle(
							"github-issues-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const issueLabelFilterEnabled = profile.enableLabelFilter !== undefined;
		const issueLabelFilterControls = issuesSettingsContainer.createDiv(
			"github-issues-subgroup",
		);
		issueLabelFilterControls.classList.toggle(
			"github-issues-hidden",
			!issueLabelFilterEnabled,
		);

		new Setting(issueLabelFilterControls)
			.setName("Label filter mode")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"include",
						"Include - Only show issues with these labels",
					)
					.addOption(
						"exclude",
						"Exclude - Hide issues with these labels",
					)
					.setValue(profile.labelFilterMode ?? "include")
					.onChange(async (value) => {
						profile.labelFilterMode = value as
							"include" | "exclude";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(issueLabelFilterControls)
			.setName("Label filters")
			.setDesc("Comma-separated list of labels (case-sensitive)")
			.addTextArea((text) => {
				text.setPlaceholder("bug, enhancement, help wanted")
					.setValue((profile.labelFilters || []).join(", "))
					.onChange(async (value) => {
						profile.labelFilters = value
							.split(",")
							.map((l) => l.trim())
							.filter((l) => l.length > 0);
						await this.plugin.saveSettings();
					});
				return text;
			});

		new Setting(issuesSettingsContainer)
			.setName("Filter issues by assignees")
			.setDesc("Default assignee filter")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.enableAssigneeFilter !== undefined)
					.onChange(async (value) => {
						if (value) {
							profile.enableAssigneeFilter = true;
						} else {
							delete (
								profile as unknown as Record<string, unknown>
							).enableAssigneeFilter;
						}
						issueAssigneeFilterControls.classList.toggle(
							"github-issues-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const issueAssigneeFilterEnabled =
			profile.enableAssigneeFilter !== undefined;
		const issueAssigneeFilterControls = issuesSettingsContainer.createDiv(
			"github-issues-subgroup",
		);
		issueAssigneeFilterControls.classList.toggle(
			"github-issues-hidden",
			!issueAssigneeFilterEnabled,
		);

		const issueAssigneeModeOptions: Array<{
			value:
				| "assigned-to-me"
				| "assigned-to-specific"
				| "unassigned"
				| "any-assigned";
			label: string;
		}> = [
			{ value: "assigned-to-me", label: "Assigned to me" },
			{
				value: "assigned-to-specific",
				label: "Assigned to specific users",
			},
			{ value: "unassigned", label: "Unassigned" },
			{ value: "any-assigned", label: "Any assigned" },
		];

		const issueAssigneeSpecificContainer =
			issueAssigneeFilterControls.createDiv("github-issues-subgroup");
		issueAssigneeSpecificContainer.classList.toggle(
			"github-issues-hidden",
			!(profile.assigneeFilterModes ?? []).includes(
				"assigned-to-specific",
			),
		);

		for (const option of issueAssigneeModeOptions) {
			new Setting(issueAssigneeFilterControls)
				.setName(option.label)
				.addToggle((toggle) => {
					toggle
						.setValue(
							(profile.assigneeFilterModes ?? []).includes(
								option.value,
							),
						)
						.onChange(async (checked) => {
							const modes = [
								...(profile.assigneeFilterModes ?? []),
							];
							if (checked) {
								if (!modes.includes(option.value))
									modes.push(option.value);
							} else {
								const idx = modes.indexOf(option.value);
								if (idx >= 0) modes.splice(idx, 1);
							}
							profile.assigneeFilterModes = modes;
							issueAssigneeSpecificContainer.classList.toggle(
								"github-issues-hidden",
								!modes.includes("assigned-to-specific"),
							);
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(issueAssigneeSpecificContainer)
			.setName("Specific assignees")
			.setDesc("Comma-separated list of GitHub usernames")
			.addTextArea((text) => {
				text.setPlaceholder("username1, username2")
					.setValue((profile.assigneeFilters || []).join(", "))
					.onChange(async (value) => {
						profile.assigneeFilters = value
							.split(",")
							.map((u) => u.trim())
							.filter((u) => u.length > 0);
						await this.plugin.saveSettings();
					});
				return text;
			});

		// Pull Requests subsection
		const prContainer = new SettingGroup(container).setHeading(
			"Pull requests",
		).listEl;

		new Setting(prContainer)
			.setName("Track pull requests")
			.setDesc("Sync pull requests of these repositories")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.trackPullRequest ?? false)
					.onChange(async (value) => {
						profile.trackPullRequest = value;
						prSettingsContainer.classList.toggle(
							"github-issues-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const prSettingsContainer = prContainer.createDiv(
			"github-issues-subgroup",
		);
		prSettingsContainer.classList.toggle(
			"github-issues-hidden",
			!(profile.trackPullRequest ?? false),
		);

		new Setting(prSettingsContainer)
			.setName("Update mode")
			.setDesc("How to handle updates to existing pull request files")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("none", "None - Don't update existing files")
					.addOption("update", "Update - Replace entire content")
					.addOption("append", "Append - Add new content")
					.setValue(profile.pullRequestUpdateMode ?? "none")
					.onChange(async (value) => {
						profile.pullRequestUpdateMode = value as
							"none" | "update" | "append";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(prSettingsContainer)
			.setName("Allow deletion")
			.setDesc(
				"Allow deletion of local PR files when closed on the server",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(profile.allowDeletePullRequest ?? true)
					.onChange(async (value) => {
						profile.allowDeletePullRequest = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(prSettingsContainer)
			.setName("Folder")
			.setDesc("Placeholders: {provider}, {owner}, {repo}")
			.addText((text) => {
				text.setPlaceholder("GitHub Pull Requests")
					.setValue(
						profile.pullRequestFolder ?? "GitHub Pull Requests",
					)
					.onChange(async (value) => {
						profile.pullRequestFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(prSettingsContainer)
			.setName("Filename template")
			.setDesc("Template for pull request filenames")
			.addText((text) =>
				text
					.setPlaceholder("PR - {number}")
					.setValue(
						profile.pullRequestNoteTemplate ?? "PR - {number}",
					)
					.onChange(async (value) => {
						profile.pullRequestNoteTemplate = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(prSettingsContainer)
			.setName("Content template")
			.setDesc("Template file for pull request content (optional)")
			.addText((text) => {
				text.setPlaceholder("")
					.setValue(profile.pullRequestContentTemplate ?? "")
					.onChange(async (value) => {
						profile.pullRequestContentTemplate = value;
						profile.useCustomPullRequestContentTemplate = !!value;
						await this.plugin.saveSettings();
					});
				new FileSuggest(this.app, text.inputEl);
			});

		new Setting(prSettingsContainer)
			.setName("Include comments")
			.setDesc("Include comments in pull request files")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.includePullRequestComments ?? true)
					.onChange(async (value) => {
						profile.includePullRequestComments = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(prSettingsContainer)
			.setName("Include closed pull requests")
			.setDesc("Also track closed pull requests")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.includeClosedPullRequests ?? false)
					.onChange(async (value) => {
						profile.includeClosedPullRequests = value;
						await this.plugin.saveSettings();
					}),
			);

		// PR filter defaults
		new Setting(prSettingsContainer)
			.setName("Pull request filters")
			.setHeading();

		new Setting(prSettingsContainer)
			.setName("Filter pull requests by labels")
			.setDesc("Default label filter")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.enablePrLabelFilter !== undefined)
					.onChange(async (value) => {
						if (value) {
							profile.enablePrLabelFilter = true;
						} else {
							delete (
								profile as unknown as Record<string, unknown>
							).enablePrLabelFilter;
						}
						prLabelFilterControls.classList.toggle(
							"github-issues-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const prLabelFilterEnabled = profile.enablePrLabelFilter !== undefined;
		const prLabelFilterControls = prSettingsContainer.createDiv(
			"github-issues-subgroup",
		);
		prLabelFilterControls.classList.toggle(
			"github-issues-hidden",
			!prLabelFilterEnabled,
		);

		new Setting(prLabelFilterControls)
			.setName("Label filter mode")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"include",
						"Include - Only show pull requests with these labels",
					)
					.addOption(
						"exclude",
						"Exclude - Hide pull requests with these labels",
					)
					.setValue(profile.prLabelFilterMode ?? "include")
					.onChange(async (value) => {
						profile.prLabelFilterMode = value as
							"include" | "exclude";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(prLabelFilterControls)
			.setName("Label filters")
			.setDesc("Comma-separated list of labels (case-sensitive)")
			.addTextArea((text) => {
				text.setPlaceholder("bug, enhancement, help wanted")
					.setValue((profile.prLabelFilters || []).join(", "))
					.onChange(async (value) => {
						profile.prLabelFilters = value
							.split(",")
							.map((l) => l.trim())
							.filter((l) => l.length > 0);
						await this.plugin.saveSettings();
					});
				return text;
			});

		new Setting(prSettingsContainer)
			.setName("Filter pull requests by assignees")
			.setDesc("Default assignee filter")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.enablePrAssigneeFilter !== undefined)
					.onChange(async (value) => {
						if (value) {
							profile.enablePrAssigneeFilter = true;
						} else {
							delete (
								profile as unknown as Record<string, unknown>
							).enablePrAssigneeFilter;
						}
						prAssigneeFilterControls.classList.toggle(
							"github-issues-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const prAssigneeFilterEnabled =
			profile.enablePrAssigneeFilter !== undefined;
		const prAssigneeFilterControls = prSettingsContainer.createDiv(
			"github-issues-subgroup",
		);
		prAssigneeFilterControls.classList.toggle(
			"github-issues-hidden",
			!prAssigneeFilterEnabled,
		);

		const prAssigneeModeOptions: Array<{
			value:
				| "assigned-to-me"
				| "assigned-to-specific"
				| "unassigned"
				| "any-assigned";
			label: string;
		}> = [
			{ value: "assigned-to-me", label: "Assigned to me" },
			{
				value: "assigned-to-specific",
				label: "Assigned to specific users",
			},
			{ value: "unassigned", label: "Unassigned" },
			{ value: "any-assigned", label: "Any assigned" },
		];

		const prAssigneeSpecificContainer = prAssigneeFilterControls.createDiv(
			"github-issues-subgroup",
		);
		prAssigneeSpecificContainer.classList.toggle(
			"github-issues-hidden",
			!(profile.prAssigneeFilterModes ?? []).includes(
				"assigned-to-specific",
			),
		);

		for (const option of prAssigneeModeOptions) {
			new Setting(prAssigneeFilterControls)
				.setName(option.label)
				.addToggle((toggle) => {
					toggle
						.setValue(
							(profile.prAssigneeFilterModes ?? []).includes(
								option.value,
							),
						)
						.onChange(async (checked) => {
							const modes = [
								...(profile.prAssigneeFilterModes ?? []),
							];
							if (checked) {
								if (!modes.includes(option.value))
									modes.push(option.value);
							} else {
								const idx = modes.indexOf(option.value);
								if (idx >= 0) modes.splice(idx, 1);
							}
							profile.prAssigneeFilterModes = modes;
							prAssigneeSpecificContainer.classList.toggle(
								"github-issues-hidden",
								!modes.includes("assigned-to-specific"),
							);
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(prAssigneeSpecificContainer)
			.setName("Specific assignees")
			.setDesc("Comma-separated list of GitHub usernames")
			.addTextArea((text) => {
				text.setPlaceholder("username1, username2")
					.setValue((profile.prAssigneeFilters || []).join(", "))
					.onChange(async (value) => {
						profile.prAssigneeFilters = value
							.split(",")
							.map((u) => u.trim())
							.filter((u) => u.length > 0);
						await this.plugin.saveSettings();
					});
				return text;
			});

		new Setting(prSettingsContainer)
			.setName("Filter pull requests by reviewers")
			.setDesc("Default reviewer filter")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.enablePrReviewerFilter !== undefined)
					.onChange(async (value) => {
						if (value) {
							profile.enablePrReviewerFilter = true;
						} else {
							delete (
								profile as unknown as Record<string, unknown>
							).enablePrReviewerFilter;
						}
						prReviewerFilterControls.classList.toggle(
							"github-issues-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const prReviewerFilterEnabled =
			profile.enablePrReviewerFilter !== undefined;
		const prReviewerFilterControls = prSettingsContainer.createDiv(
			"github-issues-subgroup",
		);
		prReviewerFilterControls.classList.toggle(
			"github-issues-hidden",
			!prReviewerFilterEnabled,
		);

		const prReviewerModeOptions: Array<{
			value:
				| "review-requested-from-me"
				| "review-requested-from-specific"
				| "no-review-requested"
				| "any-review-requested";
			label: string;
		}> = [
			{
				value: "review-requested-from-me",
				label: "Review requested from me",
			},
			{
				value: "review-requested-from-specific",
				label: "Review requested from specific users",
			},
			{ value: "no-review-requested", label: "No review requested" },
			{ value: "any-review-requested", label: "Any review requested" },
		];

		const prReviewerSpecificContainer = prReviewerFilterControls.createDiv(
			"github-issues-subgroup",
		);
		prReviewerSpecificContainer.classList.toggle(
			"github-issues-hidden",
			!(profile.prReviewerFilterModes ?? []).includes(
				"review-requested-from-specific",
			),
		);

		for (const option of prReviewerModeOptions) {
			new Setting(prReviewerFilterControls)
				.setName(option.label)
				.addToggle((toggle) => {
					toggle
						.setValue(
							(profile.prReviewerFilterModes ?? []).includes(
								option.value,
							),
						)
						.onChange(async (checked) => {
							const modes = [
								...(profile.prReviewerFilterModes ?? []),
							];
							if (checked) {
								if (!modes.includes(option.value))
									modes.push(option.value);
							} else {
								const idx = modes.indexOf(option.value);
								if (idx >= 0) modes.splice(idx, 1);
							}
							profile.prReviewerFilterModes = modes;
							prReviewerSpecificContainer.classList.toggle(
								"github-issues-hidden",
								!modes.includes(
									"review-requested-from-specific",
								),
							);
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(prReviewerSpecificContainer)
			.setName("Specific reviewers")
			.setDesc("Comma-separated list of GitHub usernames")
			.addTextArea((text) => {
				text.setPlaceholder("username1, username2")
					.setValue((profile.prReviewerFilters || []).join(", "))
					.onChange(async (value) => {
						profile.prReviewerFilters = value
							.split(",")
							.map((u) => u.trim())
							.filter((u) => u.length > 0);
						await this.plugin.saveSettings();
					});
				return text;
			});
	}

	/**
	 * Render settings fields for a project-type profile
	 */
	private renderProjectProfileSettings(
		container: HTMLElement,
		profile: SettingsProfile,
	): void {
		const settingsContainer = new SettingGroup(container).setHeading(
			"Project settings",
		).listEl;

		new Setting(settingsContainer)
			.setName("Issue folder")
			.setDesc("Placeholders: {provider}, {project}")
			.addText((text) => {
				text.setPlaceholder(DEFAULT_PROJECT_FOLDER_TEMPLATE)
					.setValue(
						profile.projectIssueFolder ??
							DEFAULT_PROJECT_FOLDER_TEMPLATE,
					)
					.onChange(async (value) => {
						profile.projectIssueFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(settingsContainer)
			.setName("Pull request folder")
			.setDesc("Placeholders: {provider}, {project}")
			.addText((text) => {
				text.setPlaceholder(DEFAULT_PROJECT_FOLDER_TEMPLATE)
					.setValue(
						profile.projectPullRequestFolder ??
							DEFAULT_PROJECT_FOLDER_TEMPLATE,
					)
					.onChange(async (value) => {
						profile.projectPullRequestFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(settingsContainer)
			.setName("Issue filename template")
			.setDesc("Template for project issue filenames")
			.addText((text) =>
				text
					.setPlaceholder("Issue - {number}")
					.setValue(
						profile.projectIssueNoteTemplate ?? "Issue - {number}",
					)
					.onChange(async (value) => {
						profile.projectIssueNoteTemplate = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(settingsContainer)
			.setName("PR filename template")
			.setDesc("Template for project pull request filenames")
			.addText((text) =>
				text
					.setPlaceholder("PR - {number}")
					.setValue(
						profile.projectPullRequestNoteTemplate ??
							"PR - {number}",
					)
					.onChange(async (value) => {
						profile.projectPullRequestNoteTemplate = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(settingsContainer)
			.setName("Issue content template")
			.setDesc("Template file for project issue content (optional)")
			.addText((text) => {
				text.setPlaceholder("")
					.setValue(profile.projectIssueContentTemplate ?? "")
					.onChange(async (value) => {
						profile.projectIssueContentTemplate = value;
						profile.projectUseCustomIssueContentTemplate = !!value;
						await this.plugin.saveSettings();
					});
				new FileSuggest(this.app, text.inputEl);
			});

		new Setting(settingsContainer)
			.setName("PR content template")
			.setDesc(
				"Template file for project pull request content (optional)",
			)
			.addText((text) => {
				text.setPlaceholder("")
					.setValue(profile.projectPullRequestContentTemplate ?? "")
					.onChange(async (value) => {
						profile.projectPullRequestContentTemplate = value;
						profile.projectUseCustomPullRequestContentTemplate =
							!!value;
						await this.plugin.saveSettings();
					});
				new FileSuggest(this.app, text.inputEl);
			});

		new Setting(settingsContainer)
			.setName("Skip hidden statuses on sync")
			.setDesc("Skip items with hidden statuses during sync")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.skipHiddenStatusesOnSync ?? false)
					.onChange(async (value) => {
						profile.skipHiddenStatusesOnSync = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(settingsContainer)
			.setName("Show empty columns")
			.setDesc("Show empty columns in Kanban view")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.showEmptyColumns ?? true)
					.onChange(async (value) => {
						profile.showEmptyColumns = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(settingsContainer)
			.setName("Include sub-issues")
			.setDesc("Include sub-issues for project items")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.projectIncludeSubIssues ?? false)
					.onChange(async (value) => {
						profile.projectIncludeSubIssues = value;
						await this.plugin.saveSettings();
					}),
			);
	}

	/**
	 * Show modal to create a new profile
	 */
	showCreateProfileModal(onRefreshNeeded: () => void): void {
		const modal = new Modal(this.app);
		modal.modalEl.addClass("github-issues-modal");
		modal.setTitle("Create profile");

		let profileName = "";
		let profileType: ProfileType = "repository";
		let nameInput: HTMLInputElement | null = null;

		new Setting(modal.contentEl)
			.setName("Profile name")
			.setDesc("Shown in the profile picker of repositories and projects")
			.addText((text) => {
				nameInput = text.inputEl;
				text.setPlaceholder("My custom profile").onChange((value) => {
					profileName = value;
				});
			});

		new Setting(modal.contentEl)
			.setName("Profile type")
			.setDesc("Repository or project")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("repository", "Repository")
					.addOption("project", "Project")
					.setValue("repository")
					.onChange((value) => {
						profileType = value as ProfileType;
					}),
			);

		const create = async () => {
			if (!profileName.trim()) {
				new Notice("Please enter a profile name");
				nameInput?.focus();
				return;
			}

			const baseProfile =
				profileType === "repository"
					? DEFAULT_REPOSITORY_PROFILE
					: DEFAULT_PROJECT_PROFILE;

			const newProfile: SettingsProfile = {
				...baseProfile,
				id: `profile-${Date.now()}`,
				name: profileName.trim(),
				type: profileType,
			};

			this.plugin.settings.profiles.push(newProfile);
			await this.plugin.saveSettings();

			this.selectedProfileId = newProfile.id;
			new Notice(`Profile "${newProfile.name}" created`);
			modal.close();
			onRefreshNeeded();
		};

		const buttons = modal.contentEl.createDiv("modal-button-container");
		buttons.createEl("button", { text: "Cancel" }).onclick = () =>
			modal.close();
		buttons.createEl("button", { text: "Create", cls: "mod-cta" }).onclick =
			() => void create();
		modal.scope.register([], "Enter", () => {
			void create();
			return false;
		});

		modal.open();
		window.setTimeout(() => nameInput?.focus(), 0);
	}

	/**
	 * Show modal to confirm profile deletion
	 */
	showDeleteProfileModal(
		profile: SettingsProfile,
		onRefreshNeeded: () => void,
	): void {
		const affectedRepos = this.plugin.settings.repositories.filter(
			(r) => r.profileId === profile.id,
		);
		const affectedProjects = this.plugin.settings.trackedProjects.filter(
			(p) => p.profileId === profile.id,
		);
		const affected = [
			...affectedRepos.map((r) => r.repository),
			...affectedProjects.map((p) => p.title || p.id),
		];

		new ConfirmModal(this.app, {
			title: "Delete profile",
			message: "Delete the profile",
			highlight: profile.name,
			details:
				affected.length > 0
					? `Used by ${affected.length} ${affected.length === 1 ? "entry" : "entries"}, which will switch to the default profile:`
					: "No repositories or projects use this profile.",
			items: affected,
			confirmText: "Delete profile",
			confirmIcon: "trash-2",
			onConfirm: async () => {
				const defaultId =
					profile.type === "repository"
						? "default"
						: "default-project";
				for (const repo of affectedRepos) repo.profileId = defaultId;
				for (const project of affectedProjects)
					project.profileId = defaultId;

				this.plugin.settings.profiles =
					this.plugin.settings.profiles.filter(
						(p) => p.id !== profile.id,
					);

				await this.plugin.saveSettings();
				this.selectedProfileId = defaultId;
				new Notice(`Profile "${profile.name}" deleted`);
				onRefreshNeeded();
			},
		}).open();
	}
}
