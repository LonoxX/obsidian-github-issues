import {
	App,
	PluginSettingTab,
	SecretComponent,
	Setting,
	SettingGroup,
	setIcon,
} from "obsidian";
import IssueTrackerPlugin from "./main";
import {
	ProjectInfo,
	ProviderConfig,
	ProviderType,
	RepositoryTracking,
	SettingsProfile,
	TrackedProject,
} from "./types";
import { FORGEJO_DEFAULT_URL } from "./providers/forgejo/forgejo-provider";
import { ConfirmModal } from "./settings/confirm-modal";
import { ModalManager } from "./settings/modal-manager";
import { ProfileRenderer } from "./settings/profile-renderer";
import { ProjectRenderer } from "./settings/project-renderer";
import { RepositoryListManager } from "./settings/repository-list-manager";
import { RepositoryRenderer } from "./settings/repository-renderer";
import { ProjectListManager } from "./settings/project-list-manager";
import {
	getProjectProfiles,
	getRepositoryProfiles,
} from "./util/settingsUtils";
import { providerIcon, providerLabel } from "./util/provider-ui";

const LINKS: { label: string; href: string; icon: string }[] = [
	{
		label: "Wiki",
		href: "https://github.com/LonoxX/obsidian-github-issues/wiki",
		icon: "book-open",
	},
	{
		label: "Report Bug",
		href: "https://github.com/LonoxX/obsidian-github-issues/issues/new",
		icon: "bug",
	},
	{
		label: "Support me",
		href: "https://github.com/sponsors/LonoxX",
		icon: "heart",
	},
	{ label: "Ko-fi", href: "https://ko-fi.com/lonoxx", icon: "coffee" },
	{
		label: "Buy me a Pizza",
		href: "https://buymeacoffee.com/lonoxx",
		icon: "pizza",
	},
];

type TabId = "repositories" | "profiles" | "projects" | "providers" | "general";

const TABS: { id: TabId; label: string; icon: string }[] = [
	{ id: "repositories", label: "Repositories", icon: "book-marked" },
	{ id: "profiles", label: "Profiles", icon: "sliders-horizontal" },
	{ id: "projects", label: "Projects", icon: "square-kanban" },
	{ id: "providers", label: "Providers", icon: "plug" },
	{ id: "general", label: "General", icon: "settings" },
];

const TAB_STORAGE_KEY = "github-issues-settings-tab";

interface BrowseItem {
	key: string;
	group: string;
	name: string;
	desc: string;
	tracked: boolean;
}

/** Inline browse list; kept on the tab so redraws do not lose it. */
interface BrowseState {
	source: string;
	items: BrowseItem[] | null;
	loading: boolean;
	error: string | null;
	selected: Set<string>;
	filter: string;
	profileId: string;
	openGroups: Set<string>;
}

function emptyBrowse(source: string, profileId: string): BrowseState {
	return {
		source,
		items: null,
		loading: false,
		error: null,
		selected: new Set(),
		filter: "",
		profileId,
		openGroups: new Set(),
	};
}

/** Inline details area below a list row. */
interface InlinePanel {
	refresh(): void;
	close(): void;
}

const NEW_SERVER_TYPES: { type: ProviderType; title: string }[] = [
	{ type: "github", title: "GitHub" },
	{ type: "gitlab", title: "GitLab" },
	{ type: "forgejo", title: "Forgejo / Gitea" },
];

const ESCAPE_MODES: Record<string, { label: string; desc: string }> = {
	disabled: {
		label: "Disabled",
		desc: "Content is written as is",
	},
	normal: {
		label: "Normal",
		desc: "Neutralises Templater and Dataview syntax",
	},
	strict: {
		label: "Strict",
		desc: "Also removes HTML and template characters",
	},
	veryStrict: {
		label: "Very strict",
		desc: "Also removes quotes and special characters",
	},
};

/**
 * Settings page built only from Obsidian's own setting groups and rows.
 * Lists show one row per item; the gear opens the details inline below it.
 */
export class IssueTrackerSettingTab extends PluginSettingTab {
	private modalManager: ModalManager;
	private repositoryRenderer: RepositoryRenderer;
	private repositoryListManager: RepositoryListManager;
	private projectRenderer: ProjectRenderer;
	private profileRenderer: ProfileRenderer;
	/** Token check results per provider, so redraws do not hit the API. */
	private tokenStatus = new Map<string, string>();
	private activeTab: TabId | null = null;
	private selectedProfileId = "default";
	private expanded = new Set<string>();
	private repoSelection = new Set<string>();
	private openRepoGroups = new Set<string>();
	private repoBrowse: BrowseState = emptyBrowse("", "default");
	private projectBrowse: BrowseState = emptyBrowse("github", "");
	private repoRefs = new Map<string, number | undefined>();
	private projectRefs = new Map<string, ProjectInfo>();

