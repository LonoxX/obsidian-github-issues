import { App, Modal, Notice, setIcon } from "obsidian";
import { RepositoryTracking } from "../types";
import IssueTrackerPlugin from "../main";
import { UIHelpers } from "./ui-helpers";
import { parseRepository } from "../util/repo-path";

export class ModalManager {
	constructor(
		private app: App,
		private plugin: IssueTrackerPlugin,
	) {}

	async showDeleteRepositoryModal(
		repo: RepositoryTracking,
		onDeleted: () => void,
	): Promise<void> {
		const modal = new Modal(this.app);
		modal.containerEl.addClass("github-issues-modal");
		modal.titleEl.setText("Delete repository");

		const contentContainer = modal.contentEl.createDiv(
			"github-issues-delete-modal-content",
		);

		const warningContainer = contentContainer.createDiv(
			"github-issues-warning-icon-container",
		);
		setIcon(warningContainer, "alert-triangle");
		warningContainer.addClass("github-issues-warning-icon");

		const messageContainer = contentContainer.createDiv(
			"github-issues-delete-message",
		);

		const warningText = messageContainer.createEl("p", {
			text: "Are you sure you want to delete ",
		});
		warningText.addClass("github-issues-delete-warning-text");

		const repoNameSpan = warningText.createSpan();
		repoNameSpan.setText(repo.repository);
		repoNameSpan.addClass("github-issues-delete-repo-name");

		warningText.appendText("?");

		const descriptionText = messageContainer.createEl("p", {
			text: "This will remove all tracking settings for this repository.",
		});
		descriptionText.addClass("github-issues-delete-description");

		const buttonContainer = contentContainer.createDiv();
		buttonContainer.addClass("github-issues-button-container");

		const cancelButton = buttonContainer.createEl("button");
		cancelButton.setText("Cancel");
		cancelButton.onclick = () => modal.close();
		const confirmDeleteButton = buttonContainer.createEl("button");
		const deleteIcon = confirmDeleteButton.createSpan({
			cls: "github-issues-button-icon",
		});
		setIcon(deleteIcon, "trash-2");
		confirmDeleteButton.createSpan({
			cls: "github-issues-button-text",
			text: "Delete repository",
		});
		confirmDeleteButton.addClass("mod-warning");
		confirmDeleteButton.onclick = async () => {
			this.plugin.settings.repositories =
				this.plugin.settings.repositories.filter(
					(r) => r.repository !== repo.repository,
				);
			await this.plugin.saveSettings();
			modal.close();
			new Notice(`Deleted repository: ${repo.repository}`);
			onDeleted();
		};

		modal.open();
	}

	async showBulkDeleteRepositoriesModal(
		repositories: RepositoryTracking[],
		onDeleted: () => void,
	): Promise<void> {
		const modal = new Modal(this.app);
		modal.containerEl.addClass("github-issues-modal");
		modal.titleEl.setText("Delete multiple repositories");

		const contentContainer = modal.contentEl.createDiv(
			"github-issues-delete-modal-content",
		);

		const warningContainer = contentContainer.createDiv(
			"github-issues-warning-icon-container",
		);
		setIcon(warningContainer, "alert-triangle");
		warningContainer.addClass("github-issues-warning-icon");

		const messageContainer = contentContainer.createDiv(
			"github-issues-delete-message",
		);

		const warningText = messageContainer.createEl("p", {
			text: `Are you sure you want to delete ${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}?`,
		});
		warningText.addClass("github-issues-delete-warning-text");

		const repoListContainer = messageContainer.createDiv(
			"github-issues-delete-repo-list",
		);
		const repoList = repoListContainer.createEl("ul");
		repositories.forEach((repo) => {
			const listItem = repoList.createEl("li");
			listItem.setText(repo.repository);
			listItem.addClass("github-issues-delete-repo-name");
		});

		const descriptionText = messageContainer.createEl("p", {
			text: "This will remove all tracking settings for these repositories.",
		});
		descriptionText.addClass("github-issues-delete-description");

		const buttonContainer = contentContainer.createDiv();
		buttonContainer.addClass("github-issues-button-container");

		const cancelButton = buttonContainer.createEl("button");
		cancelButton.setText("Cancel");
		cancelButton.onclick = () => modal.close();

		const confirmDeleteButton = buttonContainer.createEl("button");
		const deleteIcon = confirmDeleteButton.createSpan({
			cls: "github-issues-button-icon",
		});
		setIcon(deleteIcon, "trash-2");
		confirmDeleteButton.createSpan({
			cls: "github-issues-button-text",
			text: `Delete ${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}`,
		});
		confirmDeleteButton.addClass("mod-warning");
		confirmDeleteButton.onclick = async () => {
			const repoNames = repositories.map((r) => r.repository);
			this.plugin.settings.repositories =
				this.plugin.settings.repositories.filter(
					(r) => !repoNames.includes(r.repository),
				);
			await this.plugin.saveSettings();
			modal.close();
			new Notice(
				`Deleted ${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}`,
			);
			onDeleted();
		};

		modal.open();
	}

