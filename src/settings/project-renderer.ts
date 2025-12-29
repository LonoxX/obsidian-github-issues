import { App, Setting, setIcon } from "obsidian";
import { TrackedProject } from "../types";
import GitHubTrackerPlugin from "../main";
import { FolderSuggest } from "./folder-suggest";
import { FileSuggest } from "./file-suggest";

export class ProjectRenderer {
	constructor(
		private app: App,
		private plugin: GitHubTrackerPlugin,
	) {}

	renderProjectSettings(
		container: HTMLElement,
		project: TrackedProject,
	): void {
		const description = container.createEl("p", {
			text: "Configure storage and kanban view settings for this project",
		});
		description.addClass("github-issues-repo-description");

		// ===== ISSUES STORAGE SECTION =====
		new Setting(container).setName("Issues Storage").setHeading();

		const issueStorageContainer = container.createDiv(
			"github-issues-settings-group",
		);

		// Standard issue folder (with template support)
		const standardIssueFolderContainer = issueStorageContainer.createDiv();
		standardIssueFolderContainer.classList.toggle(
			"github-issues-settings-hidden",
			project.useCustomIssueFolder ?? false
		);

		const issueFolderSetting = new Setting(standardIssueFolderContainer)
			.setName("Issues folder template")
			.setDesc("Folder path template. Variables: {project}, {owner}, {project_number}")
			.addText((text) => {
				text
					.setPlaceholder("GitHub/{project}")
					.setValue(project.issueFolder || "")
					.onChange(async (value) => {
						project.issueFolder = value.trim() || undefined;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		// Use custom issue folder toggle
		new Setting(issueStorageContainer)
			.setName("Use custom folder for issues")
			.setDesc("Use folder path directly without template variable substitution")
			.addToggle((toggle) => {
				toggle
					.setValue(project.useCustomIssueFolder ?? false)
					.onChange(async (value) => {
						project.useCustomIssueFolder = value;
						standardIssueFolderContainer.classList.toggle(
							"github-issues-settings-hidden",
							value
						);
						customIssueFolderContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value
						);
						await this.plugin.saveSettings();
					});
			});

		// Custom issue folder
		const customIssueFolderContainer = issueStorageContainer.createDiv();
		customIssueFolderContainer.classList.toggle(
			"github-issues-settings-hidden",
			!(project.useCustomIssueFolder ?? false)
		);

		new Setting(customIssueFolderContainer)
			.setName("Custom issues folder")
			.setDesc("Specific folder path (used as-is without variable substitution)")
			.addText((text) => {
				text
					.setPlaceholder("e.g., GitHub/MyProject/Issues")
					.setValue(project.customIssueFolder || "")
					.onChange(async (value) => {
						project.customIssueFolder = value.trim() || undefined;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		// Issue filename template with FULL variable list
		new Setting(issueStorageContainer)
			.setName("Issue filename template")
			.setDesc(
				"Variables: {number}, {title}, {author}, {status}, {project}, {type}, {labels}, {assignees}, {owner}, {repoName}, {labels_hash}, {created}, {updated}"
			)
			.addText((text) =>
				text
					.setPlaceholder("Issue - {number}")
					.setValue(project.issueNoteTemplate || "")
					.onChange(async (value) => {
						project.issueNoteTemplate = value.trim() || undefined;
						await this.plugin.saveSettings();
					}),
			);

		// Issue Content Template Settings
		new Setting(issueStorageContainer)
			.setName("Use custom issue content template")
			.setDesc("Enable custom template file for issue content instead of the default format")
			.addToggle((toggle) => {
				toggle
					.setValue(project.useCustomIssueContentTemplate ?? false)
					.onChange(async (value) => {
						project.useCustomIssueContentTemplate = value;
						customIssueTemplateContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value
						);
						await this.plugin.saveSettings();
					});
			});

		const customIssueTemplateContainer = issueStorageContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		customIssueTemplateContainer.classList.toggle(
			"github-issues-settings-hidden",
			!(project.useCustomIssueContentTemplate ?? false),
		);

		new Setting(customIssueTemplateContainer)
			.setName("Issue content template file")
			.setDesc("Path to a markdown file that will be used as template for issue content. See /templates folder for examples.")
			.addText((text) => {
				text
					.setPlaceholder("templates/default-issue-template.md")
					.setValue(project.issueContentTemplate || "")
					.onChange(async (value) => {
						project.issueContentTemplate = value.trim() || undefined;
						await this.plugin.saveSettings();
					});

				new FileSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📄")
					.setTooltip("Browse template files")
					.onClick(() => {
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		// ===== PULL REQUESTS STORAGE SECTION =====
		new Setting(container).setName("Pull Requests Storage").setHeading();

		const prStorageContainer = container.createDiv(
			"github-issues-settings-group",
		);

		// Standard PR folder (with template support)
		const standardPrFolderContainer = prStorageContainer.createDiv();
		standardPrFolderContainer.classList.toggle(
			"github-issues-settings-hidden",
			project.useCustomPullRequestFolder ?? false
		);

		new Setting(standardPrFolderContainer)
			.setName("Pull requests folder template")
			.setDesc("Folder path template. Variables: {project}, {owner}, {project_number}")
			.addText((text) => {
				text
					.setPlaceholder("GitHub/{project}")
					.setValue(project.pullRequestFolder || "")
					.onChange(async (value) => {
						project.pullRequestFolder = value.trim() || undefined;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		// Use custom PR folder toggle
		new Setting(prStorageContainer)
			.setName("Use custom folder for pull requests")
			.setDesc("Use folder path directly without template variable substitution")
			.addToggle((toggle) => {
				toggle
					.setValue(project.useCustomPullRequestFolder ?? false)
					.onChange(async (value) => {
						project.useCustomPullRequestFolder = value;
						standardPrFolderContainer.classList.toggle(
							"github-issues-settings-hidden",
							value
						);
						customPrFolderContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value
						);
						await this.plugin.saveSettings();
					});
			});

		// Custom PR folder
		const customPrFolderContainer = prStorageContainer.createDiv();
		customPrFolderContainer.classList.toggle(
			"github-issues-settings-hidden",
			!(project.useCustomPullRequestFolder ?? false)
		);

		new Setting(customPrFolderContainer)
			.setName("Custom pull requests folder")
			.setDesc("Specific folder path (used as-is without variable substitution)")
			.addText((text) => {
				text
					.setPlaceholder("e.g., GitHub/MyProject/Pull Requests")
					.setValue(project.customPullRequestFolder || "")
					.onChange(async (value) => {
						project.customPullRequestFolder = value.trim() || undefined;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		// PR filename template with FULL variable list
		new Setting(prStorageContainer)
			.setName("PR filename template")
			.setDesc(
				"Variables: {number}, {title}, {author}, {status}, {project}, {type}, {labels}, {assignees}, {owner}, {repoName}, {labels_hash}, {created}, {updated}"
			)
			.addText((text) =>
				text
					.setPlaceholder("PR - {number}")
					.setValue(project.pullRequestNoteTemplate || "")
					.onChange(async (value) => {
						project.pullRequestNoteTemplate = value.trim() || undefined;
						await this.plugin.saveSettings();
					}),
			);

		// PR Content Template Settings
		new Setting(prStorageContainer)
			.setName("Use custom PR content template")
			.setDesc("Enable custom template file for PR content instead of the default format")
			.addToggle((toggle) => {
				toggle
					.setValue(project.useCustomPullRequestContentTemplate ?? false)
					.onChange(async (value) => {
						project.useCustomPullRequestContentTemplate = value;
						customPRTemplateContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value
						);
						await this.plugin.saveSettings();
					});
			});

		const customPRTemplateContainer = prStorageContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		customPRTemplateContainer.classList.toggle(
			"github-issues-settings-hidden",
			!(project.useCustomPullRequestContentTemplate ?? false),
		);

		new Setting(customPRTemplateContainer)
			.setName("PR content template file")
			.setDesc("Path to a markdown file that will be used as template for PR content. See /templates folder for examples.")
			.addText((text) => {
				text
					.setPlaceholder("templates/default-pr-template.md")
					.setValue(project.pullRequestContentTemplate || "")
					.onChange(async (value) => {
						project.pullRequestContentTemplate = value.trim() || undefined;
						await this.plugin.saveSettings();
					});

				new FileSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📄")
					.setTooltip("Browse template files")
					.onClick(() => {
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		// Kanban View Settings Section
		new Setting(container).setName("Kanban View Settings").setHeading();

		const kanbanSettingsContainer = container.createDiv(
			"github-issues-settings-group",
		);

		new Setting(kanbanSettingsContainer)
			.setName("Customize columns")
			.setDesc("Reorder and hide status columns")
			.addToggle((toggle) =>
				toggle
					.setValue(project.useCustomStatusOrder ?? false)
					.onChange(async (value) => {
						project.useCustomStatusOrder = value;
						statusOrderContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		// Status order container (only visible when custom order is enabled)
		const statusOrderContainer = kanbanSettingsContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		statusOrderContainer.classList.toggle(
			"github-issues-settings-hidden",
			!(project.useCustomStatusOrder ?? false),
		);

		// Refresh from GitHub button
		const refreshSetting = new Setting(statusOrderContainer)
			.setName("Status columns")
			.setDesc("Drag to reorder, toggle visibility, or refresh from GitHub");

		refreshSetting.addButton((button) => {
			button
				.setButtonText("Refresh from GitHub")
				.setTooltip("Reload status options from GitHub")
				.onClick(async () => {
					button.setDisabled(true);
					button.setButtonText("Loading...");
					try {
						const statusOptions = await this.plugin.gitHubClient?.fetchProjectStatusOptions(project.id);
						if (statusOptions) {
							project.statusOptions = statusOptions;
							// Update custom order if it exists
							if (project.useCustomStatusOrder) {
								project.customStatusOrder = statusOptions.map((opt: any) => opt.name);
							}
							await this.plugin.saveSettings();
							// Re-render the status list
							this.renderStatusList(statusListContainer, project);
						}
					} finally {
						button.setDisabled(false);
						button.setButtonText("Refresh from GitHub");
					}
				});
		});

		// Status list container
		const statusListContainer = statusOrderContainer.createDiv(
			"github-issues-status-order-list",
		);
		this.renderStatusList(statusListContainer, project);

		new Setting(kanbanSettingsContainer)
			.setName("Show empty columns")
			.setDesc("Display status columns even when they have no items")
			.addToggle((toggle) =>
				toggle
					.setValue(project.showEmptyColumns ?? true)
					.onChange(async (value) => {
						project.showEmptyColumns = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(kanbanSettingsContainer)
			.setName("Skip hidden statuses on sync")
			.setDesc("Don't download issues/PRs with hidden status columns")
			.addToggle((toggle) =>
				toggle
					.setValue(project.skipHiddenStatusesOnSync ?? false)
					.onChange(async (value) => {
						project.skipHiddenStatusesOnSync = value;
						await this.plugin.saveSettings();
					}),
			);
	}

	private renderStatusList(container: HTMLElement, project: TrackedProject): void {
		container.empty();

		// Get status order
		let statusOrder: string[];
		if (project.useCustomStatusOrder && project.customStatusOrder?.length) {
			statusOrder = [...project.customStatusOrder];
		} else if (project.statusOptions?.length) {
			statusOrder = project.statusOptions.map(opt => opt.name);
		} else {
			statusOrder = [];
		}

		const hiddenStatuses = new Set(project.hiddenStatuses || []);

		if (statusOrder.length === 0) {
			const emptyMessage = container.createEl("p", {
				text: "No status columns found. Click 'Refresh from GitHub' to load.",
			});
			emptyMessage.style.color = "var(--text-muted)";
			emptyMessage.style.fontStyle = "italic";
			emptyMessage.style.padding = "8px";
			return;
		}

		for (let i = 0; i < statusOrder.length; i++) {
			const status = statusOrder[i];
			const isHidden = hiddenStatuses.has(status);

			const statusItem = container.createDiv("github-issues-status-item");
			statusItem.setAttribute("data-index", i.toString());
			statusItem.setAttribute("data-status", status);
			statusItem.draggable = true;

			// Drag handle
			const dragHandle = statusItem.createEl("span", {
				cls: "github-issues-status-drag-handle",
			});
			setIcon(dragHandle, "grip-vertical");

			// Status name
			const statusName = statusItem.createEl("span", {
				text: status,
				cls: "github-issues-status-name",
			});
			if (isHidden) {
				statusName.addClass("github-issues-status-hidden");
			}

			// Move buttons
			const moveContainer = statusItem.createDiv("github-issues-status-move-buttons");

			const moveUpBtn = moveContainer.createEl("button", {
				cls: "github-issues-status-move-btn",
			});
			setIcon(moveUpBtn, "chevron-up");
			moveUpBtn.disabled = i === 0;
			moveUpBtn.onclick = async (e) => {
				e.stopPropagation();
				if (i > 0) {
					[statusOrder[i - 1], statusOrder[i]] = [statusOrder[i], statusOrder[i - 1]];
					project.customStatusOrder = statusOrder;
					project.useCustomStatusOrder = true;
					await this.plugin.saveSettings();
					this.renderStatusList(container, project);
				}
			};

			const moveDownBtn = moveContainer.createEl("button", {
				cls: "github-issues-status-move-btn",
			});
			setIcon(moveDownBtn, "chevron-down");
			moveDownBtn.disabled = i === statusOrder.length - 1;
			moveDownBtn.onclick = async (e) => {
				e.stopPropagation();
				if (i < statusOrder.length - 1) {
					[statusOrder[i], statusOrder[i + 1]] = [statusOrder[i + 1], statusOrder[i]];
					project.customStatusOrder = statusOrder;
					project.useCustomStatusOrder = true;
					await this.plugin.saveSettings();
					this.renderStatusList(container, project);
				}
			};

			// Visibility toggle
			const visibilityBtn = statusItem.createEl("button", {
				cls: "github-issues-status-visibility-btn",
			});
			setIcon(visibilityBtn, isHidden ? "eye-off" : "eye");
			visibilityBtn.title = isHidden ? "Show column" : "Hide column";
			visibilityBtn.onclick = async (e) => {
				e.stopPropagation();
				if (isHidden) {
					hiddenStatuses.delete(status);
				} else {
					hiddenStatuses.add(status);
				}
				project.hiddenStatuses = Array.from(hiddenStatuses);
				await this.plugin.saveSettings();
				this.renderStatusList(container, project);
			};

			// Drag and drop handlers
			statusItem.ondragstart = (e) => {
				e.dataTransfer?.setData("text/plain", i.toString());
				statusItem.addClass("dragging");
			};

			statusItem.ondragend = () => {
				statusItem.removeClass("dragging");
			};

			statusItem.ondragover = (e) => {
				e.preventDefault();
				statusItem.addClass("drag-over");
			};

			statusItem.ondragleave = () => {
				statusItem.removeClass("drag-over");
			};

			statusItem.ondrop = async (e) => {
				e.preventDefault();
				statusItem.removeClass("drag-over");
				const fromIndex = parseInt(e.dataTransfer?.getData("text/plain") || "0");
				const toIndex = i;
				if (fromIndex !== toIndex) {
					const [movedItem] = statusOrder.splice(fromIndex, 1);
					statusOrder.splice(toIndex, 0, movedItem);
					project.customStatusOrder = statusOrder;
					project.useCustomStatusOrder = true;
					await this.plugin.saveSettings();
					this.renderStatusList(container, project);
				}
			};
		}
	}
}
