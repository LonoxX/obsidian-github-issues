import {
	RepositoryTracking,
	IssueTrackerSettings,
	SettingsProfile,
	TrackedProject,
	DEFAULT_REPOSITORY_PROFILE,
	DEFAULT_PROJECT_PROFILE,
} from "../types";
/**
 * Fields managed exclusively by profiles. These are stripped from repo objects
 * before persisting to data.json and hydrated back from the profile on load.
 */
const PROFILE_MANAGED_FIELDS: (keyof RepositoryTracking)[] = [
	"trackIssues",
	"trackPullRequest",
	"issueUpdateMode",
	"allowDeleteIssue",
	"issueFolder",
	"issueNoteTemplate",
	"issueContentTemplate",
	"useCustomIssueContentTemplate",
	"includeIssueComments",
	"includeClosedIssues",
	"includeSubIssues",
	"pullRequestUpdateMode",
	"allowDeletePullRequest",
	"pullRequestFolder",
	"pullRequestNoteTemplate",
	"pullRequestContentTemplate",
	"useCustomPullRequestContentTemplate",
	"includePullRequestComments",
	"includeClosedPullRequests",
];

/**
 * Strip profile-managed fields from a repo object for persistence.
 * Returns a new object with only repo-specific fields.
 */
export function stripProfileFieldsFromRepo(
	repo: RepositoryTracking,
): Partial<RepositoryTracking> {
	const stripped: any = { ...repo };
	for (const field of PROFILE_MANAGED_FIELDS) {
		delete stripped[field];
	}
	return stripped;
}

/**
 * Find a profile by ID from the settings
 */
export function getProfileById(
	settings: IssueTrackerSettings,
	profileId: string,
): SettingsProfile | undefined {
	return settings.profiles.find((p) => p.id === profileId);
}

/**
 * Get all repository-type profiles
 */
export function getRepositoryProfiles(
	settings: IssueTrackerSettings,
): SettingsProfile[] {
	return settings.profiles.filter((p) => p.type === "repository");
}

/**
 * Get all project-type profiles
 */
export function getProjectProfiles(
	settings: IssueTrackerSettings,
): SettingsProfile[] {
	return settings.profiles.filter((p) => p.type === "project");
}

/**
 * Apply profile settings to a repository. All configurable settings come from
 * the profile exclusively - per-repo overrides are no longer used.
 */
export function getEffectiveRepoSettings(
	repo: RepositoryTracking,
	settings: IssueTrackerSettings,
): RepositoryTracking {
	const profile = getProfileById(settings, repo.profileId);

	// If no profile found (orphaned reference), use default profile values
	if (!profile || profile.type !== "repository") {
		const defaultProfile =
			getProfileById(settings, "default") ?? DEFAULT_REPOSITORY_PROFILE;
		return applyProfileToRepo(repo, defaultProfile);
	}

	return applyProfileToRepo(repo, profile);
}

/**
 * Apply a profile's settings to a repository.
 * Profile values are used directly for most fields. Filter fields are applied
 * conditionally - only when the repo has no override flag and the profile defines the filter.
 */
