import { App, Modal, Notice, Setting, setIcon } from "obsidian";
import { SettingsProfile, ProfileType, DEFAULT_REPOSITORY_PROFILE, DEFAULT_PROJECT_PROFILE } from "../types";
import GitHubTrackerPlugin from "../main";
import { FolderSuggest } from "./folder-suggest";
import { FileSuggest } from "./file-suggest";
import { getRepositoryProfiles, getProjectProfiles } from "../util/settingsUtils";

export class ProfileRenderer {
	private selectedProfileId: string = "default";

	constructor(
		private app: App,
		private plugin: GitHubTrackerPlugin,
	) {}

	/**
	 * Render the full profile management section
	 */
	renderProfileSection(container: HTMLElement, onRefreshNeeded: () => void): void {
		const profiles = this.plugin.settings.profiles;

		// Ensure selected profile exists
		if (!profiles.find(p => p.id === this.selectedProfileId)) {
			this.selectedProfileId = "default";
		}

		// Profile toolbar: Dropdown + Icon buttons in one row
		const toolbarContainer = container.createDiv("github-issues-profile-toolbar");

		// Custom dropdown with right-aligned type badge
		const dropdownWrapper = toolbarContainer.createDiv("github-issues-profile-dropdown-wrapper");
		const dropdownButton = dropdownWrapper.createDiv("github-issues-profile-dropdown-button");
		const dropdownList = dropdownWrapper.createDiv("github-issues-profile-dropdown-list");
		dropdownList.style.display = "none";

		const selectedProfile = profiles.find(p => p.id === this.selectedProfileId);

		const updateButtonLabel = (profile: SettingsProfile) => {
			dropdownButton.empty();
			dropdownButton.createEl("span", {
				text: profile.name,
				cls: "github-issues-profile-dropdown-name",
			});
			const badgeCls = profile.type === "repository"
				? "github-issues-profile-type-tag github-issues-profile-tag-repository"
				: "github-issues-profile-type-tag github-issues-profile-tag-project";
			dropdownButton.createEl("span", {
				text: profile.type === "repository" ? "Repo" : "Project",
				cls: badgeCls,
			});
			const chevron = dropdownButton.createEl("span", { cls: "github-issues-profile-dropdown-chevron" });
			setIcon(chevron, "chevron-down");
		};

		if (selectedProfile) {
			updateButtonLabel(selectedProfile);
		}

		// Build dropdown items
		for (const profile of profiles) {
			const item = dropdownList.createDiv("github-issues-profile-dropdown-item");
			if (profile.id === this.selectedProfileId) {
				item.addClass("is-selected");
			}
			item.createEl("span", {
				text: profile.name,
				cls: "github-issues-profile-dropdown-name",
			});
			const badgeCls = profile.type === "repository"
				? "github-issues-profile-type-tag github-issues-profile-tag-repository"
				: "github-issues-profile-type-tag github-issues-profile-tag-project";
			item.createEl("span", {
				text: profile.type === "repository" ? "Repo" : "Project",
				cls: badgeCls,
			});
			item.onclick = (e) => {
				e.stopPropagation();
				this.selectedProfileId = profile.id;
				dropdownList.style.display = "none";
				onRefreshNeeded();
			};
		}

		// Toggle dropdown
		dropdownButton.onclick = (e) => {
			e.stopPropagation();
			const isOpen = dropdownList.style.display !== "none";
			dropdownList.style.display = isOpen ? "none" : "block";
		};

		// Close on outside click
		const closeDropdown = (e: MouseEvent) => {
			if (!dropdownWrapper.contains(e.target as Node)) {
				dropdownList.style.display = "none";
			}
		};
		document.addEventListener("click", closeDropdown);
		// Cleanup when container is removed
		const observer = new MutationObserver(() => {
			if (!container.isConnected) {
				document.removeEventListener("click", closeDropdown);
				observer.disconnect();
			}
		});
		observer.observe(container.parentElement ?? document.body, { childList: true, subtree: true });

		const isCustomProfile = selectedProfile && selectedProfile.id !== "default" && selectedProfile.id !== "default-project";

		// Helper to create the new/copy/delete buttons
		const addNewButton = (parent: HTMLElement) => {
			const btn = parent.createEl("button", {
				cls: "github-issues-profile-toolbar-btn",
				attr: { "aria-label": "New Profile" },
			});
			setIcon(btn, "plus");
			btn.onclick = () => {
				this.showCreateProfileModal(onRefreshNeeded);
			};
		};

		const addCopyButton = (parent: HTMLElement) => {
			if (!selectedProfile) return;
			const btn = parent.createEl("button", {
				cls: "github-issues-profile-toolbar-btn",
				attr: { "aria-label": "Duplicate Profile" },
			});
			setIcon(btn, "copy");
			btn.onclick = async () => {
				const newProfile: SettingsProfile = {
					...selectedProfile,
					id: `profile-${Date.now()}`,
					name: `${selectedProfile.name} (Copy)`,
				};
				this.plugin.settings.profiles.push(newProfile);
				await this.plugin.saveSettings();
				this.selectedProfileId = newProfile.id;
				new Notice(`Profile "${newProfile.name}" created`);
				onRefreshNeeded();
			};
		};

		const addDeleteButton = (parent: HTMLElement) => {
			if (!isCustomProfile) return;
			const btn = parent.createEl("button", {
				cls: "github-issues-profile-toolbar-btn github-issues-profile-delete-btn",
				attr: { "aria-label": "Delete Profile" },
			});
			setIcon(btn, "trash-2");
			btn.onclick = () => {
				this.showDeleteProfileModal(selectedProfile!, onRefreshNeeded);
			};
		};

		if (isCustomProfile) {
			// Custom profile: actions row below with rename + buttons
			const actionsRow = container.createDiv("github-issues-profile-actions-row");

			const renameInput = actionsRow.createEl("input", {
				cls: "github-issues-profile-rename-input",
				type: "text",
				value: selectedProfile.name,
				attr: { placeholder: "Profile name", "aria-label": "Rename profile" },
			});
			renameInput.addEventListener("change", async () => {
				if (renameInput.value.trim()) {
					selectedProfile.name = renameInput.value.trim();
					await this.plugin.saveSettings();
					updateButtonLabel(selectedProfile);
				}
			});

			addNewButton(actionsRow);
			addCopyButton(actionsRow);
			addDeleteButton(actionsRow);
		} else {
			// Default profile: buttons inline next to dropdown
			addNewButton(toolbarContainer);
			addCopyButton(toolbarContainer);
		}

		// Profile settings form
		if (selectedProfile) {
			const profileSettingsContainer = container.createDiv("github-issues-profile-settings");

			if (selectedProfile.type === "repository") {
				this.renderRepositoryProfileSettings(profileSettingsContainer, selectedProfile);
			} else {
				this.renderProjectProfileSettings(profileSettingsContainer, selectedProfile);
			}
		}
	}

