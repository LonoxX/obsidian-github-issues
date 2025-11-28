import { App, Notice, setIcon } from "obsidian";
import { RepositoryTracking, DEFAULT_REPOSITORY_TRACKING } from "../types";
import GitHubTrackerPlugin from "../main";

export class RepositoryListManager {
	private selectedRepositories: Set<string> = new Set();

	constructor(
		private app: App,
		private plugin: GitHubTrackerPlugin,
	) {}

	async addRepository(repoName: string): Promise<void> {
		if (
			this.plugin.settings.repositories.some(
				(r) => r.repository === repoName,
			)
		) {
			new Notice("This repository is already being tracked");
			return;
		}

		const newRepo = {
			...DEFAULT_REPOSITORY_TRACKING,
			repository: repoName,
		};
		this.plugin.settings.repositories.push(newRepo);
		await this.plugin.saveSettings();
		new Notice(`Added repository: ${repoName}`);
	}

	async addMultipleRepositories(repoNames: string[]): Promise<void> {
		const newRepos: string[] = [];
		const existingRepos: string[] = [];
		for (const repoName of repoNames) {
			if (
				this.plugin.settings.repositories.some(
					(r) => r.repository === repoName,
				)
			) {
				existingRepos.push(repoName);
			} else {
				newRepos.push(repoName);
			}
		}

		for (const repoName of newRepos) {
			const newRepo = {
				...DEFAULT_REPOSITORY_TRACKING,
				repository: repoName,
			};
			this.plugin.settings.repositories.push(newRepo);
		}

		if (newRepos.length > 0) {
			await this.plugin.saveSettings();
		}

		if (newRepos.length > 0 && existingRepos.length > 0) {
			new Notice(
				`Added ${newRepos.length} repositories. ${existingRepos.length} were already tracked.`,
			);
		} else if (newRepos.length > 0) {
			new Notice(`Added ${newRepos.length} repositories successfully.`);
		} else if (existingRepos.length > 0) {
			new Notice(`All selected repositories are already being tracked.`);
		}
	}

	renderRepositoriesList(
		container: HTMLElement,
		onRefreshNeeded: () => void,
		renderIssueSettings: (container: HTMLElement, repo: RepositoryTracking) => void,
		renderPullRequestSettings: (container: HTMLElement, repo: RepositoryTracking) => void,
		showDeleteModal: (repo: RepositoryTracking) => Promise<void>,
		showBulkDeleteModal: (repos: RepositoryTracking[]) => Promise<void>
	): void {
		const reposContainer = container.createDiv(
			"github-issues-repos-container",
		);

		// Add bulk actions toolbar
		const bulkActionsToolbar = reposContainer.createDiv("github-issues-bulk-actions-toolbar");
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
			const count = this.selectedRepositories.size;
			selectedCountSpan.setText(`${count} selected`);
			bulkActionsToolbar.style.display = count > 0 ? "flex" : "none";
			removeSelectedButton.disabled = count === 0;
		};

		// Select/Deselect all handlers
		selectAllButton.onclick = () => {
			this.plugin.settings.repositories.forEach(repo => {
				this.selectedRepositories.add(repo.repository);
			});
			// Update all checkboxes
			container.querySelectorAll<HTMLInputElement>('.github-issues-repo-checkbox').forEach(checkbox => {
				checkbox.checked = true;
			});
			updateBulkActionsUI();
		};

		deselectAllButton.onclick = () => {
			this.selectedRepositories.clear();
			// Update all checkboxes
			container.querySelectorAll<HTMLInputElement>('.github-issues-repo-checkbox').forEach(checkbox => {
				checkbox.checked = false;
			});
			updateBulkActionsUI();
		};

		// Remove selected handler
		removeSelectedButton.onclick = async () => {
			const reposToDelete = this.plugin.settings.repositories.filter(
				repo => this.selectedRepositories.has(repo.repository)
			);
			if (reposToDelete.length > 0) {
				await showBulkDeleteModal(reposToDelete);
				this.selectedRepositories.clear();
				updateBulkActionsUI();
			}
		};

		const reposByOwner: Record<
			string,
			{
				repos: RepositoryTracking[];
				fullNames: string[];
				isUser: boolean;
			}
		> = {};

		for (const repo of this.plugin.settings.repositories) {
			const [owner, repoName] = repo.repository.split("/");
			if (!owner || !repoName) continue;

			if (!reposByOwner[owner]) {
				const isCurrentUser =
					this.plugin.currentUser &&
					this.plugin.currentUser.toLowerCase() ===
						owner.toLowerCase();
				reposByOwner[owner] = {
					repos: [],
					fullNames: [],
					isUser: !!isCurrentUser,
				};
			}
			reposByOwner[owner].repos.push(repo);
			reposByOwner[owner].fullNames.push(repo.repository);
		}

