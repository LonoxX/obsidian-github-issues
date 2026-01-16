import { RepositoryTracking, GlobalDefaults } from "../types";

/**
 * Merges global defaults with repository-specific settings
 * @param repo Repository tracking settings
 * @param globalDefaults Global default settings
 * @returns Effective repository settings with global defaults applied (if not ignored)
 */
export function getEffectiveRepoSettings(
	repo: RepositoryTracking,
	globalDefaults: GlobalDefaults
): RepositoryTracking {
	// If repository ignores global settings, return as-is
	if (repo.ignoreGlobalSettings) {
		return repo;
	}

	// Create a copy and apply global defaults
	return {
		...repo,
		issueUpdateMode: globalDefaults.issueUpdateMode,
		allowDeleteIssue: globalDefaults.allowDeleteIssue,
		issueFolder: repo.useCustomIssueFolder ? repo.customIssueFolder : globalDefaults.issueFolder,
		issueNoteTemplate: globalDefaults.issueNoteTemplate,
		issueContentTemplate: (repo.useCustomIssueContentTemplate && repo.issueContentTemplate) ? repo.issueContentTemplate : globalDefaults.issueContentTemplate,
		useCustomIssueContentTemplate: (repo.useCustomIssueContentTemplate && repo.issueContentTemplate) ? repo.useCustomIssueContentTemplate : globalDefaults.useCustomIssueContentTemplate,
		includeIssueComments: globalDefaults.includeIssueComments,
		pullRequestUpdateMode: globalDefaults.pullRequestUpdateMode,
		allowDeletePullRequest: globalDefaults.allowDeletePullRequest,
		pullRequestFolder: repo.useCustomPullRequestFolder ? repo.customPullRequestFolder : globalDefaults.pullRequestFolder,
		pullRequestNoteTemplate: globalDefaults.pullRequestNoteTemplate,
		pullRequestContentTemplate: (repo.useCustomPullRequestContentTemplate && repo.pullRequestContentTemplate) ? repo.pullRequestContentTemplate : globalDefaults.pullRequestContentTemplate,
		useCustomPullRequestContentTemplate: (repo.useCustomPullRequestContentTemplate && repo.pullRequestContentTemplate) ? repo.useCustomPullRequestContentTemplate : globalDefaults.useCustomPullRequestContentTemplate,
		includePullRequestComments: globalDefaults.includePullRequestComments,
	};
}