	constructor(
		app: App,
		private plugin: IssueTrackerPlugin,
	) {
		super(app, plugin);
		this.modalManager = new ModalManager(app, plugin);
		this.repositoryRenderer = new RepositoryRenderer(
			app,
			plugin,
			(name, repo, type, textArea) =>
				this.modalManager.fetchAndShowRepositoryLabels(
					name,
					repo,
					type,
					textArea,
				),
			(name, repo, type, textArea) =>
				this.modalManager.fetchAndShowRepositoryCollaborators(
					name,
					repo,
					type,
					textArea,
				),
		);
		this.repositoryListManager = new RepositoryListManager(app, plugin);
		this.projectRenderer = new ProjectRenderer(app, plugin);
		this.profileRenderer = new ProfileRenderer(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const scroller = this.scrollParent();
		const scrollTop = scroller?.scrollTop ?? 0;
		this.render(containerEl);
		if (scroller) scroller.scrollTop = scrollTop;
	}

	/** Redraws keep the scroll position, so a change does not jump to the top. */
	private scrollParent(): HTMLElement | null {
		for (
			let el: HTMLElement | null = this.containerEl;
			el;
			el = el.parentElement
		) {
			if (el.scrollHeight > el.clientHeight) {
				const { overflowY } = getComputedStyle(el);
				if (overflowY === "auto" || overflowY === "scroll") return el;
			}
		}
		return null;
	}

	private render(containerEl: HTMLElement): void {
		containerEl.empty();
		containerEl.addClass("github-issues-settings");

		this.renderHeader(containerEl);
		const panels = this.renderNavigation(containerEl);
		this.renderRepositories(panels.repositories);
		this.renderRepositoryBrowser(panels.repositories);
		this.renderProfiles(panels.profiles);
		if (this.hasProjectProvider()) {
			this.renderProjects(panels.projects);
			this.renderProjectBrowser(panels.projects);
		}
		this.renderSetup(panels.providers);
		this.renderProviders(panels.providers);
		this.renderSync(panels.general);
		this.renderAdvanced(panels.general);
	}

	private renderHeader(containerEl: HTMLElement): void {
		const header = containerEl.createDiv("github-issues-settings-header");
		header.createDiv({
			cls: "github-issues-settings-title",
			text: "Git Issues & Pull Requests",
		});
		header.createDiv({
			cls: "github-issues-settings-subtitle",
			text: "Sync your Git issues and pull requests in Obsidian",
		});
		const links = header.createDiv("github-issues-settings-links");
		LINKS.forEach((link, i) => {
			if (i > 0)
				links.createSpan({
					cls: "github-issues-settings-dot",
					text: "•",
				});
			const a = links.createEl("a", {
				href: link.href,
				cls: "github-issues-settings-link",
				attr: { target: "_blank", rel: "noopener" },
			});
			setIcon(
				a.createSpan("github-issues-settings-link-icon"),
				link.icon,
			);
			a.createSpan({ text: link.label });
		});
	}

	private hasReadyProvider(): boolean {
		return this.plugin.settings.providers.some(
			(p) => p.enabled && !!this.plugin.getProviderToken(p.id),
		);
	}

	/**
	 * Tab bar at the top. The active tab survives redraws and is remembered
	 * per device; without a connected server the page opens on Providers.
	 */
	private renderNavigation(
		containerEl: HTMLElement,
	): Record<TabId, HTMLElement> {
		const tabs = TABS.filter(
			(t) => t.id !== "projects" || this.hasProjectProvider(),
		);
		if (!this.activeTab) {
			let stored: string | null = null;
			try {
				stored = window.localStorage.getItem(TAB_STORAGE_KEY);
			} catch {
				stored = null;
			}
			this.activeTab = this.hasReadyProvider()
				? (tabs.find((t) => t.id === stored)?.id ?? "repositories")
				: "providers";
		}
		if (!tabs.some((t) => t.id === this.activeTab))
			this.activeTab = "repositories";

		const nav = containerEl.createDiv({
			cls: "github-issues-nav",
			attr: { role: "tablist" },
		});
		const panels = {} as Record<TabId, HTMLElement>;
		const buttons = new Map<TabId, HTMLElement>();

		const select = (id: TabId) => {
			this.activeTab = id;
			try {
				window.localStorage.setItem(TAB_STORAGE_KEY, id);
			} catch {
				// Remembering the tab is only a convenience.
			}
			for (const [tabId, button] of buttons) {
				const active = tabId === id;
				button.toggleClass("is-active", active);
				button.setAttribute("aria-selected", String(active));
				panels[tabId].toggleClass("github-issues-hidden", !active);
			}
		};

		for (const tab of TABS) {
			panels[tab.id] = containerEl.createDiv({
				attr: { role: "tabpanel" },
			});
			panels[tab.id].addClass("github-issues-hidden");
			if (!tabs.includes(tab)) continue;
			const button = nav.createEl("button", {
				cls: "github-issues-nav-item",
				attr: { role: "tab", type: "button" },
			});
			setIcon(button.createSpan("github-issues-nav-icon"), tab.icon);
			button.createSpan({ text: tab.label });
			button.onclick = () => select(tab.id);
			buttons.set(tab.id, button);
		}

		if (!this.hasReadyProvider()) {
			const hint = new SettingGroup(panels.repositories);
			new Setting(hint.listEl)
				.setName("Connect a server first")
				.setDesc("Add a token before adding repositories")
				.addButton((button) =>
					button
						.setButtonText("Open providers")
						.setCta()
						.onClick(() => select("providers")),
				);
		}

		select(this.activeTab);
		return panels;
	}

	// --- helpers ---

	private label(config: ProviderConfig): string {
		return providerLabel(config, this.plugin.settings.providers);
	}

	private providerById(id?: string): ProviderConfig | undefined {
		return this.plugin.settings.providers.find(
			(p) => p.id === (id ?? "github"),
		);
	}

	private enabledProviders(): ProviderConfig[] {
		return this.plugin.settings.providers.filter((p) => p.enabled);
	}

	/** GitHub projects, Gitea projects and GitLab boards; Forgejo is checked when loading. */
	private hasProjectProvider(): boolean {
		return this.plugin.settings.providers.some((p) => p.enabled);
	}

	private profileName(id?: string): string {
		return (
			this.plugin.settings.profiles.find((p) => p.id === id)?.name ??
			"Default profile"
		);
	}

	private withIcon(setting: Setting, icon: string): Setting {
		const iconEl = createSpan("github-issues-row-icon");
		setIcon(iconEl, icon);
		setting.nameEl.prepend(iconEl);
		return setting;
	}

	private async save(): Promise<void> {
		await this.plugin.saveSettings();
	}

	// --- sections ---

	private renderSetup(containerEl: HTMLElement): void {
		const group = new SettingGroup(containerEl);
		new Setting(group.listEl)
			.setName("Setup assistant")
			.setDesc("Connect a server step by step")
			.addButton((button) =>
				button
					.setButtonText("Open")
					.onClick(() => this.plugin.openOnboarding()),
			);
	}

	/**
	 * Adds the gear button to a row and, while expanded, renders the details
	 * right below the row. Returns the details element (or null).
	 */
	private addInlineDetails(
		row: Setting,
		key: string,
		render: (el: HTMLElement, panel: InlinePanel) => void,
	): HTMLElement | null {
		const open = this.expanded.has(key);
		row.addExtraButton((button) => {
			button
				.setIcon(open ? "chevron-up" : "settings")
				.setTooltip(open ? "Close" : "Configure")
				.onClick(() => {
					if (open) this.expanded.delete(key);
					else this.expanded.add(key);
					this.display();
				});
			button.extraSettingsEl.toggleClass("is-active", open);
		});
		if (!open) return null;
		row.settingEl.addClass("github-issues-expanded");
		const el = createDiv({ cls: "github-issues-inline" });
		row.settingEl.insertAdjacentElement("afterend", el);
		const panel: InlinePanel = {
			refresh: () => {
				el.empty();
				render(el, panel);
			},
			close: () => {
				this.expanded.delete(key);
				this.display();
			},
		};
		render(el, panel);
		return el;
	}

	private renderProviders(containerEl: HTMLElement): void {
		const group = new SettingGroup(containerEl).setHeading("Providers");

		for (const config of this.plugin.settings.providers) {
			const row = this.withIcon(
				new Setting(group.listEl).setName(this.label(config)),
				providerIcon(config.type),
			);
			row.setDesc(this.providerStatus(config));
			this.checkProviderStatus(config, row);
			this.addInlineDetails(row, `provider:${config.id}`, (el, panel) =>
				this.renderProviderDetails(el, panel, config),
			);
			row.addToggle((toggle) =>
				toggle.setValue(config.enabled).onChange(async (value) => {
					config.enabled = value;
					await this.save();
					this.display();
				}),
			);
		}

		let type: ProviderType = "github";
		new Setting(group.listEl)
			.setName("Add server")
			.addDropdown((dropdown) => {
				for (const option of NEW_SERVER_TYPES) {
					dropdown.addOption(option.type, option.title);
				}
				dropdown
					.setValue(type)
					.onChange((value) => (type = value as ProviderType));
			})
			.addButton((button) =>
				button
					.setButtonText("Add")
					.setCta()
					.onClick(() => void this.addServer(type)),
			);
	}

	private providerStatus(config: ProviderConfig): string {
		if (!config.enabled) return "Disabled";
		if (!this.plugin.getProviderToken(config.id)) return "No token";
		return this.tokenStatus.get(config.id) ?? "Checking token…";
	}

	private checkProviderStatus(config: ProviderConfig, row: Setting): void {
		if (
			!config.enabled ||
			!this.plugin.getProviderToken(config.id) ||
			this.tokenStatus.has(config.id)
		) {
			return;
		}
		const provider = this.plugin.providerRegistry.get(config.id);
		if (!provider) return;
		void provider
			.validateToken()
			.then((result) =>
				result.valid
					? `Connected as ${result.user ?? "unknown"}`
					: "Token not accepted",
			)
			.catch(() => "Server not reachable")
			.then((status) => {
				this.tokenStatus.set(config.id, status);
				row.setDesc(status);
			});
	}

	private async addServer(type: ProviderType): Promise<void> {
		let id: string = type;
		for (let n = 2; this.providerById(id); n++) id = `${type}-${n}`;
		const config: ProviderConfig = {
			id,
			type,
			enabled: true,
			token: "",
			useSecretStorage: false,
			secretTokenName: "",
		};
		this.plugin.settings.providers.push(config);
		this.expanded.add(`provider:${config.id}`);
		await this.save();
		this.display();
	}

	private renderProviderDetails(
		el: HTMLElement,
		panel: InlinePanel,
		config: ProviderConfig,
	): void {
		const isPrimaryGitHub = config.id === "github";
		const onTokenChange = async () => {
			this.tokenStatus.delete(config.id);
			await this.save();
			status.setDesc("Not checked yet");
		};

		const group = { listEl: el };
		if (!isPrimaryGitHub) {
			const defaults: Record<ProviderType, string> = {
				github: "https://github.example.com",
				gitlab: "https://gitlab.com",
				forgejo: FORGEJO_DEFAULT_URL,
			};
			new Setting(group.listEl)
				.setName("Server")
				.setDesc(
					config.type === "github"
						? "Empty for github.com"
						: `Empty for ${defaults[config.type].replace("https://", "")}`,
				)
				.addText((text) =>
					text
						.setPlaceholder(defaults[config.type])
						.setValue(config.baseUrl ?? "")
						.onChange(async (value) => {
							config.baseUrl = value.trim() || undefined;
							await onTokenChange();
						}),
				);
			new Setting(group.listEl)
				.setName("Display name")
				.setDesc("Used by {provider}")
				.addText((text) =>
					text
						.setPlaceholder(
							this.label({ ...config, label: undefined }),
						)
						.setValue(config.label ?? "")
						.onChange(async (value) => {
							config.label = value.trim() || undefined;
							await this.save();
						}),
				);
		}

		if (this.plugin.isSecretStorageAvailable()) {
			new Setting(group.listEl)
				.setName("Store token in keychain")
				.setDesc("Use Obsidian's SecretStorage")
				.addToggle((toggle) =>
					toggle
						.setValue(config.useSecretStorage)
						.onChange(async (value) => {
							config.useSecretStorage = value;
							if (value) config.token = "";
							else config.secretTokenName = "";
							await onTokenChange();
							panel.refresh();
						}),
				);
		}

		const tokenRow = new Setting(group.listEl).setName("Access token");
		if (config.useSecretStorage && this.plugin.isSecretStorageAvailable()) {
			tokenRow.addComponent((controlEl) => {
				const secret = new SecretComponent(this.app, controlEl);
				if (config.secretTokenName)
					secret.setValue(config.secretTokenName);
				secret.onChange(async (value) => {
					config.secretTokenName = value ?? "";
					await onTokenChange();
				});
				return secret;
			});
		} else {
			tokenRow.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("Paste your token")
					.setValue(config.token)
					.onChange(async (value) => {
						config.token = value.trim();
						await onTokenChange();
					});
			});
		}
		this.describeTokenScopes(tokenRow.descEl, config);

