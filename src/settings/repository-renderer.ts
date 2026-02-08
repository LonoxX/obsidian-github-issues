import { App, Setting } from "obsidian";
import { RepositoryTracking } from "../types";
import GitHubTrackerPlugin from "../main";

export class RepositoryRenderer {
	constructor(
		private app: App,
		private plugin: GitHubTrackerPlugin,
		private fetchLabels?: (repo: string, repoObj: RepositoryTracking, filterType: 'labelFilters' | 'prLabelFilters', textArea: HTMLTextAreaElement) => Promise<void>,
		private fetchCollaborators?: (repo: string, repoObj: RepositoryTracking, filterType: 'assigneeFilters' | 'prAssigneeFilters' | 'prReviewerFilters', textArea: HTMLTextAreaElement) => Promise<void>,
	) {}

	renderIssueSettings(
		container: HTMLElement,
		repo: RepositoryTracking,
	): void {
		new Setting(container).setName("Issue filters").setHeading();

		container
			.createEl("p", {
				text: "Filter which issues are synced for this repository. Tracking, folders, templates, and other settings are managed via the assigned profile.",
			})
			.addClass("setting-item-description");

		// Label filtering settings
		this.renderLabelFilter(container, repo, 'issue');

		// Assignee filtering settings
		this.renderAssigneeFilter(container, repo, 'issue');
	}

	renderPullRequestSettings(
		container: HTMLElement,
		repo: RepositoryTracking,
	): void {
		new Setting(container).setName("Pull request filters").setHeading();

		container
			.createEl("p", {
				text: "Filter which pull requests are synced for this repository. Tracking, folders, templates, and other settings are managed via the assigned profile.",
			})
			.addClass("setting-item-description");

		// Label filtering settings for pull requests
		this.renderLabelFilter(container, repo, 'pr');

		// Assignee filtering settings for pull requests
		this.renderAssigneeFilter(container, repo, 'pr');

		// Reviewer filtering settings for pull requests
		this.renderReviewerFilter(container, repo);
	}

