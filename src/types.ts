export interface RepositoryTracking {
	repository: string;
	trackIssues: boolean;
	issueUpdateMode: "none" | "update" | "append";
	allowDeleteIssue: boolean;
	issueFolder: string;
	useCustomIssueFolder: boolean;
	customIssueFolder: string;
	issueNoteTemplate: string;
	issueContentTemplate: string;
	useCustomIssueContentTemplate: boolean;
	trackPullRequest: boolean;
	pullRequestFolder: string;
	useCustomPullRequestFolder: boolean;
	customPullRequestFolder: string;
	pullRequestNoteTemplate: string;
	pullRequestContentTemplate: string;
	useCustomPullRequestContentTemplate: boolean;
	pullRequestUpdateMode: "none" | "update" | "append";
	allowDeletePullRequest: boolean;
	enableLabelFilter: boolean;
	labelFilterMode: "include" | "exclude";
	labelFilters: string[];
	enablePrLabelFilter: boolean;
	prLabelFilterMode: "include" | "exclude";
	prLabelFilters: string[];
	enableAssigneeFilter: boolean;
	assigneeFilterMode: "assigned-to-me" | "assigned-to-specific" | "unassigned" | "any-assigned";
	assigneeFilters: string[];
	enablePrAssigneeFilter: boolean;
	prAssigneeFilterMode: "assigned-to-me" | "assigned-to-specific" | "unassigned" | "any-assigned";
	prAssigneeFilters: string[];
	includeIssueComments: boolean;
	includePullRequestComments: boolean;
}

export interface GitHubTrackerSettings {
	githubToken: string;
	repositories: RepositoryTracking[];
	dateFormat: string;
	syncOnStartup: boolean;
	syncNoticeMode: "minimal" | "normal" | "extensive" | "debug";
	syncInterval: number;
	escapeMode: "disabled" | "normal" | "strict" | "veryStrict";
	enableBackgroundSync: boolean;
	backgroundSyncInterval: number; // in minutes
	cleanupClosedIssuesDays: number;
}

export const DEFAULT_SETTINGS: GitHubTrackerSettings = {
	githubToken: "",
	repositories: [],
	dateFormat: "",
	syncOnStartup: true,
	syncNoticeMode: "normal",
	syncInterval: 0,
	escapeMode: "strict",
	enableBackgroundSync: false,
	backgroundSyncInterval: 30,
	cleanupClosedIssuesDays: 30,
};

// Default repository tracking settings
export const DEFAULT_REPOSITORY_TRACKING: RepositoryTracking = {
	repository: "",
	trackIssues: true,
	issueUpdateMode: "none",
	allowDeleteIssue: true,
	issueFolder: "GitHub",
	useCustomIssueFolder: false,
	customIssueFolder: "",
	issueNoteTemplate: "Issue - {number}",
	issueContentTemplate: "",
	useCustomIssueContentTemplate: false,
	trackPullRequest: false,
	pullRequestFolder: "GitHub Pull Requests",
	useCustomPullRequestFolder: false,
	customPullRequestFolder: "",
	pullRequestNoteTemplate: "PR - {number}",
	pullRequestContentTemplate: "",
	useCustomPullRequestContentTemplate: false,
	pullRequestUpdateMode: "none",
	allowDeletePullRequest: true,
	enableLabelFilter: false,
	labelFilterMode: "include",
	labelFilters: [],
	enablePrLabelFilter: false,
	prLabelFilterMode: "include",
	prLabelFilters: [],
	enableAssigneeFilter: false,
	assigneeFilterMode: "assigned-to-me",
	assigneeFilters: [],
	enablePrAssigneeFilter: false,
	prAssigneeFilterMode: "assigned-to-me",
	prAssigneeFilters: [],
	includeIssueComments: true,
	includePullRequestComments: true,
};
