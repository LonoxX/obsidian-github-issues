import { App, Modal, Notice, Setting, SettingGroup, setIcon } from "obsidian";
import type IssueTrackerPlugin from "../main";
import { ProviderConfig, ProviderType } from "../types";
import { FORGEJO_DEFAULT_URL } from "../providers/forgejo/forgejo-provider";
import { RepositoryListManager } from "../settings/repository-list-manager";
import { providerIcon } from "../util/provider-ui";

type Step = "welcome" | "provider" | "connect" | "repository" | "done";

const STEPS: Step[] = ["welcome", "provider", "connect", "repository", "done"];

interface ProviderChoice {
	type: ProviderType;
	title: string;
	hint: string;
	defaultUrl: string;
	scopes: string;
	tokenUrl: (baseUrl: string) => string;
}

const TOKEN_NAME = encodeURIComponent("Obsidian Git Issues");

const CHOICES: ProviderChoice[] = [
	{
		type: "github",
		title: "GitHub",
		hint: "github.com",
		defaultUrl: "https://github.com",
		scopes: "repo, read:org (read:project for GitHub Projects)",
		tokenUrl: () =>
			`https://github.com/settings/tokens/new?scopes=repo,read:org,read:project&description=${TOKEN_NAME}`,
	},
	{
		type: "gitlab",
		title: "GitLab",
		hint: "gitlab.com or self-hosted",
		defaultUrl: "https://gitlab.com",
		scopes: "read_api",
		tokenUrl: (base) =>
			`${base}/-/user_settings/personal_access_tokens?name=${TOKEN_NAME}&scopes=read_api`,
	},
	{
		type: "forgejo",
		title: "Forgejo / Gitea",
		hint: "Codeberg or self-hosted",
		defaultUrl: FORGEJO_DEFAULT_URL,
		scopes: "read:issue, read:repository, read:user",
		tokenUrl: (base) => `${base}/user/settings/applications`,
	},
];

/**
 * First-run assistant: choose a provider, connect it with a token that is
 * checked against the server, add a first repository and run the first sync.
 */
export class OnboardingModal extends Modal {
	private step: Step = "welcome";
	private choice: ProviderChoice | null = null;
	private baseUrl = "";
	private token = "";
	private providerId: string | null = null;
	private connectedAs: string | null = null;
	private repository = "";
	private repositoryAdded = false;

	constructor(
		app: App,
		private plugin: IssueTrackerPlugin,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass(
			"github-issues-modal",
			"github-issues-onboarding",
		);
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
		void this.markCompleted();
	}

	private async markCompleted(): Promise<void> {
		if (this.plugin.settings.onboardingCompleted) return;
		this.plugin.settings.onboardingCompleted = true;
		await this.plugin.saveSettings();
	}

	private go(step: Step): void {
		this.step = step;
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		const index = STEPS.indexOf(this.step);
		const progress = contentEl.createDiv(
			"github-issues-onboarding-progress",
		);
		STEPS.forEach((_, i) => {
			progress.createSpan({
				cls: [
					"github-issues-onboarding-dot",
					...(i < index ? ["is-done"] : []),
					...(i === index ? ["is-current"] : []),
				],
			});
		});

		const body = contentEl.createDiv("github-issues-onboarding-body");
		const footer = contentEl.createDiv("modal-button-container");

		switch (this.step) {
			case "welcome":
				return this.renderWelcome(body, footer);
			case "provider":
				return this.renderProvider(body, footer);
			case "connect":
				return this.renderConnect(body, footer);
			case "repository":
				return this.renderRepository(body, footer);
			case "done":
				return this.renderDone(body, footer);
		}
	}

	private renderWelcome(body: HTMLElement, footer: HTMLElement): void {
		this.setTitle("Welcome to Git Issues & Pull Requests");
		body.createEl("p", {
			cls: "github-issues-onboarding-lead",
			text: "Issues and pull requests from GitHub, GitLab, Forgejo and Gitea as notes.",
		});
		const list = body.createEl("ul", {
			cls: "github-issues-onboarding-list",
		});
		for (const [icon, text] of [
			["plug", "Connect a server with a read-only token"],
			["book-marked", "Pick the repositories you want to follow"],
			[
				"refresh-cw",
				"Sync them into notes, on demand or in the background",
			],
		]) {
			const li = list.createEl("li");
			setIcon(li.createSpan("github-issues-onboarding-icon"), icon);
			li.createSpan({ text });
		}
		body.createEl("p", {
			cls: "setting-item-description",
			text: "Read-only. Your token stays on this device.",
		});

		footer.createEl("button", { text: "Skip" }).onclick = () =>
			this.close();
		footer.createEl("button", {
			text: "Get started",
			cls: "mod-cta",
		}).onclick = () => this.go("provider");
	}