	/**
	 * Render settings fields for a repository-type profile
	 */
	private renderRepositoryProfileSettings(container: HTMLElement, profile: SettingsProfile): void {
		// Issues subsection
		const issuesContainer = container.createDiv("github-issues-nested");
		new Setting(issuesContainer).setName("Issues").setHeading();

		new Setting(issuesContainer)
			.setName("Track issues")
			.setDesc("Enable or disable issue tracking for repositories using this profile")
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
					})
			);

		const issuesSettingsContainer = issuesContainer.createDiv("github-issues-settings-group");
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
						profile.issueUpdateMode = value as "none" | "update" | "append";
						await this.plugin.saveSettings();
					})
			);

		new Setting(issuesSettingsContainer)
			.setName("Allow deletion")
			.setDesc("Allow deletion of local issue files when closed on GitHub")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.allowDeleteIssue ?? true)
					.onChange(async (value) => {
						profile.allowDeleteIssue = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(issuesSettingsContainer)
			.setName("Folder")
			.setDesc("Default folder where issue files will be stored")
			.addText((text) => {
				text
					.setPlaceholder("GitHub")
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
					})
			);

		new Setting(issuesSettingsContainer)
			.setName("Content template")
			.setDesc("Template file for issue content (optional)")
			.addText((text) => {
				text
					.setPlaceholder("")
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
					})
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
					})
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
					})
			);

		// Issue filter defaults
		new Setting(issuesSettingsContainer).setName("Issue filters").setHeading();

		new Setting(issuesSettingsContainer)
			.setName("Filter issues by labels")
			.setDesc("Set a default label filter for repositories using this profile (undefined = repos keep their own filter)")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.enableLabelFilter !== undefined)
					.onChange(async (value) => {
						if (value) {
							profile.enableLabelFilter = true;
						} else {
							delete (profile as any).enableLabelFilter;
						}
						issueLabelFilterControls.classList.toggle("github-issues-hidden", !value);
						await this.plugin.saveSettings();
					})
			);

		const issueLabelFilterEnabled = profile.enableLabelFilter !== undefined;
		const issueLabelFilterControls = issuesSettingsContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		issueLabelFilterControls.classList.toggle("github-issues-hidden", !issueLabelFilterEnabled);

		new Setting(issueLabelFilterControls)
			.setName("Label filter mode")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("include", "Include - Only show issues with these labels")
					.addOption("exclude", "Exclude - Hide issues with these labels")
					.setValue(profile.labelFilterMode ?? "include")
					.onChange(async (value) => {
						profile.labelFilterMode = value as "include" | "exclude";
						await this.plugin.saveSettings();
					})
			);

		new Setting(issueLabelFilterControls)
			.setName("Label filters")
			.setDesc("Comma-separated list of labels (case-sensitive)")
			.addTextArea((text) => {
				text
					.setPlaceholder("bug, enhancement, help wanted")
					.setValue((profile.labelFilters || []).join(", "))
					.onChange(async (value) => {
						profile.labelFilters = value
							.split(",")
							.map(l => l.trim())
							.filter(l => l.length > 0);
						await this.plugin.saveSettings();
					});
				return text;
			});

		new Setting(issuesSettingsContainer)
			.setName("Filter issues by assignees")
			.setDesc("Set a default assignee filter for repositories using this profile (undefined = repos keep their own filter)")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.enableAssigneeFilter !== undefined)
					.onChange(async (value) => {
						if (value) {
							profile.enableAssigneeFilter = true;
						} else {
							delete (profile as any).enableAssigneeFilter;
						}
						issueAssigneeFilterControls.classList.toggle("github-issues-hidden", !value);
						await this.plugin.saveSettings();
					})
			);

		const issueAssigneeFilterEnabled = profile.enableAssigneeFilter !== undefined;
		const issueAssigneeFilterControls = issuesSettingsContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		issueAssigneeFilterControls.classList.toggle("github-issues-hidden", !issueAssigneeFilterEnabled);

		const issueAssigneeModeOptions: Array<{ value: "assigned-to-me" | "assigned-to-specific" | "unassigned" | "any-assigned"; label: string }> = [
			{ value: "assigned-to-me", label: "Assigned to me" },
			{ value: "assigned-to-specific", label: "Assigned to specific users" },
			{ value: "unassigned", label: "Unassigned" },
			{ value: "any-assigned", label: "Any assigned" },
		];

		const issueAssigneeSpecificContainer = issueAssigneeFilterControls.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		issueAssigneeSpecificContainer.classList.toggle(
			"github-issues-hidden",
			!(profile.assigneeFilterModes ?? []).includes("assigned-to-specific"),
		);

		for (const option of issueAssigneeModeOptions) {
			new Setting(issueAssigneeFilterControls)
				.setName(option.label)
				.addToggle((toggle) => {
					toggle
						.setValue((profile.assigneeFilterModes ?? []).includes(option.value))
						.onChange(async (checked) => {
							const modes = [...(profile.assigneeFilterModes ?? [])];
							if (checked) {
								if (!modes.includes(option.value)) modes.push(option.value);
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
				text
					.setPlaceholder("username1, username2")
					.setValue((profile.assigneeFilters || []).join(", "))
					.onChange(async (value) => {
						profile.assigneeFilters = value
							.split(",")
							.map(u => u.trim())
							.filter(u => u.length > 0);
						await this.plugin.saveSettings();
					});
				return text;
			});

		// Pull Requests subsection
		const prContainer = container.createDiv("github-issues-nested");
		new Setting(prContainer).setName("Pull Requests").setHeading();

		new Setting(prContainer)
			.setName("Track pull requests")
			.setDesc("Enable or disable pull request tracking for repositories using this profile")
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
					})
			);

		const prSettingsContainer = prContainer.createDiv("github-issues-settings-group");
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
						profile.pullRequestUpdateMode = value as "none" | "update" | "append";
						await this.plugin.saveSettings();
					})
			);

		new Setting(prSettingsContainer)
			.setName("Allow deletion")
			.setDesc("Allow deletion of local PR files when closed on GitHub")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.allowDeletePullRequest ?? true)
					.onChange(async (value) => {
						profile.allowDeletePullRequest = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(prSettingsContainer)
			.setName("Folder")
			.setDesc("Default folder where pull request files will be stored")
			.addText((text) => {
				text
					.setPlaceholder("GitHub Pull Requests")
					.setValue(profile.pullRequestFolder ?? "GitHub Pull Requests")
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
					.setValue(profile.pullRequestNoteTemplate ?? "PR - {number}")
					.onChange(async (value) => {
						profile.pullRequestNoteTemplate = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(prSettingsContainer)
			.setName("Content template")
			.setDesc("Template file for pull request content (optional)")
			.addText((text) => {
				text
					.setPlaceholder("")
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
					})
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
					})
			);

		// PR filter defaults
		new Setting(prSettingsContainer).setName("Pull request filters").setHeading();

		new Setting(prSettingsContainer)
			.setName("Filter pull requests by labels")
			.setDesc("Set a default PR label filter for repositories using this profile (undefined = repos keep their own filter)")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.enablePrLabelFilter !== undefined)
					.onChange(async (value) => {
						if (value) {
							profile.enablePrLabelFilter = true;
						} else {
							delete (profile as any).enablePrLabelFilter;
						}
						prLabelFilterControls.classList.toggle("github-issues-hidden", !value);
						await this.plugin.saveSettings();
					})
			);

		const prLabelFilterEnabled = profile.enablePrLabelFilter !== undefined;
		const prLabelFilterControls = prSettingsContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		prLabelFilterControls.classList.toggle("github-issues-hidden", !prLabelFilterEnabled);

		new Setting(prLabelFilterControls)
			.setName("Label filter mode")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("include", "Include - Only show pull requests with these labels")
					.addOption("exclude", "Exclude - Hide pull requests with these labels")
					.setValue(profile.prLabelFilterMode ?? "include")
					.onChange(async (value) => {
						profile.prLabelFilterMode = value as "include" | "exclude";
						await this.plugin.saveSettings();
					})
			);

		new Setting(prLabelFilterControls)
			.setName("Label filters")
			.setDesc("Comma-separated list of labels (case-sensitive)")
			.addTextArea((text) => {
				text
					.setPlaceholder("bug, enhancement, help wanted")
					.setValue((profile.prLabelFilters || []).join(", "))
					.onChange(async (value) => {
						profile.prLabelFilters = value
							.split(",")
							.map(l => l.trim())
							.filter(l => l.length > 0);
						await this.plugin.saveSettings();
					});
				return text;
			});

		new Setting(prSettingsContainer)
			.setName("Filter pull requests by assignees")
			.setDesc("Set a default PR assignee filter for repositories using this profile (undefined = repos keep their own filter)")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.enablePrAssigneeFilter !== undefined)
					.onChange(async (value) => {
						if (value) {
							profile.enablePrAssigneeFilter = true;
						} else {
							delete (profile as any).enablePrAssigneeFilter;
						}
						prAssigneeFilterControls.classList.toggle("github-issues-hidden", !value);
						await this.plugin.saveSettings();
					})
			);

		const prAssigneeFilterEnabled = profile.enablePrAssigneeFilter !== undefined;
		const prAssigneeFilterControls = prSettingsContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		prAssigneeFilterControls.classList.toggle("github-issues-hidden", !prAssigneeFilterEnabled);

		const prAssigneeModeOptions: Array<{ value: "assigned-to-me" | "assigned-to-specific" | "unassigned" | "any-assigned"; label: string }> = [
			{ value: "assigned-to-me", label: "Assigned to me" },
			{ value: "assigned-to-specific", label: "Assigned to specific users" },
			{ value: "unassigned", label: "Unassigned" },
			{ value: "any-assigned", label: "Any assigned" },
		];

		const prAssigneeSpecificContainer = prAssigneeFilterControls.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		prAssigneeSpecificContainer.classList.toggle(
			"github-issues-hidden",
			!(profile.prAssigneeFilterModes ?? []).includes("assigned-to-specific"),
		);

		for (const option of prAssigneeModeOptions) {
			new Setting(prAssigneeFilterControls)
				.setName(option.label)
				.addToggle((toggle) => {
					toggle
						.setValue((profile.prAssigneeFilterModes ?? []).includes(option.value))
						.onChange(async (checked) => {
							const modes = [...(profile.prAssigneeFilterModes ?? [])];
							if (checked) {
								if (!modes.includes(option.value)) modes.push(option.value);
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
				text
					.setPlaceholder("username1, username2")
					.setValue((profile.prAssigneeFilters || []).join(", "))
					.onChange(async (value) => {
						profile.prAssigneeFilters = value
							.split(",")
							.map(u => u.trim())
							.filter(u => u.length > 0);
						await this.plugin.saveSettings();
					});
				return text;
			});

		new Setting(prSettingsContainer)
			.setName("Filter pull requests by reviewers")
			.setDesc("Set a default PR reviewer filter for repositories using this profile (undefined = repos keep their own filter)")
			.addToggle((toggle) =>
				toggle
					.setValue(profile.enablePrReviewerFilter !== undefined)
					.onChange(async (value) => {
						if (value) {
							profile.enablePrReviewerFilter = true;
						} else {
							delete (profile as any).enablePrReviewerFilter;
						}
						prReviewerFilterControls.classList.toggle("github-issues-hidden", !value);
						await this.plugin.saveSettings();
					})
			);

		const prReviewerFilterEnabled = profile.enablePrReviewerFilter !== undefined;
		const prReviewerFilterControls = prSettingsContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		prReviewerFilterControls.classList.toggle("github-issues-hidden", !prReviewerFilterEnabled);

		const prReviewerModeOptions: Array<{ value: "review-requested-from-me" | "review-requested-from-specific" | "no-review-requested" | "any-review-requested"; label: string }> = [
			{ value: "review-requested-from-me", label: "Review requested from me" },
			{ value: "review-requested-from-specific", label: "Review requested from specific users" },
			{ value: "no-review-requested", label: "No review requested" },
			{ value: "any-review-requested", label: "Any review requested" },
		];

		const prReviewerSpecificContainer = prReviewerFilterControls.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		prReviewerSpecificContainer.classList.toggle(
			"github-issues-hidden",
			!(profile.prReviewerFilterModes ?? []).includes("review-requested-from-specific"),
		);

		for (const option of prReviewerModeOptions) {
			new Setting(prReviewerFilterControls)
				.setName(option.label)
				.addToggle((toggle) => {
					toggle
						.setValue((profile.prReviewerFilterModes ?? []).includes(option.value))
						.onChange(async (checked) => {
							const modes = [...(profile.prReviewerFilterModes ?? [])];
							if (checked) {
								if (!modes.includes(option.value)) modes.push(option.value);
							} else {
								const idx = modes.indexOf(option.value);
								if (idx >= 0) modes.splice(idx, 1);
							}
							profile.prReviewerFilterModes = modes;
							prReviewerSpecificContainer.classList.toggle(
								"github-issues-hidden",
								!modes.includes("review-requested-from-specific"),
							);
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(prReviewerSpecificContainer)
			.setName("Specific reviewers")
			.setDesc("Comma-separated list of GitHub usernames")
			.addTextArea((text) => {
				text
					.setPlaceholder("username1, username2")
					.setValue((profile.prReviewerFilters || []).join(", "))
					.onChange(async (value) => {
						profile.prReviewerFilters = value
							.split(",")
							.map(u => u.trim())
							.filter(u => u.length > 0);
						await this.plugin.saveSettings();
					});
				return text;
			});

	}

	/**
	 * Render settings fields for a project-type profile
	 */
	private renderProjectProfileSettings(container: HTMLElement, profile: SettingsProfile): void {
		const settingsContainer = container.createDiv("github-issues-nested");
		new Setting(settingsContainer).setName("Project Settings").setHeading();

		new Setting(settingsContainer)
			.setName("Issue folder")
			.setDesc("Default folder for project issue files (supports {project} variable)")
			.addText((text) => {
				text
					.setPlaceholder("GitHub/{project}")
					.setValue(profile.projectIssueFolder ?? "GitHub/{project}")
					.onChange(async (value) => {
						profile.projectIssueFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(settingsContainer)
			.setName("Pull request folder")
			.setDesc("Default folder for project PR files (supports {project} variable)")
			.addText((text) => {
				text
					.setPlaceholder("GitHub/{project}")
					.setValue(profile.projectPullRequestFolder ?? "GitHub/{project}")
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
					.setValue(profile.projectIssueNoteTemplate ?? "Issue - {number}")
					.onChange(async (value) => {
						profile.projectIssueNoteTemplate = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(settingsContainer)
			.setName("PR filename template")
			.setDesc("Template for project pull request filenames")
			.addText((text) =>
				text
					.setPlaceholder("PR - {number}")
					.setValue(profile.projectPullRequestNoteTemplate ?? "PR - {number}")
					.onChange(async (value) => {
						profile.projectPullRequestNoteTemplate = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(settingsContainer)
			.setName("Issue content template")
			.setDesc("Template file for project issue content (optional)")
			.addText((text) => {
				text
					.setPlaceholder("")
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
			.setDesc("Template file for project pull request content (optional)")
			.addText((text) => {
				text
					.setPlaceholder("")
					.setValue(profile.projectPullRequestContentTemplate ?? "")
					.onChange(async (value) => {
						profile.projectPullRequestContentTemplate = value;
						profile.projectUseCustomPullRequestContentTemplate = !!value;
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
					})
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
					})
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
					})
			);
	}

	/**
	 * Render a profile selection dropdown for a repository or project
	 */
	renderProfileSelector(
		container: HTMLElement,
		currentProfileId: string,
		profileType: ProfileType,
		onSelect: (profileId: string) => Promise<void>
	): void {
		const profiles = profileType === "repository"
			? getRepositoryProfiles(this.plugin.settings)
			: getProjectProfiles(this.plugin.settings);

		new Setting(container)
			.setName("Settings profile")
			.setDesc(`Select which profile provides default settings`)
			.addDropdown((dropdown) => {
				for (const profile of profiles) {
					dropdown.addOption(profile.id, profile.name);
				}
				dropdown.setValue(currentProfileId || (profileType === "repository" ? "default" : "default-project"));
				dropdown.onChange(async (value) => {
					await onSelect(value);
				});
			});
	}

	/**
	 * Show modal to create a new profile
	 */
	private showCreateProfileModal(onRefreshNeeded: () => void): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText("Create New Profile");

		let profileName = "";
		let profileType: ProfileType = "repository";

		new Setting(modal.contentEl)
			.setName("Profile name")
			.addText((text) =>
				text
					.setPlaceholder("My Custom Profile")
					.onChange((value) => {
						profileName = value;
					})
			);

		new Setting(modal.contentEl)
			.setName("Profile type")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("repository", "Repository")
					.addOption("project", "Project")
					.setValue("repository")
					.onChange((value) => {
						profileType = value as ProfileType;
					})
			);

		const buttonContainer = modal.contentEl.createDiv("github-issues-button-container");

		const cancelButton = buttonContainer.createEl("button");
		cancelButton.setText("Cancel");
		cancelButton.onclick = () => modal.close();

		const createButton = buttonContainer.createEl("button");
		createButton.setText("Create");
		createButton.addClass("mod-cta");
		createButton.onclick = async () => {
			if (!profileName.trim()) {
				new Notice("Please enter a profile name");
				return;
			}

			const baseProfile = profileType === "repository"
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

		modal.open();
	}

	/**
	 * Show modal to confirm profile deletion
	 */
	private showDeleteProfileModal(profile: SettingsProfile, onRefreshNeeded: () => void): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText("Delete Profile");

		// Check for repos/projects using this profile
		const affectedRepos = this.plugin.settings.repositories.filter(
			r => r.profileId === profile.id
		);
		const affectedProjects = this.plugin.settings.trackedProjects.filter(
			p => p.profileId === profile.id
		);

		let message = `Are you sure you want to delete the profile "${profile.name}"?`;
		if (affectedRepos.length > 0 || affectedProjects.length > 0) {
			const parts: string[] = [];
			if (affectedRepos.length > 0) {
				parts.push(`${affectedRepos.length} repositor${affectedRepos.length === 1 ? 'y' : 'ies'}`);
			}
			if (affectedProjects.length > 0) {
				parts.push(`${affectedProjects.length} project${affectedProjects.length === 1 ? '' : 's'}`);
			}
			message += `\n\nThis profile is currently used by ${parts.join(' and ')}. They will be reassigned to the default profile.`;
		}

		modal.contentEl.createEl("p", { text: message });

		const buttonContainer = modal.contentEl.createDiv("github-issues-button-container");

		const cancelButton = buttonContainer.createEl("button");
		cancelButton.setText("Cancel");
		cancelButton.onclick = () => modal.close();

		const deleteButton = buttonContainer.createEl("button");
		deleteButton.setText("Delete");
		deleteButton.addClass("mod-warning");
		deleteButton.onclick = async () => {
			// Reassign affected repos/projects to default profile
			const defaultId = profile.type === "repository" ? "default" : "default-project";
			for (const repo of affectedRepos) {
				repo.profileId = defaultId;
			}
			for (const project of affectedProjects) {
				project.profileId = defaultId;
			}

			// Remove the profile
			this.plugin.settings.profiles = this.plugin.settings.profiles.filter(
				p => p.id !== profile.id
			);

			await this.plugin.saveSettings();
			this.selectedProfileId = defaultId;
			new Notice(`Profile "${profile.name}" deleted`);
			modal.close();
			onRefreshNeeded();
		};

		modal.open();
	}
}
