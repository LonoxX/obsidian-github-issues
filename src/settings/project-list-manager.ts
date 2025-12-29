import { App, Notice, setIcon } from "obsidian";
import { TrackedProject, ProjectInfo } from "../types";
import GitHubTrackerPlugin from "../main";

export class ProjectListManager {
	private selectedProjects: Set<string> = new Set();

	constructor(
		private app: App,
		private plugin: GitHubTrackerPlugin,
	) {}

	async addProject(project: ProjectInfo): Promise<void> {
		if (
			this.plugin.settings.trackedProjects.some(
				(p) => p.id === project.id,
			)
		) {
			new Notice("This project is already being tracked");
			return;
		}

		const newProject: TrackedProject = {
			id: project.id,
			title: project.title,
			number: project.number,
			url: project.url,
			owner: project.owner || "",
			enabled: true,
		};
		this.plugin.settings.trackedProjects.push(newProject);
		await this.plugin.saveSettings();
		new Notice(`Added project: ${project.title}`);
	}

	async addMultipleProjects(projects: ProjectInfo[]): Promise<void> {
		const newProjects: ProjectInfo[] = [];
		const existingProjects: ProjectInfo[] = [];

		for (const project of projects) {
			if (
				this.plugin.settings.trackedProjects.some(
					(p) => p.id === project.id,
				)
			) {
				existingProjects.push(project);
			} else {
				newProjects.push(project);
			}
		}

		for (const project of newProjects) {
			const newProject: TrackedProject = {
				id: project.id,
				title: project.title,
				number: project.number,
				url: project.url,
				owner: project.owner || "",
				enabled: true,
			};
			this.plugin.settings.trackedProjects.push(newProject);
		}

		if (newProjects.length > 0) {
			await this.plugin.saveSettings();
		}

		if (newProjects.length > 0 && existingProjects.length > 0) {
			new Notice(
				`Added ${newProjects.length} projects. ${existingProjects.length} were already tracked.`,
			);
		} else if (newProjects.length > 0) {
			new Notice(`Added ${newProjects.length} projects successfully.`);
		} else if (existingProjects.length > 0) {
			new Notice(`All selected projects are already being tracked.`);
		}
	}