	async fetchAndShowRepositoryLabels(
		repositoryName: string,
		repo: RepositoryTracking,
		filterType: "labelFilters" | "prLabelFilters",
		textAreaElement: HTMLTextAreaElement,
	): Promise<void> {
		const github = this.plugin.providerRegistry.get("github");
		if (!github?.isReady()) {
			new Notice(
				"GitHub client not ready. Please set your GitHub token first.",
			);
			return;
		}

		const { owner, repo: repoName } = parseRepository(repositoryName);
		if (!owner || !repoName) {
			new Notice("Invalid repository format. Expected 'owner/repo'.");
			return;
		}

		try {
			new Notice("Fetching labels from repository...");
			const labels = await github.fetchRepositoryLabels(owner, repoName);

			if (labels.length === 0) {
				new Notice("No labels found in this repository.");
				return;
			}

			// Create a modal to show available labels
			const modal = new Modal(this.app);
			modal.titleEl.setText(`Available Labels for ${repositoryName}`);
			modal.containerEl.addClass("github-issues-modal");

			const contentContainer = modal.contentEl.createDiv(
				"github-issues-labels-modal",
			);

			const description = contentContainer.createEl("p", {
				text: `Found ${labels.length} labels in this repository. Click on labels to add them to your filter:`,
			});
			description.addClass("github-issues-modal-description");

			const labelsContainer = contentContainer.createDiv(
				"github-issues-labels-container",
			);

			labels.forEach((label) => {
				const labelElement = labelsContainer.createDiv(
					"github-issues-label-item",
				);

				const labelBadge = labelElement.createDiv(
					"github-issues-label-badge",
				);
				labelBadge.setText(label.name);

				// Set color as CSS custom properties instead of direct style assignment
				labelBadge.style.setProperty(
					"--label-bg-color",
					`#${label.color}`,
				);
				labelBadge.style.setProperty(
					"--label-text-color",
					UIHelpers.getContrastColor(label.color ?? ""),
				);

				if (label.description) {
					const description = labelElement.createDiv(
						"github-issues-label-description",
					);
					description.setText(label.description);
				}

				const currentFilters = repo[filterType] ?? [];
				const isSelected = currentFilters.includes(label.name);
				labelElement.classList.toggle(
					"github-issues-label-selected",
					isSelected,
				);

				labelElement.addEventListener("click", () => {
					const currentFilters = repo[filterType] ?? [];
					if (currentFilters.includes(label.name)) {
						// Remove label
						repo[filterType] = currentFilters.filter(
							(l: string) => l !== label.name,
						);
						labelElement.classList.remove(
							"github-issues-label-selected",
						);
					} else {
						// Add label
						repo[filterType] = [...currentFilters, label.name];
						labelElement.classList.add(
							"github-issues-label-selected",
						);
					}

					// Update the textarea and save settings
					textAreaElement.value = repo[filterType].join(", ");
					void this.plugin.saveSettings();
				});
			});

			const buttonContainer = contentContainer.createDiv(
				"github-issues-button-container",
			);
			const closeButton = buttonContainer.createEl("button", {
				text: "Close",
			});
			closeButton.onclick = () => modal.close();

			modal.open();
			new Notice(`Loaded ${labels.length} labels from ${repositoryName}`);
		} catch (error) {
			new Notice(`Error fetching labels: ${(error as Error).message}`);
		}
	}

