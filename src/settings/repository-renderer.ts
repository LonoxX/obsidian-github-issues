import { App, Setting } from "obsidian";
import { RepositoryTracking } from "../types";
import GitHubTrackerPlugin from "../main";

export class RepositoryRenderer {
	constructor(
		private app: App,
		private plugin: GitHubTrackerPlugin,
		private fetchLabels?: (
			repo: string,
			repoObj: RepositoryTracking,
			filterType: "labelFilters" | "prLabelFilters",
			textArea: HTMLTextAreaElement,
		) => Promise<void>,
		private fetchCollaborators?: (
			repo: string,
			repoObj: RepositoryTracking,
			filterType:
				| "assigneeFilters"
				| "prAssigneeFilters"
				| "prReviewerFilters",
			textArea: HTMLTextAreaElement,
		) => Promise<void>,
	) {}

	renderIssueSettings(
		container: HTMLElement,
		repo: RepositoryTracking,
	): void {
		new Setting(container)
			.setName("Use own issue filters")
			.setDesc(
				"When on, this repo uses its own issue filters instead of the profile's.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(repo.overrideIssueFilters ?? false)
					.onChange(async (value) => {
						repo.overrideIssueFilters = value;
						overrideContainer.classList.toggle(
							"github-issues-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const overrideContainer = container.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		overrideContainer.classList.toggle(
			"github-issues-hidden",
			!(repo.overrideIssueFilters ?? false),
		);

		this.renderLabelFilter(overrideContainer, repo, "issue");
		this.renderAssigneeFilter(overrideContainer, repo, "issue");
	}

	renderPullRequestSettings(
		container: HTMLElement,
		repo: RepositoryTracking,
	): void {
		new Setting(container)
			.setName("Use own pull request filters")
			.setDesc(
				"When on, this repo uses its own PR filters instead of the profile's.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(repo.overridePrFilters ?? false)
					.onChange(async (value) => {
						repo.overridePrFilters = value;
						overrideContainer.classList.toggle(
							"github-issues-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const overrideContainer = container.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		overrideContainer.classList.toggle(
			"github-issues-hidden",
			!(repo.overridePrFilters ?? false),
		);

		this.renderLabelFilter(overrideContainer, repo, "pr");
		this.renderAssigneeFilter(overrideContainer, repo, "pr");
		this.renderReviewerFilter(overrideContainer, repo);
	}

	private renderLabelFilter(
		container: HTMLElement,
		repo: RepositoryTracking,
		type: "issue" | "pr",
	): void {
		const enableFilterProp =
			type === "issue" ? "enableLabelFilter" : "enablePrLabelFilter";
		const filterModeProp =
			type === "issue" ? "labelFilterMode" : "prLabelFilterMode";
		const filtersProp =
			type === "issue" ? "labelFilters" : "prLabelFilters";
		const title = type === "issue" ? "issues" : "pull requests";

		new Setting(container)
			.setName(`Filter ${title} by labels`)
			.setDesc(`Enable filtering ${title} based on their labels`)
			.addToggle((toggle) =>
				toggle
					.setValue(repo[enableFilterProp] ?? false)
					.onChange(async (value) => {
						repo[enableFilterProp] = value;
						labelFilterContainer.classList.toggle(
							"github-issues-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const labelFilterContainer = container.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		labelFilterContainer.classList.toggle(
			"github-issues-hidden",
			!(repo[enableFilterProp] ?? false),
		);

		new Setting(labelFilterContainer)
			.setName("Label filter mode")
			.setDesc(
				`Choose whether to include or exclude ${title} with the specified labels`,
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"include",
						`Include - Only show ${title} with these labels`,
					)
					.addOption(
						"exclude",
						`Exclude - Hide ${title} with these labels`,
					)
					.setValue(repo[filterModeProp] ?? "include")
					.onChange(async (value) => {
						repo[filterModeProp] = value as "include" | "exclude";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(labelFilterContainer)
			.setName("Label filters")
			.setDesc(
				"Comma-separated list of labels to filter by (case-sensitive)",
			)
			.addTextArea((text) => {
				text.setPlaceholder("bug, enhancement, help wanted")
					.setValue((repo[filtersProp] || []).join(", "))
					.onChange(async (value) => {
						repo[filtersProp] = value
							.split(",")
							.map((label) => label.trim())
							.filter((label) => label.length > 0);
						await this.plugin.saveSettings();
					});

				return text;
			})
			.addButton((button) =>
				button
					.setButtonText("Fetch available labels")
					.setTooltip(
						"Load labels from this repository to help with configuration",
					)
					.onClick(async () => {
						const textArea = button.buttonEl
							.closest(".setting-item")
							?.querySelector("textarea");
						if (textArea && this.fetchLabels) {
							await this.fetchLabels(
								repo.repository,
								repo,
								filtersProp,
								textArea as HTMLTextAreaElement,
							);
						}
					}),
			);
	}

	private renderReviewerFilter(
		container: HTMLElement,
		repo: RepositoryTracking,
	): void {
		new Setting(container)
			.setName("Filter pull requests by reviewers")
			.setDesc(
				"Enable filtering pull requests based on requested reviewers",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(repo.enablePrReviewerFilter ?? false)
					.onChange(async (value) => {
						repo.enablePrReviewerFilter = value;
						reviewerFilterContainer.classList.toggle(
							"github-issues-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const reviewerFilterContainer = container.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		reviewerFilterContainer.classList.toggle(
			"github-issues-hidden",
			!(repo.enablePrReviewerFilter ?? false),
		);

		new Setting(reviewerFilterContainer)
			.setName("Reviewer filter mode")
			.setDesc(
				"Choose one or more modes-  pull requests matching any selected mode will be synced",
			);

		const reviewerModeOptions: Array<{
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

		const reviewerSpecificContainer = reviewerFilterContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);

		const currentReviewerModes = (): Array<
			| "review-requested-from-me"
			| "review-requested-from-specific"
			| "no-review-requested"
			| "any-review-requested"
		> => repo.prReviewerFilterModes ?? [];

		reviewerSpecificContainer.classList.toggle(
			"github-issues-hidden",
			!currentReviewerModes().includes("review-requested-from-specific"),
		);

		for (const option of reviewerModeOptions) {
			new Setting(reviewerFilterContainer)
				.setName(option.label)
				.addToggle((toggle) => {
					toggle
						.setValue(currentReviewerModes().includes(option.value))
						.onChange(async (checked) => {
							const modes = [...currentReviewerModes()];
							if (checked) {
								if (!modes.includes(option.value))
									modes.push(option.value);
							} else {
								const idx = modes.indexOf(option.value);
								if (idx >= 0) modes.splice(idx, 1);
							}
							repo.prReviewerFilterModes = modes;
							reviewerSpecificContainer.classList.toggle(
								"github-issues-hidden",
								!modes.includes(
									"review-requested-from-specific",
								),
							);
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(reviewerSpecificContainer)
			.setName("Specific reviewers")
			.setDesc("Comma-separated list of GitHub usernames to filter by")
			.addTextArea((text) => {
				text.setPlaceholder("username1, username2, username3")
					.setValue((repo.prReviewerFilters || []).join(", "))
					.onChange(async (value) => {
						repo.prReviewerFilters = value
							.split(",")
							.map((username) => username.trim())
							.filter((username) => username.length > 0);
						await this.plugin.saveSettings();
					});

				return text;
			})
			.addButton((button) =>
				button
					.setButtonText("Fetch collaborators")
					.setTooltip(
						"Load collaborators from this repository to help with configuration",
					)
					.onClick(async () => {
						const textArea = button.buttonEl
							.closest(".setting-item")
							?.querySelector("textarea");
						if (textArea && this.fetchCollaborators) {
							await this.fetchCollaborators(
								repo.repository,
								repo,
								"prReviewerFilters",
								textArea as HTMLTextAreaElement,
							);
						}
					}),
			);
	}

	private renderAssigneeFilter(
		container: HTMLElement,
		repo: RepositoryTracking,
		type: "issue" | "pr",
	): void {
		const enableFilterProp =
			type === "issue"
				? "enableAssigneeFilter"
				: "enablePrAssigneeFilter";
		const filterModesProp =
			type === "issue" ? "assigneeFilterModes" : "prAssigneeFilterModes";
		const filtersProp =
			type === "issue" ? "assigneeFilters" : "prAssigneeFilters";
		const title = type === "issue" ? "issues" : "pull requests";

		new Setting(container)
			.setName(`Filter ${title} by assignees`)
			.setDesc(
				`Enable filtering ${title} based on who they are assigned to`,
			)
			.addToggle((toggle) =>
				toggle
					.setValue(repo[enableFilterProp] ?? false)
					.onChange(async (value) => {
						repo[enableFilterProp] = value;
						assigneeFilterContainer.classList.toggle(
							"github-issues-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const assigneeFilterContainer = container.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		assigneeFilterContainer.classList.toggle(
			"github-issues-hidden",
			!(repo[enableFilterProp] ?? false),
		);

		new Setting(assigneeFilterContainer)
			.setName("Assignee filter mode")
			.setDesc(
				`Choose one or more modes-  ${title} matching any selected mode will be synced`,
			);

		const modeOptions: Array<{
			value:
				| "assigned-to-me"
				| "assigned-to-specific"
				| "unassigned"
				| "any-assigned";
			label: string;
		}> = [
			{ value: "assigned-to-me", label: `Assigned to me` },
			{
				value: "assigned-to-specific",
				label: "Assigned to specific users",
			},
			{ value: "unassigned", label: `Unassigned` },
			{ value: "any-assigned", label: `Any assigned` },
		];

		const assigneeSpecificContainer = assigneeFilterContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);

		const currentModes = (): Array<
			| "assigned-to-me"
			| "assigned-to-specific"
			| "unassigned"
			| "any-assigned"
		> =>
			(repo[filterModesProp] as Array<
				| "assigned-to-me"
				| "assigned-to-specific"
				| "unassigned"
				| "any-assigned"
			>) ?? [];

		assigneeSpecificContainer.classList.toggle(
			"github-issues-hidden",
			!currentModes().includes("assigned-to-specific"),
		);

		for (const option of modeOptions) {
			new Setting(assigneeFilterContainer)
				.setName(option.label)
				.addToggle((toggle) => {
					toggle
						.setValue(currentModes().includes(option.value))
						.onChange(async (checked) => {
							const modes = [...currentModes()];
							if (checked) {
								if (!modes.includes(option.value))
									modes.push(option.value);
							} else {
								const idx = modes.indexOf(option.value);
								if (idx >= 0) modes.splice(idx, 1);
							}
							(repo[filterModesProp] as any) = modes;
							assigneeSpecificContainer.classList.toggle(
								"github-issues-hidden",
								!modes.includes("assigned-to-specific"),
							);
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(assigneeSpecificContainer)
			.setName("Specific assignees")
			.setDesc("Comma-separated list of GitHub usernames to filter by")
			.addTextArea((text) => {
				text.setPlaceholder("username1, username2, username3")
					.setValue((repo[filtersProp] || []).join(", "))
					.onChange(async (value) => {
						repo[filtersProp] = value
							.split(",")
							.map((username) => username.trim())
							.filter((username) => username.length > 0);
						await this.plugin.saveSettings();
					});

				return text;
			})
			.addButton((button) =>
				button
					.setButtonText("Fetch collaborators")
					.setTooltip(
						"Load collaborators from this repository to help with configuration",
					)
					.onClick(async () => {
						const textArea = button.buttonEl
							.closest(".setting-item")
							?.querySelector("textarea");
						if (textArea && this.fetchCollaborators) {
							await this.fetchCollaborators(
								repo.repository,
								repo,
								filtersProp,
								textArea as HTMLTextAreaElement,
							);
						}
					}),
			);
	}
}