	private renderLabelFilter(
		container: HTMLElement,
		repo: RepositoryTracking,
		type: 'issue' | 'pr'
	): void {
		const enableFilterProp = type === 'issue' ? 'enableLabelFilter' : 'enablePrLabelFilter';
		const filterModeProp = type === 'issue' ? 'labelFilterMode' : 'prLabelFilterMode';
		const filtersProp = type === 'issue' ? 'labelFilters' : 'prLabelFilters';
		const title = type === 'issue' ? 'issues' : 'pull requests';

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
			.setDesc(`Choose whether to include or exclude ${title} with the specified labels`)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("include", `Include - Only show ${title} with these labels`)
					.addOption("exclude", `Exclude - Hide ${title} with these labels`)
					.setValue(repo[filterModeProp] ?? "include")
					.onChange(async (value) => {
						repo[filterModeProp] = value as "include" | "exclude";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(labelFilterContainer)
			.setName("Label filters")
			.setDesc("Comma-separated list of labels to filter by (case-sensitive)")
			.addTextArea((text) => {
				text
					.setPlaceholder("bug, enhancement, help wanted")
					.setValue((repo[filtersProp] || []).join(", "))
					.onChange(async (value) => {
						repo[filtersProp] = value
							.split(",")
							.map(label => label.trim())
							.filter(label => label.length > 0);
						await this.plugin.saveSettings();
					});

				return text;
			})
			.addButton((button) =>
				button
					.setButtonText("Fetch available labels")
					.setTooltip("Load labels from this repository to help with configuration")
					.onClick(async () => {
						const textArea = button.buttonEl.closest('.setting-item')?.querySelector('textarea');
						if (textArea && this.fetchLabels) {
							await this.fetchLabels(repo.repository, repo, filtersProp, textArea as HTMLTextAreaElement);
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
			.setDesc("Enable filtering pull requests based on requested reviewers")
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
			.setDesc("Choose how to filter pull requests by reviewers")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("review-requested-from-me", "Review requested from me")
					.addOption("review-requested-from-specific", "Review requested from specific users")
					.addOption("no-review-requested", "No review requested")
					.addOption("any-review-requested", "Any review requested")
					.setValue(repo.prReviewerFilterMode ?? "review-requested-from-me")
					.onChange(async (value) => {
						repo.prReviewerFilterMode = value as "review-requested-from-me" | "review-requested-from-specific" | "no-review-requested" | "any-review-requested";
						reviewerSpecificContainer.classList.toggle(
							"github-issues-hidden",
							value !== "review-requested-from-specific",
						);
						await this.plugin.saveSettings();
					}),
			);

		const reviewerSpecificContainer = reviewerFilterContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		reviewerSpecificContainer.classList.toggle(
			"github-issues-hidden",
			(repo.prReviewerFilterMode ?? "review-requested-from-me") !== "review-requested-from-specific",
		);

		new Setting(reviewerSpecificContainer)
			.setName("Specific reviewers")
			.setDesc("Comma-separated list of GitHub usernames to filter by")
			.addTextArea((text) => {
				text
					.setPlaceholder("username1, username2, username3")
					.setValue((repo.prReviewerFilters || []).join(", "))
					.onChange(async (value) => {
						repo.prReviewerFilters = value
							.split(",")
							.map(username => username.trim())
							.filter(username => username.length > 0);
						await this.plugin.saveSettings();
					});

				return text;
			})
			.addButton((button) =>
				button
					.setButtonText("Fetch collaborators")
					.setTooltip("Load collaborators from this repository to help with configuration")
					.onClick(async () => {
						const textArea = button.buttonEl.closest('.setting-item')?.querySelector('textarea');
						if (textArea && this.fetchCollaborators) {
							await this.fetchCollaborators(repo.repository, repo, 'prReviewerFilters', textArea as HTMLTextAreaElement);
						}
					}),
			);
	}

	private renderAssigneeFilter(
		container: HTMLElement,
		repo: RepositoryTracking,
		type: 'issue' | 'pr'
	): void {
		const enableFilterProp = type === 'issue' ? 'enableAssigneeFilter' : 'enablePrAssigneeFilter';
		const filterModeProp = type === 'issue' ? 'assigneeFilterMode' : 'prAssigneeFilterMode';
		const filtersProp = type === 'issue' ? 'assigneeFilters' : 'prAssigneeFilters';
		const title = type === 'issue' ? 'issues' : 'pull requests';
		const titleShort = type === 'issue' ? 'Issues' : 'PRs';

		new Setting(container)
			.setName(`Filter ${title} by assignees`)
			.setDesc(`Enable filtering ${title} based on who they are assigned to`)
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
			.setDesc(`Choose how to filter ${title} by assignees`)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("assigned-to-me", `Assigned to me - Only my ${title}`)
					.addOption("assigned-to-specific", "Assigned to specific users")
					.addOption("unassigned", `Unassigned - ${titleShort} with no assignee`)
					.addOption("any-assigned", `Any assigned - ${titleShort} with any assignee`)
					.setValue(repo[filterModeProp] ?? "assigned-to-me")
					.onChange(async (value) => {
						repo[filterModeProp] = value as "assigned-to-me" | "assigned-to-specific" | "unassigned" | "any-assigned";
						assigneeSpecificContainer.classList.toggle(
							"github-issues-hidden",
							value !== "assigned-to-specific",
						);
						await this.plugin.saveSettings();
					}),
			);

		const assigneeSpecificContainer = assigneeFilterContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		assigneeSpecificContainer.classList.toggle(
			"github-issues-hidden",
			(repo[filterModeProp] ?? "assigned-to-me") !== "assigned-to-specific",
		);

		new Setting(assigneeSpecificContainer)
			.setName("Specific assignees")
			.setDesc("Comma-separated list of GitHub usernames to filter by")
			.addTextArea((text) => {
				text
					.setPlaceholder("username1, username2, username3")
					.setValue((repo[filtersProp] || []).join(", "))
					.onChange(async (value) => {
						repo[filtersProp] = value
							.split(",")
							.map(username => username.trim())
							.filter(username => username.length > 0);
						await this.plugin.saveSettings();
					});

				return text;
			})
			.addButton((button) =>
				button
					.setButtonText("Fetch collaborators")
					.setTooltip("Load collaborators from this repository to help with configuration")
					.onClick(async () => {
						const textArea = button.buttonEl.closest('.setting-item')?.querySelector('textarea');
						if (textArea && this.fetchCollaborators) {
							await this.fetchCollaborators(repo.repository, repo, filtersProp, textArea as HTMLTextAreaElement);
						}
					}),
			);
	}
}