	private renderProvider(body: HTMLElement, footer: HTMLElement): void {
		this.setTitle("Where are your repositories?");
		const grid = body.createDiv("github-issues-onboarding-choices");
		for (const choice of CHOICES) {
			const card = grid.createEl("button", {
				cls: "github-issues-onboarding-choice",
				attr: { type: "button" },
			});
			setIcon(
				card.createSpan("github-issues-onboarding-choice-icon"),
				providerIcon(choice.type),
			);
			card.createSpan({
				cls: "github-issues-onboarding-choice-title",
				text: choice.title,
			});
			card.createSpan({
				cls: "github-issues-onboarding-choice-hint",
				text: choice.hint,
			});
			card.onclick = () => {
				if (this.choice?.type !== choice.type) {
					this.choice = choice;
					this.baseUrl = "";
					this.token = "";
					this.connectedAs = null;
				}
				this.go("connect");
			};
		}
		body.createEl("p", {
			cls: "setting-item-description",
			text: "More servers can be added later.",
		});
		footer.createEl("button", { text: "Back" }).onclick = () =>
			this.go("welcome");
	}

	private effectiveBaseUrl(): string {
		const choice = this.choice!;
		return (this.baseUrl.trim() || choice.defaultUrl).replace(/\/+$/, "");
	}

