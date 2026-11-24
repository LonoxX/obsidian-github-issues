import { App, Modal, Notice } from "obsidian";
import { RepositoryTracking } from "../types";
import IssueTrackerPlugin from "../main";
import { UIHelpers } from "./ui-helpers";
import { ConfirmModal } from "./confirm-modal";
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
		new ConfirmModal(this.app, {
			title: "Delete repository",
			message: "Delete",
			highlight: repo.repository,
			details: "Notes stay in your vault.",
			confirmText: "Delete repository",
			confirmIcon: "trash-2",
			onConfirm: async () => {
				this.plugin.settings.repositories =
					this.plugin.settings.repositories.filter((r) => r !== repo);
				await this.plugin.saveSettings();
				new Notice(`Deleted repository: ${repo.repository}`);
				onDeleted();
			},
		}).open();
	}

	/** Provider of the repository, with a notice if it is missing or has no token. */
	private readyProvider(repo: RepositoryTracking) {
		const provider = this.plugin.getProviderForRepo(repo);
		if (!provider?.isReady()) {
			new Notice(
				`${provider?.displayName ?? "The provider"} is not ready. Please add a token for this repository's provider first.`,
			);
			return null;
		}
		return provider;
	}

	/**
	 * Picker for filter values (labels, users). Toggling an entry updates the
	 * filter list and the linked textarea immediately; a search field appears
	 * for longer lists.
	 */
	private showFilterPicker<T>(options: {
		title: string;
		description: string;
		items: T[];
		key: (item: T) => string;
		searchText: (item: T) => string;
		render: (el: HTMLElement, item: T) => void;
		itemClass: string;
		selectedClass: string;
		containerClass: string;
		getSelected: () => string[];
		setSelected: (values: string[]) => void;
	}): void {
		const modal = new Modal(this.app);
		modal.modalEl.addClass(
			"github-issues-modal",
			"github-issues-picker-modal",
		);
		modal.setTitle(options.title);

		modal.contentEl.createEl("p", {
			cls: "github-issues-modal-description",
			text: options.description,
		});

		let searchInput: HTMLInputElement | null = null;
		if (options.items.length > 10) {
			searchInput = modal.contentEl.createEl("input", {
				type: "search",
				cls: "github-issues-picker-search",
				attr: { placeholder: "Search…" },
			});
		}

		const list = modal.contentEl.createDiv(options.containerClass);
		const rows = options.items.map((item) => {
			const el = list.createDiv(options.itemClass);
			options.render(el, item);
			const key = options.key(item);
			el.toggleClass(
				options.selectedClass,
				options.getSelected().includes(key),
			);
			el.setAttribute("role", "checkbox");
			el.tabIndex = 0;
			const toggle = () => {
				const current = options.getSelected();
				const next = current.includes(key)
					? current.filter((v) => v !== key)
					: [...current, key];
				options.setSelected(next);
				el.toggleClass(options.selectedClass, next.includes(key));
				el.setAttribute("aria-checked", String(next.includes(key)));
			};
			el.setAttribute(
				"aria-checked",
				String(options.getSelected().includes(key)),
			);
			el.addEventListener("click", toggle);
			el.addEventListener("keydown", (e) => {
				if (e.key === " " || e.key === "Enter") {
					e.preventDefault();
					toggle();
				}
			});
			return { el, text: options.searchText(item).toLowerCase() };
		});

		const empty = modal.contentEl.createEl("p", {
			cls: "github-issues-picker-empty github-issues-hidden",
			text: "No matches.",
		});

		searchInput?.addEventListener("input", (event) => {
			const q = (event.target as HTMLInputElement).value
				.trim()
				.toLowerCase();
			let visible = 0;
			for (const row of rows) {
				const show = !q || row.text.includes(q);
				row.el.toggleClass("github-issues-hidden", !show);
				if (show) visible++;
			}
			empty.toggleClass("github-issues-hidden", visible > 0);
		});

		const buttons = modal.contentEl.createDiv("modal-button-container");
		buttons.createEl("button", { text: "Done", cls: "mod-cta" }).onclick =
			() => modal.close();

		modal.open();
		if (searchInput) window.setTimeout(() => searchInput?.focus(), 0);
	}

	async fetchAndShowRepositoryLabels(
		repositoryName: string,
		repo: RepositoryTracking,
		filterType: "labelFilters" | "prLabelFilters",
		textAreaElement: HTMLTextAreaElement,
	): Promise<void> {
		const provider = this.readyProvider(repo);
		if (!provider) return;

		const { owner, repo: repoName } = parseRepository(repositoryName);
		if (!owner || !repoName) {
			new Notice("Invalid repository format. Expected 'owner/repo'.");
			return;
		}

		try {
			const labels = await provider.fetchRepositoryLabels(
				owner,
				repoName,
				this.plugin.getExtraParams(repo),
			);
			if (labels.length === 0) {
				new Notice("No labels found in this repository.");
				return;
			}

			this.showFilterPicker({
				title: `Labels of ${repositoryName}`,
				description: `${labels.length} labels found. Select the labels to filter by:`,
				items: labels,
				key: (l) => l.name,
				searchText: (l) => `${l.name} ${l.description ?? ""}`,
				itemClass: "github-issues-label-item",
				selectedClass: "github-issues-label-selected",
				containerClass: "github-issues-labels-container",
				render: (el, label) => {
					const badge = el.createDiv("github-issues-label-badge");
					badge.setText(label.name);
					const color = (label.color ?? "").replace(/^#/, "");
					if (color) {
						badge.style.setProperty(
							"--label-bg-color",
							`#${color}`,
						);
						badge.style.setProperty(
							"--label-text-color",
							UIHelpers.getContrastColor(color),
						);
					}
					if (label.description) {
						el.createDiv({
							cls: "github-issues-label-description",
							text: label.description,
						});
					}
				},
				getSelected: () => repo[filterType] ?? [],
				setSelected: (values) => {
					repo[filterType] = values;
					textAreaElement.value = values.join(", ");
					void this.plugin.saveSettings();
				},
			});
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
		const provider = this.readyProvider(repo);
		if (!provider) return;

		const { owner, repo: repoName } = parseRepository(repositoryName);
		if (!owner || !repoName) {
			new Notice("Invalid repository format. Expected 'owner/repo'.");
			return;
		}

		try {
			const users = await provider.fetchRepositoryCollaborators(
				owner,
				repoName,
				this.plugin.getExtraParams(repo),
			);
			if (users.length === 0) {
				new Notice("No collaborators found in this repository.");
				return;
			}

			this.showFilterPicker({
				title: `People in ${repositoryName}`,
				description: `${users.length} people found. Select the users to filter by:`,
				items: users,
				key: (u) => u.login,
				searchText: (u) => u.login,
				itemClass: "github-issues-collaborator-item",
				selectedClass: "github-issues-collaborator-selected",
				containerClass: "github-issues-collaborators-container",
				render: (el, user) => {
					const avatarContainer = el.createDiv(
						"github-issues-collaborator-avatar",
					);
					if (user.avatar_url) {
						avatarContainer.createEl("img", {
							cls: "github-issues-avatar",
							attr: {
								src: user.avatar_url as string,
								alt: user.login,
							},
						});
					}
					const info = el.createDiv(
						"github-issues-collaborator-info",
					);
					info.createDiv({
						cls: "github-issues-collaborator-username",
						text: user.login,
					});
					if (user.type) {
						info.createDiv({
							cls: "github-issues-collaborator-type",
							text: user.type as string,
						});
					}
				},
				getSelected: () => repo[filterType] ?? [],
				setSelected: (values) => {
					repo[filterType] = values;
					textAreaElement.value = values.join(", ");
					void this.plugin.saveSettings();
				},
			});
		} catch (error) {
			new Notice(
				`Error fetching collaborators: ${(error as Error).message}`,
			);
		}
	}
}