		const status = new Setting(group.listEl)
			.setName("Connection")
			.setDesc(this.tokenStatus.get(config.id) ?? "Not checked yet")
			.addButton((button) =>
				button.setButtonText("Check").onClick(async () => {
					button.setDisabled(true);
					status.setDesc("Checking…");
					const provider = this.plugin.providerRegistry.get(
						config.id,
					);
					let text = "Provider is disabled";
					if (provider) {
						provider.initializeClient();
						const result = await provider
							.validateToken()
							.catch(() => ({ valid: false, user: undefined }));
						text = result.valid
							? `Connected as ${result.user ?? "unknown"}`
							: "Token not accepted";
					}
					this.tokenStatus.set(config.id, text);
					status.setDesc(text);
					button.setDisabled(false);
				}),
			);

		if (!isPrimaryGitHub) {
			const danger = { listEl: el };
			new Setting(danger.listEl)
				.setName("Remove server")
				.setDesc("Also removes its repositories")
				.addButton((button) =>
					button
						.setButtonText("Remove")
						.setWarning()
						.onClick(() =>
							this.confirmRemoveProvider(config, panel),
						),
				);
		}
	}

	private describeTokenScopes(
		descEl: HTMLElement,
		config: ProviderConfig,
	): void {
		const hints: Record<ProviderType, { url: string }> = {
			github: {
				url: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens",
			},
			gitlab: {
				url: "https://docs.gitlab.com/user/profile/personal_access_tokens/",
			},
			forgejo: {
				url: "https://forgejo.org/docs/latest/user/token-scope/",
			},
		};
		const hint = hints[config.type];
		descEl.appendText("Read-only. ");
		descEl.createEl("a", { text: "Required scopes", href: hint.url });
	}

	private confirmRemoveProvider(
		config: ProviderConfig,
		panel: InlinePanel,
	): void {
		const affected = this.plugin.settings.repositories.filter(
			(r) => r.provider === config.id,
		);
		new ConfirmModal(this.app, {
			title: "Remove server",
			message: "Remove",
			highlight: this.label(config),
			details:
				affected.length > 0
					? `${affected.length} tracked ${affected.length === 1 ? "repository is" : "repositories are"} removed as well. Notes stay in your vault.`
					: "No tracked repositories are affected.",
			items: affected.map((r) => r.repository),
			confirmText: "Remove",
			confirmIcon: "trash-2",
			onConfirm: async () => {
				this.plugin.settings.repositories =
					this.plugin.settings.repositories.filter(
						(r) => r.provider !== config.id,
					);
				this.plugin.settings.providers =
					this.plugin.settings.providers.filter(
						(p) => p.id !== config.id,
					);
				this.tokenStatus.delete(config.id);
				await this.save();
				panel.close();
			},
		}).open();
	}

	private renderRepositories(containerEl: HTMLElement): void {
		this.renderAddRepository(new SettingGroup(containerEl).listEl);
		const group = new SettingGroup(containerEl).setHeading("Repositories");
		const all = this.plugin.settings.repositories;
		const providerOf = (repo: RepositoryTracking) =>
			repo.provider ?? "github";

		const repos = all;

		const repoKey = (repo: RepositoryTracking) =>
			`${providerOf(repo)}:${repo.repository}`;
		const existing = new Set(all.map(repoKey));
		for (const key of [...this.repoSelection]) {
			if (!existing.has(key)) this.repoSelection.delete(key);
		}
		const checkboxes = new Map<string, HTMLInputElement>();
		const bulk = group.listEl.createDiv({ cls: "github-issues-bulk" });
		const countEl = bulk.createSpan({ cls: "github-issues-bulk-count" });
		const bulkButtons = bulk.createDiv({
			cls: "github-issues-bulk-buttons",
		});
		const selectAll = bulkButtons.createEl("button", {
			text: "Select all",
		});
		const selectNone = bulkButtons.createEl("button", {
			text: "Deselect all",
		});
		const removeSelected = bulkButtons.createEl("button", {
			cls: "mod-warning",
			text: "Remove selected",
		});
		const updateBulk = () => {
			const n = this.repoSelection.size;
			bulk.toggleClass("github-issues-hidden", n === 0);
			countEl.setText(`${n} selected`);
			for (const [key, box] of checkboxes)
				box.checked = this.repoSelection.has(key);
			for (const section of sections) section.sync();
		};
		selectAll.onclick = () => {
			for (const repo of repos) this.repoSelection.add(repoKey(repo));
			updateBulk();
		};
		selectNone.onclick = () => {
			this.repoSelection.clear();
			updateBulk();
		};
		removeSelected.onclick = () => {
			const selected = all.filter((r) =>
				this.repoSelection.has(repoKey(r)),
			);
			if (selected.length === 0) return;
			new ConfirmModal(this.app, {
				title: "Remove repositories",
				message: "Stop tracking",
				highlight: `${selected.length} ${selected.length === 1 ? "repository" : "repositories"}`,
				details: "Notes stay in your vault.",
				items: selected.map((r) => {
					const config = this.providerById(r.provider);
					return `${r.repository} (${config ? this.label(config) : providerOf(r)})`;
				}),
				confirmText: "Remove",
				confirmIcon: "trash-2",
				onConfirm: async () => {
					this.plugin.settings.repositories =
						this.plugin.settings.repositories.filter(
							(r) => !this.repoSelection.has(repoKey(r)),
						);
					this.repoSelection.clear();
					await this.save();
					this.display();
				},
			}).open();
		};

		const sections: {
			headEl: HTMLElement;
			bodyEl: HTMLElement;
			open: boolean;
			rows: { el: HTMLElement; text: string }[];
			sync: () => void;
		}[] = [];
		let query = "";
		const applySearch = (value: string) => {
			query = value;
			const q = value.trim().toLowerCase();
			for (const section of sections) {
				let visible = 0;
				for (const row of section.rows) {
					const hide = !!q && !row.text.includes(q);
					row.el.toggleClass("github-issues-hidden", hide);
					if (!hide) visible++;
				}
				section.headEl.toggleClass(
					"github-issues-hidden",
					visible === 0,
				);
				const show = q ? visible > 0 : section.open;
				section.bodyEl.toggleClass("github-issues-hidden", !show);
				section.headEl.toggleClass("is-open", show);
			}
		};
		if (all.length > 6) {
			group.addSearch((search) =>
				search
					.setPlaceholder("Filter repositories")
					.onChange((value) => applySearch(value)),
			);
		}

		const order = this.plugin.settings.providers.map((p) => p.id);
		const providerIds = [...new Set(repos.map(providerOf))].sort(
			(x, y) => order.indexOf(x) - order.indexOf(y),
		);
		for (const providerId of providerIds) {
			const config = this.providerById(providerId);
			const providerName = config ? this.label(config) : providerId;
			const providerRepos = repos
				.filter((r) => providerOf(r) === providerId)
				.sort((x, y) =>
					x.repository.localeCompare(y.repository, undefined, {
						sensitivity: "base",
					}),
				);
			const keys = providerRepos.map(repoKey);
			const open =
				this.openRepoGroups.has(providerId) || providerIds.length === 1;

			const headEl = group.listEl.createDiv({
				cls: "github-issues-section",
				attr: {
					role: "button",
					tabindex: "0",
					"aria-expanded": String(open),
				},
			});
			const headBox = headEl.createEl("input", {
				type: "checkbox",
				cls: "github-issues-repo-checkbox",
				attr: { "aria-label": `Select all of ${providerName}` },
			});
			setIcon(
				headEl.createSpan({ cls: "github-issues-section-chevron" }),
				"chevron-right",
			);
			setIcon(
				headEl.createSpan({ cls: "github-issues-section-icon" }),
				providerIcon(config?.type),
			);
			headEl.createSpan({
				cls: "github-issues-section-name",
				text: providerName,
			});
			headEl.createSpan({
				cls: "github-issues-filter-count",
				text: String(providerRepos.length),
			});
			const bodyEl = group.listEl.createDiv({
				cls: "github-issues-section-body",
			});

			const section = {
				headEl,
				bodyEl,
				open,
				rows: [] as { el: HTMLElement; text: string }[],
				sync: () => {
					const n = keys.filter((k) =>
						this.repoSelection.has(k),
					).length;
					headBox.checked = n > 0 && n === keys.length;
					headBox.indeterminate = n > 0 && n < keys.length;
				},
			};
			sections.push(section);
			const toggleOpen = () => {
				section.open = !section.open;
				if (section.open) this.openRepoGroups.add(providerId);
				else this.openRepoGroups.delete(providerId);
				headEl.setAttr("aria-expanded", String(section.open));
				applySearch(query);
			};
			headEl.onclick = (event) => {
				if (event.target === headBox) return;
				toggleOpen();
			};
			headEl.onkeydown = (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					toggleOpen();
				}
			};
			headBox.onchange = () => {
				for (const k of keys) {
					if (headBox.checked) this.repoSelection.add(k);
					else this.repoSelection.delete(k);
				}
				updateBulk();
			};

			for (const repo of providerRepos) {
				const setting = new Setting(bodyEl)
					.setName(repo.repository)
					.setDesc(this.profileName(repo.profileId));
				setting.settingEl.addClass("github-issues-owner-item");
				const key = repoKey(repo);
				const box = createEl("input", {
					type: "checkbox",
					cls: "github-issues-repo-checkbox",
					attr: { "aria-label": `Select ${repo.repository}` },
				});
				box.checked = this.repoSelection.has(key);
				box.onchange = () => {
					if (box.checked) this.repoSelection.add(key);
					else this.repoSelection.delete(key);
					updateBulk();
				};
				setting.settingEl.prepend(box);
				checkboxes.set(key, box);
				setting.addExtraButton((button) =>
					button
						.setIcon("refresh-cw")
						.setTooltip("Sync now")
						.onClick(() =>
							this.plugin.syncSingleRepository(
								repo.repository,
								repo.provider,
							),
						),
				);
				const inline = this.addInlineDetails(
					setting,
					`repo:${providerId}:${repo.repository}`,
					(el) => this.renderRepositoryDetails(el, repo),
				);
				setting.addExtraButton((button) =>
					button
						.setIcon("trash-2")
						.setTooltip("Remove")
						.onClick(() =>
							this.modalManager.showDeleteRepositoryModal(
								repo,
								() => this.display(),
							),
						),
				);
				const text = `${repo.repository} ${providerName}`.toLowerCase();
				if (inline) section.rows.push({ el: inline, text });
				section.rows.push({ el: setting.settingEl, text });
			}
		}
		applySearch("");

		updateBulk();

		if (all.length === 0) {
			new Setting(group.listEl).setDesc("No repositories yet");
		}
	}

	private renderAddRepository(listEl: HTMLElement): void {
		const providers = this.enabledProviders();
		let name = "";
		let providerId =
			providers.find((p) => p.id === "github")?.id ??
			providers[0]?.id ??
			"github";
		let profileId = "default";

		const row = new Setting(listEl)
			.setName("Add repository")
			.setDesc("owner/name")
			.addText((text) => {
				text.setPlaceholder("owner/repository").onChange((value) => {
					name = value.trim();
				});
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") void add();
				});
			});
		if (providers.length > 1) {
			row.addDropdown((dropdown) => {
				for (const p of providers)
					dropdown.addOption(p.id, this.label(p));
				dropdown
					.setValue(providerId)
					.onChange((value) => (providerId = value));
			});
		}
		row.addDropdown((dropdown) => {
			for (const p of getRepositoryProfiles(this.plugin.settings)) {
				dropdown.addOption(p.id, p.name);
			}
			dropdown
				.setValue(profileId)
				.onChange((value) => (profileId = value));
		}).addButton((button) =>
			button
				.setButtonText("Add")
				.setCta()
				.onClick(() => void add()),
		);

		const add = async () => {
			if (!/^[^/\s]+(\/[^/\s]+)+$/.test(name)) return;
			await this.repositoryListManager.addRepository(
				name,
				profileId,
				providerId,
			);
			this.display();
		};
	}

	/**
	 * Inline list to pick several items at once: load on demand, filter,
	 * toggle and add. Nothing is fetched until the user clicks Load.
	 */
	private renderBrowser(
		containerEl: HTMLElement,
		state: BrowseState,
		options: {
			heading: string;
			description: string;
			sources?: { id: string; label: string }[];
			load: (source: string) => Promise<BrowseItem[]>;
			add: (keys: string[]) => Promise<void>;
			profiles?: { id: string; name: string }[];
			emptyText: string;
			noun: string;
		},
	): void {
		const group = new SettingGroup(containerEl).setHeading(options.heading);
		const sources = options.sources ?? [];
		if (
			sources.length > 0 &&
			!sources.some((src) => src.id === state.source)
		) {
			state.source = sources[0].id;
			state.items = null;
		}

		const load = async () => {
			state.loading = true;
			state.error = null;
			state.selected.clear();
			state.openGroups.clear();
			this.display();
			try {
				state.items = await options.load(state.source);
			} catch (error) {
				state.items = null;
				state.error = (error as Error).message;
			}
			state.loading = false;
			this.display();
		};

		const loader = new Setting(group.listEl)
			.setName(sources.length > 0 ? "Server" : "Load list")
			.setDesc(
				state.loading
					? "Loading…"
					: state.error
						? `Could not load: ${state.error}`
						: options.description,
			);
		if (sources.length > 1) {
			loader.addDropdown((dropdown) => {
				for (const src of sources)
					dropdown.addOption(src.id, src.label);
				dropdown.setValue(state.source).onChange((value) => {
					state.source = value;
					state.items = null;
					state.selected.clear();
					this.display();
				});
			});
		}
		loader.addButton((button) =>
			button
				.setButtonText(state.items ? "Reload" : "Load")
				.setDisabled(
					state.loading ||
						(options.sources !== undefined && sources.length === 0),
				)
				.onClick(() => void load()),
		);
		if (options.sources !== undefined && sources.length === 0) {
			loader.setDesc("Connect a server first.");
		}

		if (!state.items || state.loading) return;

		const list = new SettingGroup(containerEl);
		const items = state.items;
		if (items.length === 0) {
			new Setting(list.listEl).setDesc(options.emptyText);
			return;
		}

		const checkboxes = new Map<string, HTMLInputElement>();
		const sections: {
			headEl: HTMLElement;
			bodyEl: HTMLElement;
			open: boolean;
			rows: { el: HTMLElement; item: BrowseItem }[];
			sync: () => void;
		}[] = [];
		const isVisible = (el: HTMLElement) =>
			!el.hasClass("github-issues-hidden");

		list.addSearch((search) =>
			search
				.setPlaceholder(`Search ${options.noun}`)
				.setValue(state.filter)
				.onChange((value) => {
					state.filter = value;
					applyFilter();
				}),
		);

		const bar = list.listEl.createDiv({
			cls: "github-issues-bulk github-issues-bulk-browse",
		});
		const countEl = bar.createSpan({ cls: "github-issues-bulk-count" });
		const barButtons = bar.createDiv({ cls: "github-issues-bulk-buttons" });
		const selectAll = barButtons.createEl("button", { text: "Select all" });
		const selectNone = barButtons.createEl("button", {
			text: "Select none",
		});
		if (options.profiles) {
			const profileSelect = barButtons.createEl("select", {
				cls: "dropdown",
				attr: { "aria-label": "Profile for new entries" },
			});
			for (const p of options.profiles) {
				profileSelect.createEl("option", { value: p.id, text: p.name });
			}
			profileSelect.value = state.profileId;
			profileSelect.onchange = () =>
				(state.profileId = profileSelect.value);
		}
		const addButton = barButtons.createEl("button", { cls: "mod-cta" });

		const update = () => {
			let shown = 0;
			for (const section of sections) {
				for (const row of section.rows) if (isVisible(row.el)) shown++;
			}
			const n = state.selected.size;
			countEl.setText(`${n} of ${shown} selected`);
			addButton.setText(`Add selected (${n})`);
			addButton.disabled = n === 0;
			for (const [key, box] of checkboxes) {
				box.checked = state.selected.has(key);
			}
			for (const section of sections) section.sync();
		};

		const applyFilter = () => {
			const q = state.filter.trim().toLowerCase();
			for (const section of sections) {
				let visible = 0;
				for (const row of section.rows) {
					const text =
						`${row.item.group}/${row.item.name} ${row.item.desc}`.toLowerCase();
					const hide = !!q && !text.includes(q);
					row.el.toggleClass("github-issues-hidden", hide);
					if (!hide) visible++;
				}
				section.headEl.toggleClass(
					"github-issues-hidden",
					visible === 0,
				);
				const show = q ? visible > 0 : section.open;
				section.bodyEl.toggleClass("github-issues-hidden", !show);
				section.headEl.toggleClass("is-open", show);
				section.headEl.setAttr("aria-expanded", String(show));
			}
			update();
		};

		selectAll.onclick = () => {
			for (const section of sections) {
				for (const row of section.rows) {
					if (!row.item.tracked && isVisible(row.el)) {
						state.selected.add(row.item.key);
					}
				}
			}
			update();
		};
		selectNone.onclick = () => {
			state.selected.clear();
			update();
		};
		addButton.onclick = async () => {
			const keys = [...state.selected];
			if (keys.length === 0) return;
			addButton.disabled = true;
			await options.add(keys);
			state.items = null;
			state.selected.clear();
			state.filter = "";
			this.display();
		};

		const groups = new Map<string, BrowseItem[]>();
		for (const item of items) {
			const g = groups.get(item.group) ?? [];
			g.push(item);
			groups.set(item.group, g);
		}
		const owners = [...groups.keys()].sort((x, y) =>
			x.localeCompare(y, undefined, { sensitivity: "base" }),
		);

		for (const owner of owners) {
			const groupItems = groups.get(owner)!;
			const selectable = groupItems
				.filter((item) => !item.tracked)
				.map((item) => item.key);
			const open = state.openGroups.has(owner) || owners.length === 1;
			const headEl = list.listEl.createDiv({
				cls: "github-issues-section",
				attr: { role: "button", tabindex: "0" },
			});
			const headBox = headEl.createEl("input", {
				type: "checkbox",
				cls: "github-issues-repo-checkbox",
				attr: { "aria-label": `Select all of ${owner}` },
			});
			headBox.disabled = selectable.length === 0;
			setIcon(
				headEl.createSpan({ cls: "github-issues-section-chevron" }),
				"chevron-right",
			);
			setIcon(
				headEl.createSpan({ cls: "github-issues-section-icon" }),
				"user",
			);
			headEl.createSpan({
				cls: "github-issues-section-name",
				text: owner,
			});
			headEl.createSpan({
				cls: "github-issues-filter-count",
				text: String(groupItems.length),
			});
			const bodyEl = list.listEl.createDiv({
				cls: "github-issues-section-body",
			});
			const section = {
				headEl,
				bodyEl,
				open,
				rows: [] as { el: HTMLElement; item: BrowseItem }[],
				sync: () => {
					const n = selectable.filter((k) =>
						state.selected.has(k),
					).length;
					headBox.checked = n > 0 && n === selectable.length;
					headBox.indeterminate = n > 0 && n < selectable.length;
				},
			};
			sections.push(section);
			const toggleOpen = () => {
				section.open = !section.open;
				if (section.open) state.openGroups.add(owner);
				else state.openGroups.delete(owner);
				applyFilter();
			};
			headEl.onclick = (event) => {
				if (event.target === headBox) return;
				toggleOpen();
			};
			headEl.onkeydown = (event) => {
				if (event.target === headBox) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					toggleOpen();
				}
			};
			headBox.onchange = () => {
				for (const k of selectable) {
					if (headBox.checked) state.selected.add(k);
					else state.selected.delete(k);
				}
				update();
			};

			for (const item of groupItems) {
				const setting = new Setting(bodyEl).setName(item.name);
				if (item.desc) setting.setDesc(item.desc);
				setting.settingEl.addClass("github-issues-owner-item");
				if (item.tracked) {
					setting.settingEl.addClass("github-issues-is-tracked");
					setting.controlEl.createSpan({
						cls: "github-issues-muted",
						text: "Tracked",
					});
				} else {
					const box = createEl("input", {
						type: "checkbox",
						cls: "github-issues-repo-checkbox",
						attr: { "aria-label": `Select ${owner}/${item.name}` },
					});
					box.checked = state.selected.has(item.key);
					box.onchange = () => {
						if (box.checked) state.selected.add(item.key);
						else state.selected.delete(item.key);
						update();
					};
					setting.settingEl.prepend(box);
					setting.settingEl.addClass("github-issues-selectable");
					setting.settingEl.onclick = (event) => {
						if (event.target === box) return;
						box.click();
					};
					checkboxes.set(item.key, box);
				}
				section.rows.push({ el: setting.settingEl, item });
			}
		}
		applyFilter();
	}

	private renderRepositoryBrowser(containerEl: HTMLElement): void {
		const sources = this.enabledProviders()
			.filter((p) => !!this.plugin.getProviderToken(p.id))
			.map((p) => ({ id: p.id, label: this.label(p) }));
		this.renderBrowser(containerEl, this.repoBrowse, {
			heading: "Browse a server",
			description: "Pick several repositories at once",
			sources,
			profiles: getRepositoryProfiles(this.plugin.settings),
			emptyText: "No repositories found for this account.",
			noun: "repositories",
			load: async (providerId) => {
				const repos =
					await this.plugin.fetchAvailableRepositories(providerId);
				this.repoRefs.clear();
				return repos
					.map((repo) => {
						const full = `${repo.owner.login}/${repo.name}`;
						this.repoRefs.set(full, repo.id);
						return {
							key: full,
							group: repo.owner.login,
							name: repo.name,
							desc: "",
							tracked: this.plugin.settings.repositories.some(
								(r) =>
									r.repository === full &&
									(r.provider ?? "github") === providerId,
							),
						};
					})
					.sort((a, b) => a.key.localeCompare(b.key));
			},
			add: async (keys) => {
				const ids = new Map<string, number>();
				for (const key of keys) {
					const id = this.repoRefs.get(key);
					if (id !== undefined) ids.set(key, id);
				}
				await this.repositoryListManager.addMultipleRepositories(
					keys,
					new Map(keys.map((k) => [k, this.repoBrowse.profileId])),
					this.repoBrowse.source,
					ids,
				);
			},
		});
	}

	private renderProjectBrowser(containerEl: HTMLElement): void {
		this.renderBrowser(containerEl, this.projectBrowse, {
			heading: "Browse projects",
			description: "Pick several projects at once",
			emptyText: "No projects found for this account.",
			noun: "projects",
			sources: this.enabledProviders()
				.filter((p) => !!this.plugin.getProviderToken(p.id))
				.map((p) => ({ id: p.id, label: this.label(p) })),
			load: async (providerId) => {
				const provider = this.plugin.providerRegistry.get(providerId);
				if (!provider?.fetchAllAvailableProjects)
					throw new Error("This server is not connected");
				const repositories = this.plugin.settings.repositories
					.filter((r) => (r.provider ?? "github") === providerId)
					.map((r) => ({
						repository: r.repository,
						gitlabProjectId: r.gitlabProjectId,
					}));
				const projects =
					provider.type === "github"
						? await provider.fetchAllAvailableProjects()
						: await provider.fetchAllAvailableProjects(
								repositories,
							);
				this.projectRefs.clear();
				return projects
					.map((p) => {
						const info: ProjectInfo = {
							id: p.id,
							title: p.title,
							number: p.number,
							url: p.url,
							owner: p.owner || "unknown",
							closed: p.closed,
							provider: providerId,
						};
						this.projectRefs.set(info.id, info);
						return {
							key: info.id,
							group: info.owner ?? "unknown",
							name: info.title,
							desc: `#${info.number}${info.closed ? " · closed" : ""}`,
							tracked: this.plugin.settings.trackedProjects.some(
								(t) => t.id === info.id,
							),
						};
					})
					.sort((a, b) => a.name.localeCompare(b.name));
			},
			add: async (keys) => {
				const list = keys
					.map((k) => this.projectRefs.get(k))
					.filter((p): p is ProjectInfo => !!p);
				await new ProjectListManager(
					this.app,
					this.plugin,
				).addMultipleProjects(list);
			},
		});
	}

	private renderRepositoryDetails(
		el: HTMLElement,
		repo: RepositoryTracking,
	): void {
		new Setting(el).setName("Provider").addDropdown((dropdown) => {
			for (const p of this.enabledProviders()) {
				dropdown.addOption(p.id, this.label(p));
			}
			dropdown
				.setValue(repo.provider ?? "github")
				.onChange(async (value) => {
					repo.provider = value;
					await this.save();
				});
		});
		new Setting(el)
			.setName("Profile")
			.setDesc("Folders and templates")
			.addDropdown((dropdown) => {
				for (const p of getRepositoryProfiles(this.plugin.settings)) {
					dropdown.addOption(p.id, p.name);
				}
				dropdown
					.setValue(repo.profileId ?? "default")
					.onChange(async (value) => {
						repo.profileId = value;
						await this.save();
					});
			});
		new Setting(el)
			.setName("Escape hash tags")
			.setDesc("Keep # from becoming a tag")
			.addToggle((toggle) =>
				toggle.setValue(repo.escapeHashTags).onChange(async (value) => {
					repo.escapeHashTags = value;
					await this.save();
				}),
			);

		new Setting(el).setHeading().setName("Issues");
		this.repositoryRenderer.renderIssueSettings(el, repo);
		new Setting(el).setHeading().setName("Pull requests");
		this.repositoryRenderer.renderPullRequestSettings(el, repo);
	}

	private renderProjects(containerEl: HTMLElement): void {
		const group = new SettingGroup(containerEl).setHeading("Projects");
		const projects = this.plugin.settings.trackedProjects;

		for (const project of projects) {
			const config = this.providerById(project.provider ?? "github");
			const row = this.withIcon(
				new Setting(group.listEl)
					.setName(project.title)
					.setDesc(
						`${config ? this.label(config) : (project.provider ?? "GitHub")} · ${project.owner}`,
					),
				providerIcon(config?.type),
			).addExtraButton((button) =>
				button
					.setIcon("refresh-cw")
					.setTooltip("Sync now")
					.onClick(() => this.plugin.syncSingleProject(project.id)),
			);
			this.addInlineDetails(row, `project:${project.id}`, (el) =>
				this.renderProjectDetails(el, project),
			);
			row.addExtraButton((button) =>
				button
					.setIcon("trash-2")
					.setTooltip("Remove")
					.onClick(() => this.confirmRemoveProject(project)),
			);
		}
		if (projects.length === 0) {
			new Setting(group.listEl).setDesc("No projects yet");
		}
	}

	private renderProjectDetails(
		el: HTMLElement,
		project: TrackedProject,
	): void {
		new Setting(el)
			.setName("Profile")
			.setDesc("Folders and templates")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "None (project settings)");
				for (const p of getProjectProfiles(this.plugin.settings)) {
					dropdown.addOption(p.id, p.name);
				}
				dropdown
					.setValue(project.profileId ?? "")
					.onChange(async (value) => {
						project.profileId = value || undefined;
						await this.save();
					});
			});
		new Setting(el).setHeading().setName("Kanban");
		this.projectRenderer.renderProjectSettings(el, project);
	}

	private confirmRemoveProject(project: TrackedProject): void {
		new ConfirmModal(this.app, {
			title: "Remove project",
			message: "Stop tracking",
			highlight: project.title,
			details: "Notes stay in your vault.",
			confirmText: "Remove",
			confirmIcon: "trash-2",
			onConfirm: async () => {
				this.plugin.settings.trackedProjects =
					this.plugin.settings.trackedProjects.filter(
						(p) => p.id !== project.id,
					);
				await this.save();
				this.display();
			},
		}).open();
	}

	private renderProfiles(containerEl: HTMLElement): void {
		const { profiles, repositories, trackedProjects } =
			this.plugin.settings;
		let profile = profiles.find((p) => p.id === this.selectedProfileId);
		if (!profile) {
			profile = profiles.find((p) => p.id === "default") ?? profiles[0];
			this.selectedProfileId = profile?.id ?? "default";
		}
		if (!profile) return;
		const current = profile;
		const isDefault =
			current.id === "default" || current.id === "default-project";
		const users =
			current.type === "repository"
				? repositories.filter(
						(r) => (r.profileId ?? "default") === current.id,
					).length
				: trackedProjects.filter((p) => p.profileId === current.id)
						.length;

		const group = new SettingGroup(containerEl);
		const picker = new Setting(group.listEl)
			.setName("Profile")
			.setDesc(
				`${current.type === "repository" ? "Repository profile" : "Project profile"} · used by ${users}`,
			)
			.addDropdown((dropdown) => {
				for (const p of profiles) dropdown.addOption(p.id, p.name);
				dropdown.setValue(current.id).onChange((value) => {
					this.selectedProfileId = value;
					this.display();
				});
			})
			.addExtraButton((button) =>
				button
					.setIcon("plus")
					.setTooltip("New profile")
					.onClick(() =>
						this.profileRenderer.showCreateProfileModal(() => {
							const newest =
								this.plugin.settings.profiles[
									this.plugin.settings.profiles.length - 1
								];
							if (newest) this.selectedProfileId = newest.id;
							this.display();
						}),
					),
			)
			.addExtraButton((button) =>
				button
					.setIcon("copy")
					.setTooltip("Duplicate")
					.onClick(() => void this.duplicateProfile(current)),
			);
		if (!isDefault) {
			picker.addExtraButton((button) =>
				button
					.setIcon("trash-2")
					.setTooltip("Delete")
					.onClick(() =>
						this.profileRenderer.showDeleteProfileModal(
							current,
							() => {
								this.selectedProfileId =
									current.type === "repository"
										? "default"
										: "default-project";
								this.display();
							},
						),
					),
			);
			new Setting(group.listEl).setName("Name").addText((text) =>
				text.setValue(current.name).onChange(async (value) => {
					if (!value.trim()) return;
					current.name = value.trim();
					await this.save();
				}),
			);
		}

		this.profileRenderer.renderProfileEditor(containerEl, current);
	}

	private async duplicateProfile(profile: SettingsProfile): Promise<void> {
		const copy: SettingsProfile = {
			...structuredClone(profile),
			id: `profile-${Date.now()}`,
			name: `${profile.name} (copy)`,
		};
		this.plugin.settings.profiles.push(copy);
		this.selectedProfileId = copy.id;
		await this.save();
		this.display();
	}

	private renderSync(containerEl: HTMLElement): void {
		const { settings } = this.plugin;
		const group = new SettingGroup(containerEl).setHeading("Sync");

		new Setting(group.listEl)
			.setName("Sync on startup")
			.addToggle((toggle) =>
				toggle
					.setValue(settings.syncOnStartup)
					.onChange(async (value) => {
						settings.syncOnStartup = value;
						await this.save();
					}),
			);

		new Setting(group.listEl)
			.setName("Background sync")
			.setDesc("Sync periodically while Obsidian is open")
			.addToggle((toggle) =>
				toggle
					.setValue(settings.enableBackgroundSync)
					.onChange(async (value) => {
						settings.enableBackgroundSync = value;
						await this.save();
						this.display();
					}),
			);

		if (settings.enableBackgroundSync) {
			new Setting(group.listEl)
				.setName("Interval (minutes)")
				.setDesc("At least 5 minutes")
				.addText((text) =>
					text
						.setPlaceholder("30")
						.setValue(String(settings.backgroundSyncInterval))
						.onChange(async (value) => {
							settings.backgroundSyncInterval = Math.max(
								5,
								parseInt(value, 10) || 5,
							);
							await this.save();
						}),
				);
		}

		new Setting(group.listEl)
			.setName("Delete closed items after (days)")
			.setDesc("Only if the profile allows deletion")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(String(settings.cleanupClosedIssuesDays))
					.onChange(async (value) => {
						settings.cleanupClosedIssuesDays = Math.max(
							1,
							parseInt(value, 10) || 1,
						);
						await this.save();
					}),
			);

		new Setting(group.listEl)
			.setName("Notifications")
			.setDesc("How much the plugin reports during a sync")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						minimal: "Minimal",
						normal: "Normal",
						extensive: "Extensive",
						debug: "Debug",
					})
					.setValue(settings.syncNoticeMode)
					.onChange(async (value) => {
						settings.syncNoticeMode =
							value as typeof settings.syncNoticeMode;
						await this.save();
					}),
			);
	}

	private renderAdvanced(containerEl: HTMLElement): void {
		const { settings } = this.plugin;
		const group = new SettingGroup(containerEl).setHeading("Advanced");

		new Setting(group.listEl)
			.setName("Date format")
			.setDesc("e.g. yyyy-MM-dd HH:mm")
			.addText((text) =>
				text
					.setPlaceholder("yyyy-MM-dd HH:mm:ss")
					.setValue(settings.dateFormat)
					.onChange(async (value) => {
						settings.dateFormat = value;
						await this.save();
					}),
			);

		const escaping = new Setting(group.listEl)
			.setName("Content escaping")
			.setDesc(ESCAPE_MODES[settings.escapeMode]?.desc ?? "")
			.addDropdown((dropdown) => {
				for (const [mode, info] of Object.entries(ESCAPE_MODES)) {
					dropdown.addOption(mode, info.label);
				}
				dropdown
					.setValue(settings.escapeMode)
					.onChange(async (value) => {
						const mode = value as typeof settings.escapeMode;
						if (mode === "disabled") {
							new ConfirmModal(this.app, {
								title: "Disable escaping?",
								tone: "warning",
								message: "Issue content is written as is.",
								details:
									"Only continue if you trust every tracked repository.",
								confirmText: "Disable escaping",
								onConfirm: async () => {
									settings.escapeMode = mode;
									escaping.setDesc(ESCAPE_MODES[mode].desc);
									await this.save();
								},
								onCancel: () => {
									dropdown.setValue(settings.escapeMode);
								},
							}).open();
							return;
						}
						settings.escapeMode = mode;
						escaping.setDesc(ESCAPE_MODES[mode].desc);
						await this.save();
					});
			});

		new Setting(group.listEl)
			.setName("Escape hash tags")
			.setDesc("Keep # from becoming a tag")
			.addToggle((toggle) =>
				toggle
					.setValue(settings.escapeHashTags)
					.onChange(async (value) => {
						settings.escapeHashTags = value;
						await this.save();
					}),
			);
	}
}