	private renderConnect(body: HTMLElement, footer: HTMLElement): void {
		const choice = this.choice!;
		this.setTitle(`Connect ${choice.title}`);
		const group = new SettingGroup(body);

		if (choice.type !== "github") {
			new Setting(group.listEl)
				.setName("Server")
				.setDesc(
					`Empty for ${choice.defaultUrl.replace("https://", "")}`,
				)
				.addText((text) =>
					text
						.setPlaceholder(choice.defaultUrl)
						.setValue(this.baseUrl)
						.onChange((value) => {
							this.baseUrl = value;
							this.connectedAs = null;
							updateState();
						}),
				);
		}

		const tokenSetting = new Setting(group.listEl)
			.setName("Access token")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("Paste your token")
					.setValue(this.token)
					.onChange((value) => {
						this.token = value.trim();
						this.connectedAs = null;
						updateState();
					});
			});
		const desc = tokenSetting.descEl;
		desc.appendText(`Needs ${choice.scopes}. `);
		const link = desc.createEl("a", { text: "Create a token" });
		link.onclick = (e) => {
			e.preventDefault();
			window.open(choice.tokenUrl(this.effectiveBaseUrl()), "_blank");
		};

		const status = body.createDiv("github-issues-onboarding-status");

		footer.createEl("button", { text: "Back" }).onclick = () =>
			this.go("provider");
		const check = footer.createEl("button", { text: "Check connection" });
		const next = footer.createEl("button", {
			text: "Continue",
			cls: "mod-cta",
		});
		next.onclick = () => this.go("repository");

		const updateState = () => {
			check.disabled = !this.token;
			next.disabled = !this.connectedAs;
			status.empty();
			if (this.connectedAs) {
				status.addClass("is-success");
				setIcon(status.createSpan(), "check-circle");
				status.createSpan({ text: `Connected as ${this.connectedAs}` });
			} else {
				status.removeClass("is-success");
			}
		};

		check.onclick = async () => {
			check.disabled = true;
			check.setText("Checking…");
			status.removeClass("is-error");
			try {
				const user = await this.connect();
				this.connectedAs = user;
				if (!user) {
					status.empty();
					status.addClass("is-error");
					setIcon(status.createSpan(), "alert-circle");
					status.createSpan({
						text: "Token not accepted. Check address and scopes.",
					});
					return;
				}
				updateState();
			} finally {
				check.setText("Check connection");
				check.disabled = !this.token;
			}
		};

		updateState();
	}

	/** Store the provider and validate the token; returns the user name. */
	private async connect(): Promise<string | null> {
		const choice = this.choice!;
		const settings = this.plugin.settings;
		let config: ProviderConfig | undefined =
			choice.type === "github"
				? settings.providers.find((p) => p.id === "github")
				: settings.providers.find((p) => p.type === choice.type);
		if (!config) {
			config = {
				id: choice.type,
				type: choice.type,
				enabled: true,
				token: "",
				useSecretStorage: false,
				secretTokenName: "",
			};
			settings.providers.push(config);
		}
		config.enabled = true;
		config.useSecretStorage = false;
		config.secretTokenName = "";
		config.token = this.token;
		if (choice.type !== "github") {
			config.baseUrl = this.baseUrl.trim() || undefined;
		}
		this.providerId = config.id;
		if (choice.type !== "github") {
			const github = settings.providers.find((p) => p.id === "github");
			if (github && !this.plugin.getProviderToken(github.id)) {
				github.enabled = false;
			}
		}
		await this.plugin.saveSettings();

		const provider = this.plugin.providerRegistry.get(config.id);
		if (!provider) return null;
		const result = await provider.validateToken();
		return result.valid ? (result.user ?? "your account") : null;
	}

	private renderRepository(body: HTMLElement, footer: HTMLElement): void {
		this.setTitle("Add your first repository");
		const profile = this.plugin.settings.profiles.find(
			(p) => p.id === "default",
		);
		const group = new SettingGroup(body);

		new Setting(group.listEl)
			.setName("Repository")
			.setDesc("owner/name, for example LonoxX/obsidian-github-issues")
			.addText((text) =>
				text
					.setPlaceholder("owner/repository")
					.setValue(this.repository)
					.onChange((value) => {
						this.repository = value.trim();
						add.disabled = !/^[^/\s]+(\/[^/\s]+)+$/.test(
							this.repository,
						);
					}),
			);

		if (profile) {
			if (!profile.issueFolder || profile.issueFolder === "GitHub") {
				profile.issueFolder = "Issues";
			}
			if (
				!profile.pullRequestFolder ||
				profile.pullRequestFolder === "GitHub Pull Requests"
			) {
				profile.pullRequestFolder = "Pull Requests";
			}
			new Setting(group.listEl)
				.setName("Issue folder")
				.setDesc("With owner/repo subfolders")
				.addText((text) =>
					text
						.setValue(profile.issueFolder ?? "")
						.onChange((value) => {
							profile.issueFolder = value.trim() || "Issues";
						}),
				);
			new Setting(group.listEl)
				.setName("Also track pull requests")
				.addToggle((toggle) =>
					toggle
						.setValue(profile.trackPullRequest ?? false)
						.onChange((value) => {
							profile.trackPullRequest = value;
							prFolder.settingEl.toggleClass(
								"github-issues-hidden",
								!value,
							);
						}),
				);
			const prFolder = new Setting(group.listEl)
				.setName("Pull request folder")
				.addText((text) =>
					text
						.setValue(profile.pullRequestFolder ?? "")
						.onChange((value) => {
							profile.pullRequestFolder =
								value.trim() || "Pull Requests";
						}),
				);
			prFolder.settingEl.toggleClass(
				"github-issues-hidden",
				!(profile.trackPullRequest ?? false),
			);
		}

		footer.createEl("button", { text: "Back" }).onclick = () =>
			this.go("connect");
		footer.createEl("button", { text: "Skip" }).onclick = async () => {
			await this.plugin.saveSettings();
			this.go("done");
		};
		const add = footer.createEl("button", {
			text: "Add repository",
			cls: "mod-cta",
		});
		add.disabled = !this.repository;
		add.onclick = async () => {
			await this.plugin.saveSettings();
			const manager = new RepositoryListManager(this.app, this.plugin);
			await manager.addRepository(
				this.repository,
				"default",
				this.providerId ?? undefined,
			);
			this.repositoryAdded = this.plugin.settings.repositories.some(
				(r) =>
					r.repository === this.repository &&
					r.provider === this.providerId,
			);
			this.go("done");
		};
	}

	private renderDone(body: HTMLElement, footer: HTMLElement): void {
		this.setTitle("You are all set");
		body.createEl("p", {
			cls: "github-issues-onboarding-lead",
			text: this.repositoryAdded
				? `${this.repository} is tracked. Run the first sync to create its notes.`
				: "Add more in the Repositories tab.",
		});
		const status = body.createDiv("github-issues-onboarding-status");

		footer.createEl("button", { text: "Open settings" }).onclick = () => {
			this.close();
			const setting = (
				this.app as App & {
					setting?: { open(): void; openTabById(id: string): void };
				}
			).setting;
			setting?.open();
			setting?.openTabById(this.plugin.manifest.id);
		};
		const finish = footer.createEl("button", {
			text: this.repositoryAdded ? "Sync now" : "Finish",
			cls: "mod-cta",
		});
		finish.onclick = async () => {
			if (!this.repositoryAdded) return this.close();
			finish.disabled = true;
			finish.setText("Syncing…");
			try {
				await this.plugin.sync();
				status.empty();
				status.addClass("is-success");
				setIcon(status.createSpan(), "check-circle");
				status.createSpan({
					text: "Sync finished. Your notes are in the vault.",
				});
				finish.setText("Finish");
				finish.disabled = false;
				finish.onclick = () => this.close();
			} catch (error) {
				new Notice(`Sync failed: ${(error as Error).message}`);
				finish.setText("Sync now");
				finish.disabled = false;
			}
		};
	}
}
