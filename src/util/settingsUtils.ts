import { RepositoryTracking, GitHubTrackerSettings, SettingsProfile, TrackedProject, DEFAULT_REPOSITORY_PROFILE, DEFAULT_PROJECT_PROFILE } from "../types";

/**
 * Find a profile by ID from the settings
 */
export function getProfileById(
	settings: GitHubTrackerSettings,
	profileId: string
): SettingsProfile | undefined {
	return settings.profiles.find(p => p.id === profileId);
}

/**
 * Get all repository-type profiles
 */
export function getRepositoryProfiles(settings: GitHubTrackerSettings): SettingsProfile[] {
	return settings.profiles.filter(p => p.type === "repository");
}

/**
 * Get all project-type profiles
 */
export function getProjectProfiles(settings: GitHubTrackerSettings): SettingsProfile[] {
	return settings.profiles.filter(p => p.type === "project");
}

/**
 * Apply profile settings to a repository. All configurable settings come from
 * the profile exclusively — per-repo overrides are no longer used.
 */
export function getEffectiveRepoSettings(
	repo: RepositoryTracking,
	settings: GitHubTrackerSettings
): RepositoryTracking {
	const profile = getProfileById(settings, repo.profileId);

	// If no profile found (orphaned reference), use default profile values
	if (!profile || profile.type !== "repository") {
		const defaultProfile = getProfileById(settings, "default") ?? DEFAULT_REPOSITORY_PROFILE;
		return applyProfileToRepo(repo, defaultProfile);
	}

	return applyProfileToRepo(repo, profile);
}

/**
 * Apply a profile's settings to a repository.
 * Profile values are used directly — no per-repo overrides.
 */
function applyProfileToRepo(repo: RepositoryTracking, profile: SettingsProfile): RepositoryTracking {
	return {
		...repo,
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
		pullRequestNoteTemplate: profile.pullRequestNoteTemplate ?? "PR - {number}",
		pullRequestContentTemplate: profile.pullRequestContentTemplate ?? "",
		useCustomPullRequestContentTemplate: !!profile.pullRequestContentTemplate,
		includePullRequestComments: profile.includePullRequestComments ?? true,
		includeClosedPullRequests: profile.includeClosedPullRequests ?? false,
	};
}

/**
 * Effective project settings: merges profile defaults onto TrackedProject.
 * All configurable settings (folders, templates, sync toggles) come from
 * the profile — per-project overrides are no longer used.
 */
export function getEffectiveProjectSettings(
	project: TrackedProject,
	settings: GitHubTrackerSettings
): TrackedProject {
	const profile = getProfileById(settings, project.profileId ?? "default-project");

	if (!profile || profile.type !== "project") {
		const defaultProfile = getProfileById(settings, "default-project") ?? DEFAULT_PROJECT_PROFILE;
		return applyProfileToProject(project, defaultProfile);
	}

	return applyProfileToProject(project, profile);
}

/**
 * Apply a project profile's settings to a tracked project.
 * Profile values are used directly — no per-project overrides.
 */
function applyProfileToProject(project: TrackedProject, profile: SettingsProfile): TrackedProject {
	return {
		...project,
		issueFolder: profile.projectIssueFolder ?? "GitHub/{project}",
		pullRequestFolder: profile.projectPullRequestFolder ?? "GitHub/{project}",
		issueNoteTemplate: profile.projectIssueNoteTemplate ?? "Issue - {number}",
		pullRequestNoteTemplate: profile.projectPullRequestNoteTemplate ?? "PR - {number}",
		useCustomIssueContentTemplate: !!profile.projectIssueContentTemplate,
		issueContentTemplate: profile.projectIssueContentTemplate ?? "",
		useCustomPullRequestContentTemplate: !!profile.projectPullRequestContentTemplate,
		pullRequestContentTemplate: profile.projectPullRequestContentTemplate ?? "",
		skipHiddenStatusesOnSync: profile.skipHiddenStatusesOnSync ?? false,
		showEmptyColumns: profile.showEmptyColumns ?? true,
		includeSubIssues: profile.projectIncludeSubIssues ?? false,
	};
}