	renderProjectsList(
		container: HTMLElement,
		onRefreshNeeded: () => void,
		renderProjectSettings: (container: HTMLElement, project: TrackedProject) => void,
		showDeleteModal: (project: TrackedProject) => Promise<void>,
		showBulkDeleteModal: (projects: TrackedProject[]) => Promise<void>,
	): void {
		const projectsContainer = container.createDiv(
			"github-issues-repos-container",
		);

		// Add bulk actions toolbar
		const bulkActionsToolbar = projectsContainer.createDiv("github-issues-bulk-actions-toolbar");
		bulkActionsToolbar.style.display = "none"; // Hidden by default

		const bulkActionInfo = bulkActionsToolbar.createDiv("github-issues-bulk-action-info");
		const selectedCountSpan = bulkActionInfo.createEl("span", {
			cls: "github-issues-selected-count",
			text: "0 selected"
		});

		const bulkActionButtons = bulkActionsToolbar.createDiv("github-issues-bulk-action-buttons");

		const selectAllButton = bulkActionButtons.createEl("button", {
			text: "Select all",
			cls: "github-issues-select-all-button"
		});

		const deselectAllButton = bulkActionButtons.createEl("button", {
			text: "Deselect all",
			cls: "github-issues-deselect-all-button"
		});

		const removeSelectedButton = bulkActionButtons.createEl("button", {
			cls: "github-issues-remove-selected-button mod-warning"
		});
		const removeIcon = removeSelectedButton.createEl("span", {
			cls: "github-issues-button-icon"
		});
		setIcon(removeIcon, "trash-2");
		removeSelectedButton.createEl("span", {
			cls: "github-issues-button-text",
			text: "Remove selected"
		});

		// Update UI based on selection
		const updateBulkActionsUI = () => {
			const count = this.selectedProjects.size;
			selectedCountSpan.setText(`${count} selected`);
			bulkActionsToolbar.style.display = count > 0 ? "flex" : "none";
			removeSelectedButton.disabled = count === 0;
		};

		// Select/Deselect all handlers
		selectAllButton.onclick = () => {
			this.plugin.settings.trackedProjects.forEach(project => {
				this.selectedProjects.add(project.id);
			});
			// Update all checkboxes
			container.querySelectorAll<HTMLInputElement>('.github-issues-project-checkbox').forEach(checkbox => {
				checkbox.checked = true;
			});
			updateBulkActionsUI();
		};

		deselectAllButton.onclick = () => {
			this.selectedProjects.clear();
			// Update all checkboxes
			container.querySelectorAll<HTMLInputElement>('.github-issues-project-checkbox').forEach(checkbox => {
				checkbox.checked = false;
			});
			updateBulkActionsUI();
		};

		// Remove selected handler
		removeSelectedButton.onclick = async () => {
			const projectsToDelete = this.plugin.settings.trackedProjects.filter(
				project => this.selectedProjects.has(project.id)
			);
			if (projectsToDelete.length > 0) {
				await showBulkDeleteModal(projectsToDelete);
				this.selectedProjects.clear();
				updateBulkActionsUI();
			}
		};

		const projectsByOwner: Record<
			string,
			{
				projects: TrackedProject[];
				isUser: boolean;
			}
		> = {};

		for (const project of this.plugin.settings.trackedProjects) {
			const owner = project.owner || "Unknown";

			if (!projectsByOwner[owner]) {
				const isCurrentUser =
					this.plugin.currentUser &&
					this.plugin.currentUser.toLowerCase() ===
						owner.toLowerCase();
				projectsByOwner[owner] = {
					projects: [],
					isUser: !!isCurrentUser,
				};
			}
			projectsByOwner[owner].projects.push(project);
		}

		const sortedOwners = Object.keys(projectsByOwner).sort((a, b) => {
			if (projectsByOwner[a].isUser && !projectsByOwner[b].isUser) return -1;
			if (!projectsByOwner[a].isUser && projectsByOwner[b].isUser) return 1;
			return a.localeCompare(b);
		});

		const projectsListContainer = projectsContainer.createDiv(
			"github-issues-tracked-repos-list",
		);
		const noResultsMessage = projectsContainer.createDiv(
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

		for (const owner of sortedOwners) {
			const ownerContainer = projectsListContainer.createDiv(
				"github-issues-repo-owner-group",
			);
			ownerContainer.setAttribute("data-owner", owner.toLowerCase());

			const ownerHeader = ownerContainer.createDiv(
				"github-issues-repo-owner-header",
			);
			const ownerType = projectsByOwner[owner].isUser
				? "User"
				: "Organization";

			// Chevron icon for collapse/expand
			const chevronIcon = ownerHeader.createEl("span", {
				cls: "github-issues-repo-owner-chevron",
			});
			setIcon(chevronIcon, "chevron-right");

			const ownerIcon = ownerHeader.createEl("span", {
				cls: "github-issues-repo-owner-icon",
			});
			setIcon(ownerIcon, ownerType === "User" ? "user" : "building");
			ownerHeader.createEl("span", {
				cls: "github-issues-repo-owner-name",
				text: owner,
			});
			ownerHeader.createEl("span", {
				cls: "github-issues-repo-count",
				text: projectsByOwner[owner].projects.length.toString(),
			});

			const ownerProjectsContainer = ownerContainer.createDiv(
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

			const sortedProjects = projectsByOwner[owner].projects.sort((a, b) => {
				return a.title.localeCompare(b.title);
			});

			for (const project of sortedProjects) {
				const projectItem = ownerProjectsContainer.createDiv(
					"github-issues-item github-issues-repo-settings",
				);
				projectItem.setAttribute("data-project-id", project.id);
				projectItem.setAttribute("data-owner-name", owner.toLowerCase());

				const headerContainer = projectItem.createDiv(
					"github-issues-repo-header-container",
				);

				const projectInfoContainer = headerContainer.createDiv(
					"github-issues-repo-info",
				);

				// Add checkbox for bulk selection
				const checkbox = projectInfoContainer.createEl("input", {
					type: "checkbox",
					cls: "github-issues-project-checkbox"
				});
				checkbox.checked = this.selectedProjects.has(project.id);
				checkbox.onclick = (e) => {
					e.stopPropagation();
					if (checkbox.checked) {
						this.selectedProjects.add(project.id);
					} else {
						this.selectedProjects.delete(project.id);
					}
					updateBulkActionsUI();
				};

				const projectIcon = projectInfoContainer.createDiv(
					"github-issues-repo-icon",
				);
				setIcon(projectIcon, "layout-grid");

				const projectText = projectInfoContainer.createEl("span");
				projectText.setText(project.title);
				projectText.addClass("github-issues-repo-name");

				const projectNumber = projectInfoContainer.createEl("span", {
					text: ` #${project.number}`,
					cls: "github-issues-project-number",
				});

				const actionContainer = headerContainer.createDiv(
					"github-issues-repo-action",
				);

				const syncButton = actionContainer.createEl("button", {
					text: "Sync",
				});
				syncButton.addClass("github-issues-sync-button");
				syncButton.onclick = async (e) => {
					e.stopPropagation();

					// Disable button and show loading state
					syncButton.disabled = true;
					const originalText = syncButton.textContent || "Sync";
					syncButton.textContent = "Syncing...";

					try {
						await this.plugin.syncSingleProject(project.id);
					} finally {
						// Re-enable button and restore original state
						syncButton.disabled = false;
						syncButton.textContent = originalText;
					}
				};

				const configButton = actionContainer.createEl("button", {
					text: "Configure",
				});
				configButton.addClass("github-issues-config-button");

				const deleteButton = actionContainer.createEl("button");
				deleteButton.createEl("span", {
					cls: "github-issues-button-icon",
					text: "×",
				});
				deleteButton.createEl("span", {
					cls: "github-issues-button-text",
					text: "Remove",
				});
				deleteButton.addClass("github-issues-remove-button");
				deleteButton.onclick = async () => {
					await showDeleteModal(project);
				};

				const detailsContainer = projectItem.createDiv(
					"github-issues-repo-details",
				);

				// Populate detailsContainer with project settings
				renderProjectSettings(detailsContainer, project);

				const toggleDetails = () => {
					projectItem.classList.toggle("github-issues-expanded");
				};

				configButton.onclick = toggleDetails;

				headerContainer.onclick = (e) => {
					if (
						!(e.target as Element).closest(
							".github-issues-remove-button",
						) &&
						!(e.target as Element).closest(
							".github-issues-sync-button",
						) &&
						!(e.target as Element).closest(
							".github-issues-config-button",
						) &&
						!(e.target as Element).closest(
							".github-issues-project-checkbox",
						)
					) {
						toggleDetails();
					}
				};
			}
		}

		const noTrackedProjects = projectsContainer.createEl("p", {
			text: "No projects tracked. Go to 'Available Projects' tab to add projects.",
		});
		noTrackedProjects.addClass("github-issues-no-repos");
		noTrackedProjects.classList.toggle(
			"github-issues-hidden",
			this.plugin.settings.trackedProjects.length > 0,
		);
	}
}