	async fetchAndShowRepositoryCollaborators(
		repositoryName: string,
		repo: RepositoryTracking,
		filterType:
			"assigneeFilters" | "prAssigneeFilters" | "prReviewerFilters",
		textAreaElement: HTMLTextAreaElement,
	): Promise<void> {
		const github = this.plugin.providerRegistry.get("github");
		if (!github?.isReady()) {
			new Notice(
				"GitHub client not ready. Please set your GitHub token first.",
			);
			return;
		}

		const { owner, repo: repoName } = parseRepository(repositoryName);
		if (!owner || !repoName) {
			new Notice("Invalid repository format. Expected 'owner/repo'.");
			return;
		}

		try {
			new Notice("Fetching collaborators from repository...");
			const collaborators = await github.fetchRepositoryCollaborators(
				owner,
				repoName,
			);

			if (collaborators.length === 0) {
				new Notice("No collaborators found in this repository.");
				return;
			}

			// Create a modal to show available collaborators
			const modal = new Modal(this.app);
			modal.titleEl.setText(
				`Available Collaborators for ${repositoryName}`,
			);
			modal.containerEl.addClass("github-issues-modal");

			const contentContainer = modal.contentEl.createDiv(
				"github-issues-collaborators-modal",
			);

			const description = contentContainer.createEl("p", {
				text: `Found ${collaborators.length} collaborators in this repository. Click on users to add them to your filter:`,
			});
			description.addClass("github-issues-modal-description");

			const collaboratorsContainer = contentContainer.createDiv(
				"github-issues-collaborators-container",
			);

			const currentFilters = repo[filterType] ?? [];

			collaborators.forEach((collaborator) => {
				const collaboratorElement = collaboratorsContainer.createDiv(
					"github-issues-collaborator-item",
				);

				const avatarContainer = collaboratorElement.createDiv(
					"github-issues-collaborator-avatar",
				);
				if (collaborator.avatar_url) {
					const avatar = avatarContainer.createEl("img");
					avatar.src = collaborator.avatar_url as string;
					avatar.alt = collaborator.login;
					avatar.addClass("github-issues-avatar");
				}

				const infoContainer = collaboratorElement.createDiv(
					"github-issues-collaborator-info",
				);

				const username = infoContainer.createDiv(
					"github-issues-collaborator-username",
				);
				username.setText(collaborator.login);

				if (collaborator.type) {
					const type = infoContainer.createDiv(
						"github-issues-collaborator-type",
					);
					type.setText(collaborator.type as string);
				}

				const isSelected = currentFilters.includes(collaborator.login);
				collaboratorElement.classList.toggle(
					"github-issues-collaborator-selected",
					isSelected,
				);

				collaboratorElement.addEventListener("click", () => {
					if (currentFilters.includes(collaborator.login)) {
						// Remove collaborator
						repo[filterType] = currentFilters.filter(
							(username: string) =>
								username !== collaborator.login,
						);
						collaboratorElement.classList.remove(
							"github-issues-collaborator-selected",
						);
					} else {
						// Add collaborator
						repo[filterType] = [
							...currentFilters,
							collaborator.login,
						];
						collaboratorElement.classList.add(
							"github-issues-collaborator-selected",
						);
					}

					// Update the textarea and save settings
					textAreaElement.value = repo[filterType].join(", ");
					void this.plugin.saveSettings();
				});
			});

			const buttonContainer = contentContainer.createDiv(
				"github-issues-button-container",
			);
			const closeButton = buttonContainer.createEl("button", {
				text: "Close",
			});
			closeButton.onclick = () => modal.close();

			modal.open();
			new Notice(
				`Loaded ${collaborators.length} collaborators from ${repositoryName}`,
			);
		} catch (error) {
			new Notice(
				`Error fetching collaborators: ${(error as Error).message}`,
			);
		}
	}
}