function applyProfileToRepo(
	repo: RepositoryTracking,
	profile: SettingsProfile,
): RepositoryTracking {
	const result: RepositoryTracking = {
		...repo,
		trackIssues: profile.trackIssues ?? true,
		trackPullRequest: profile.trackPullRequest ?? false,
		issueUpdateMode: profile.issueUpdateMode ?? "none",
		allowDeleteIssue: profile.allowDeleteIssue ?? true,
		issueFolder: profile.issueFolder ?? "GitHub",
		issueNoteTemplate: profile.issueNoteTemplate ?? "Issue - {number}",
		issueContentTemplate: profile.issueContentTemplate ?? "",
		useCustomIssueContentTemplate: !!profile.issueContentTemplate,
		includeIssueComments: profile.includeIssueComments ?? true,
		includeClosedIssues: profile.includeClosedIssues ?? false,
		includeSubIssues: profile.includeSubIssues ?? false,
		pullRequestUpdateMode: profile.pullRequestUpdateMode ?? "none",
		allowDeletePullRequest: profile.allowDeletePullRequest ?? true,
		pullRequestFolder: profile.pullRequestFolder ?? "GitHub Pull Requests",
		pullRequestNoteTemplate:
			profile.pullRequestNoteTemplate ?? "PR - {number}",
		pullRequestContentTemplate: profile.pullRequestContentTemplate ?? "",
		useCustomPullRequestContentTemplate:
			!!profile.pullRequestContentTemplate,
		includePullRequestComments: profile.includePullRequestComments ?? true,
		includeClosedPullRequests: profile.includeClosedPullRequests ?? false,
	};

	if (!repo.overrideIssueFilters) {
		if (profile.enableLabelFilter !== undefined) {
			result.enableLabelFilter = profile.enableLabelFilter;
			result.labelFilterMode = profile.labelFilterMode ?? "include";
			result.labelFilters = profile.labelFilters ?? [];
		}
		if (profile.enableAssigneeFilter !== undefined) {
			result.enableAssigneeFilter = profile.enableAssigneeFilter;
			result.assigneeFilterModes = profile.assigneeFilterModes ?? [
				"assigned-to-me",
			];
			result.assigneeFilters = profile.assigneeFilters ?? [];
		}
	}
	if (!repo.overridePrFilters) {
		if (profile.enablePrLabelFilter !== undefined) {
			result.enablePrLabelFilter = profile.enablePrLabelFilter;
			result.prLabelFilterMode = profile.prLabelFilterMode ?? "include";
			result.prLabelFilters = profile.prLabelFilters ?? [];
		}
		if (profile.enablePrAssigneeFilter !== undefined) {
			result.enablePrAssigneeFilter = profile.enablePrAssigneeFilter;
			result.prAssigneeFilterModes = profile.prAssigneeFilterModes ?? [
				"assigned-to-me",
			];
			result.prAssigneeFilters = profile.prAssigneeFilters ?? [];
		}
		if (profile.enablePrReviewerFilter !== undefined) {
			result.enablePrReviewerFilter = profile.enablePrReviewerFilter;
			result.prReviewerFilterModes = profile.prReviewerFilterModes ?? [
				"review-requested-from-me",
			];
			result.prReviewerFilters = profile.prReviewerFilters ?? [];
		}
	}

	return result;
}

/**
 * Effective project settings: merges profile defaults onto TrackedProject.
 * All configurable settings (folders, templates, sync toggles) come from
 * the profile - per-project overrides are no longer used.
 */
export function getEffectiveProjectSettings(
	project: TrackedProject,
	settings: IssueTrackerSettings,
): TrackedProject {
	const profile = getProfileById(
		settings,
		project.profileId ?? "default-project",
	);

	if (!profile || profile.type !== "project") {
		const defaultProfile =
			getProfileById(settings, "default-project") ??
			DEFAULT_PROJECT_PROFILE;
		return applyProfileToProject(project, defaultProfile);
	}

	return applyProfileToProject(project, profile);
}

/**
 * Apply a project profile's settings to a tracked project.
 * Profile values are used directly - no per-project overrides.
 */
function applyProfileToProject(
	project: TrackedProject,
	profile: SettingsProfile,
): TrackedProject {
	return {
		...project,
		issueFolder: profile.projectIssueFolder ?? "GitHub/{project}",
		pullRequestFolder:
			profile.projectPullRequestFolder ?? "GitHub/{project}",
		issueNoteTemplate:
			profile.projectIssueNoteTemplate ?? "Issue - {number}",
		pullRequestNoteTemplate:
			profile.projectPullRequestNoteTemplate ?? "PR - {number}",
		useCustomIssueContentTemplate: !!profile.projectIssueContentTemplate,
		issueContentTemplate: profile.projectIssueContentTemplate ?? "",
		useCustomPullRequestContentTemplate:
			!!profile.projectPullRequestContentTemplate,
		pullRequestContentTemplate:
			profile.projectPullRequestContentTemplate ?? "",
		skipHiddenStatusesOnSync: profile.skipHiddenStatusesOnSync ?? false,
		showEmptyColumns: profile.showEmptyColumns ?? true,
		includeSubIssues: profile.projectIncludeSubIssues ?? false,
	};
}
