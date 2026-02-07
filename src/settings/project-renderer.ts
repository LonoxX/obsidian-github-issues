import { App, Setting, setIcon } from "obsidian";
import { TrackedProject } from "../types";
import GitHubTrackerPlugin from "../main";

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
			text: "Configure kanban view settings for this project. Folders, templates, and sync settings are managed via the assigned profile.",
		});
		description.addClass("github-issues-repo-description");

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
							"github-issues-hidden",
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
			"github-issues-hidden",
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
