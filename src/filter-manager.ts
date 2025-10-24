import { RepositoryTracking } from "./types";
import { GitHubClient } from "./github-client";

export class FilterManager {
	constructor(
		private gitHubClient: GitHubClient,
	) {}

	public filterIssues(repo: RepositoryTracking, issues: any[]): any[] {
		let filteredIssues = issues;

		// Apply label filtering
		if ((repo.enableLabelFilter ?? false) && (repo.labelFilters?.length ?? 0) > 0) {
			filteredIssues = this.applyLabelFilter(filteredIssues, repo.labelFilterMode ?? "include", repo.labelFilters ?? []);
		}

		// Apply assignee filtering
		if ((repo.enableAssigneeFilter ?? false)) {
			filteredIssues = this.applyAssigneeFilter(filteredIssues, repo.assigneeFilterMode ?? "assigned-to-me", repo.assigneeFilters ?? []);
		}

		return filteredIssues;
	}

	public filterPullRequests(
		repo: RepositoryTracking,
		pullRequests: any[],
	): any[] {
		let filteredPullRequests = pullRequests;

		// Apply label filtering
		if ((repo.enablePrLabelFilter ?? false) && (repo.prLabelFilters?.length ?? 0) > 0) {
			filteredPullRequests = this.applyLabelFilter(filteredPullRequests, repo.prLabelFilterMode ?? "include", repo.prLabelFilters ?? []);
		}

		// Apply assignee filtering
		if ((repo.enablePrAssigneeFilter ?? false)) {
			filteredPullRequests = this.applyAssigneeFilter(filteredPullRequests, repo.prAssigneeFilterMode ?? "assigned-to-me", repo.prAssigneeFilters ?? []);
		}

		return filteredPullRequests;
	}

	private applyLabelFilter(items: any[], filterMode: "include" | "exclude", labelFilters: string[]): any[] {
		return items.filter((item) => {
			if (!item.labels || !Array.isArray(item.labels)) {
				// If no labels, only include in "exclude" mode (since we're excluding specific labels)
				return filterMode === "exclude";
			}

			const itemLabels = item.labels.map((label: any) =>
				typeof label === 'string' ? label : label.name
			);

			const hasMatchingLabel = labelFilters.some(filterLabel =>
				itemLabels.includes(filterLabel)
			);

			// Include mode: only include items that have at least one of the specified labels
			// Exclude mode: exclude items that have any of the specified labels
			return filterMode === "include" ? hasMatchingLabel : !hasMatchingLabel;
		});
	}

	private applyAssigneeFilter(items: any[], filterMode: "assigned-to-me" | "assigned-to-specific" | "unassigned" | "any-assigned", assigneeFilters: string[]): any[] {
		return items.filter((item) => {
			const assignees = item.assignees || [];
			const assigneeUsernames = assignees.map((assignee: any) => assignee.login || assignee);

			switch (filterMode) {
				case "assigned-to-me":
					// Get current user from the item's context or use a stored current user
					const currentUser = this.getCurrentUser();
					return assigneeUsernames.includes(currentUser);

				case "assigned-to-specific":
					// Check if any of the specified assignees are assigned
					return assigneeFilters.some(filterUser => assigneeUsernames.includes(filterUser));

				case "unassigned":
					// Only include items with no assignees
					return assigneeUsernames.length === 0;

				case "any-assigned":
					// Only include items that have at least one assignee
					return assigneeUsernames.length > 0;

				default:
					return true;
			}
		});
	}

	private getCurrentUser(): string {
		// Access the current user from the GitHubClient through the main plugin
		return this.gitHubClient ? this.gitHubClient.getCurrentUser() : "";
	}
}
