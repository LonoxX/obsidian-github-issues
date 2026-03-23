import { RepositoryTracking } from "./types";
import { IssueProvider } from "./providers/provider";

export class FilterManager {
	constructor(private provider: IssueProvider) {}

	public filterIssues(repo: RepositoryTracking, issues: any[]): any[] {
		let filteredIssues = issues;

		// Apply label filtering
		if (
			(repo.enableLabelFilter ?? false) &&
			(repo.labelFilters?.length ?? 0) > 0
		) {
			filteredIssues = this.applyLabelFilter(
				filteredIssues,
				repo.labelFilterMode ?? "include",
				repo.labelFilters ?? [],
			);
		}

		// Apply assignee filtering
		if (
			(repo.enableAssigneeFilter ?? false) &&
			(repo.assigneeFilterModes?.length ?? 0) > 0
		) {
			filteredIssues = this.applyAssigneeFilter(
				filteredIssues,
				repo.assigneeFilterModes ?? [],
				repo.assigneeFilters ?? [],
			);
		}

		return filteredIssues;
	}

	public filterPullRequests(
		repo: RepositoryTracking,
		pullRequests: any[],
	): any[] {
		let filteredPullRequests = pullRequests;

		// Apply label filtering
		if (
			(repo.enablePrLabelFilter ?? false) &&
			(repo.prLabelFilters?.length ?? 0) > 0
		) {
			filteredPullRequests = this.applyLabelFilter(
				filteredPullRequests,
				repo.prLabelFilterMode ?? "include",
				repo.prLabelFilters ?? [],
			);
		}

		// Apply assignee filtering
		if (
			(repo.enablePrAssigneeFilter ?? false) &&
			(repo.prAssigneeFilterModes?.length ?? 0) > 0
		) {
			filteredPullRequests = this.applyAssigneeFilter(
				filteredPullRequests,
				repo.prAssigneeFilterModes ?? [],
				repo.prAssigneeFilters ?? [],
			);
		}

		// Apply reviewer filtering
		if (
			(repo.enablePrReviewerFilter ?? false) &&
			(repo.prReviewerFilterModes?.length ?? 0) > 0
		) {
			filteredPullRequests = this.applyReviewerFilter(
				filteredPullRequests,
				repo.prReviewerFilterModes ?? [],
				repo.prReviewerFilters ?? [],
			);
		}

		return filteredPullRequests;
	}

	private applyLabelFilter(
		items: any[],
		filterMode: "include" | "exclude",
		labelFilters: string[],
	): any[] {
		return items.filter((item) => {
			if (!item.labels || !Array.isArray(item.labels)) {
				// If no labels, only include in "exclude" mode (since we're excluding specific labels)
				return filterMode === "exclude";
			}

			const itemLabels = item.labels.map((label: any) =>
				typeof label === "string" ? label : label.name,
			);

			const hasMatchingLabel = labelFilters.some((filterLabel) =>
				itemLabels.includes(filterLabel),
			);

			// Include mode: only include items that have at least one of the specified labels
			// Exclude mode: exclude items that have any of the specified labels
			return filterMode === "include"
				? hasMatchingLabel
				: !hasMatchingLabel;
		});
	}

	private applyAssigneeFilter(
		items: any[],
		filterModes: Array<
			| "assigned-to-me"
			| "assigned-to-specific"
			| "unassigned"
			| "any-assigned"
		>,
		assigneeFilters: string[],
	): any[] {
		return items.filter((item) => {
			const assignees = item.assignees || [];
			const assigneeUsernames = assignees.map(
				(assignee: any) => assignee.login || assignee,
			);
			const currentUser = this.getCurrentUser();

			// Item passes if it matches ANY of the selected modes (OR logic)
			return filterModes.some((mode) => {
				switch (mode) {
					case "assigned-to-me":
						return assigneeUsernames.includes(currentUser);
					case "assigned-to-specific":
						return assigneeFilters.some((filterUser) =>
							assigneeUsernames.includes(filterUser),
						);
					case "unassigned":
						return assigneeUsernames.length === 0;
					case "any-assigned":
						return assigneeUsernames.length > 0;
					default:
						return false;
				}
			});
		});
	}

	private applyReviewerFilter(
		items: any[],
		filterModes: Array<
			| "review-requested-from-me"
			| "review-requested-from-specific"
			| "no-review-requested"
			| "any-review-requested"
		>,
		reviewerFilters: string[],
	): any[] {
		return items.filter((item) => {
			const reviewers = item.requested_reviewers || [];
			const reviewerUsernames = reviewers.map(
				(reviewer: any) => reviewer.login || reviewer,
			);
			const currentUser = this.getCurrentUser();

			// Item passes if it matches ANY of the selected modes (OR logic)
			return filterModes.some((mode) => {
				switch (mode) {
					case "review-requested-from-me":
						return reviewerUsernames.includes(currentUser);
					case "review-requested-from-specific":
						return reviewerFilters.some((filterUser) =>
							reviewerUsernames.includes(filterUser),
						);
					case "no-review-requested":
						return reviewerUsernames.length === 0;
					case "any-review-requested":
						return reviewerUsernames.length > 0;
					default:
						return false;
				}
			});
		});
	}

	private getCurrentUser(): string {
		// Access the current user from the provider
		return this.provider ? this.provider.getCurrentUser() : "";
	}
}