		const sortedOwners = Object.keys(reposByOwner).sort((a, b) => {
			if (reposByOwner[a].isUser && !reposByOwner[b].isUser) return -1;
			if (!reposByOwner[a].isUser && reposByOwner[b].isUser) return 1;
			return a.localeCompare(b);
		});

		const reposListContainer = reposContainer.createDiv(
			"github-issues-tracked-repos-list",
		);
		const noResultsMessage = reposContainer.createDiv(
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

		for (const owner of sortedOwners) {
			const ownerContainer = reposListContainer.createDiv(
				"github-issues-repo-owner-group",
			);
			ownerContainer.setAttribute("data-owner", owner.toLowerCase());

			const ownerHeader = ownerContainer.createDiv(
				"github-issues-repo-owner-header",
			);
			const ownerType = reposByOwner[owner].isUser
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
				text: reposByOwner[owner].repos.length.toString(),
			});

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

			const sortedRepos = reposByOwner[owner].repos.sort((a, b) => {
				const aName = a.repository.split("/")[1] || "";
				const bName = b.repository.split("/")[1] || "";
				return aName.localeCompare(bName);
			});

			for (const repo of sortedRepos) {
				const repoName = repo.repository.split("/")[1] || "";

				const repoItem = reposContainer.createDiv(
					"github-issues-item github-issues-repo-settings",
				);
				repoItem.setAttribute("data-repo-name", repoName.toLowerCase());
				repoItem.setAttribute("data-owner-name", owner.toLowerCase());
				repoItem.setAttribute(
					"data-full-name",
					repo.repository.toLowerCase(),
				);
				const headerContainer = repoItem.createDiv(
					"github-issues-repo-header-container",
				);

				const repoInfoContainer = headerContainer.createDiv(
					"github-issues-repo-info",
				);

				// Add checkbox for bulk selection
				const checkbox = repoInfoContainer.createEl("input", {
					type: "checkbox",
					cls: "github-issues-repo-checkbox"
				});
				checkbox.checked = this.selectedRepositories.has(repo.repository);
				checkbox.onclick = (e) => {
					e.stopPropagation();
					if (checkbox.checked) {
						this.selectedRepositories.add(repo.repository);
					} else {
						this.selectedRepositories.delete(repo.repository);
					}
					updateBulkActionsUI();
				};

				const repoIcon = repoInfoContainer.createDiv(
					"github-issues-repo-icon",
				);
				setIcon(repoIcon, "github");

				const repoText = repoInfoContainer.createEl("span");
				repoText.setText(repoName);
				repoText.addClass("github-issues-repo-name");

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
						await this.plugin.syncSingleRepository(repo.repository);
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
					await showDeleteModal(repo);
				};

				const detailsContainer = repoItem.createDiv(
					"github-issues-repo-details",
				);

				// Populate detailsContainer immediately
				const description = detailsContainer.createEl("p", {
					text: "Configure tracking settings for this repository",
				});
				description.addClass("github-issues-repo-description");

				// Add "Ignore global defaults" toggle at the top
				const { Setting } = require("obsidian");
				new Setting(detailsContainer)
					.setName("Ignore global defaults")
					.setDesc("Use repository-specific settings instead of global defaults")
					.addToggle((toggle: any) =>
						toggle.setValue(repo.ignoreGlobalSettings).onChange(async (value: boolean) => {
							repo.ignoreGlobalSettings = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(detailsContainer)
					.setName("Escape hash tags")
					.setDesc("Escape # characters for this repository (overrides global setting if 'Ignore global settings' is enabled)")
					.addToggle((toggle: any) =>
						toggle.setValue(repo.escapeHashTags).onChange(async (value: boolean) => {
							repo.escapeHashTags = value;
							await this.plugin.saveSettings();
						}),
					);

				const issuesContainer = detailsContainer.createDiv(
					"github-issues-settings-section",
				);
				const pullRequestsContainer = detailsContainer.createDiv(
					"github-issues-settings-section",
				);

				renderIssueSettings(issuesContainer, repo);
				renderPullRequestSettings(pullRequestsContainer, repo);

				const toggleDetails = () => {
					repoItem.classList.toggle("github-issues-expanded");
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
						)
					) {
						toggleDetails();
					}
				};
			}
		}

		const noTrackedRepos = reposContainer.createEl("p", {
			text: "No repositories tracked. Please add a repository to get started.",
		});
		noTrackedRepos.addClass("github-issues-no-repos");
		noTrackedRepos.classList.toggle(
			"github-issues-hidden",
			this.plugin.settings.repositories.length > 0,
		);
	}
}
