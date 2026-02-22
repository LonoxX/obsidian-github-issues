// Profile types
export type ProfileType = "repository" | "project";

export interface SettingsProfile {
	id: string;
	name: string;
	type: ProfileType;

	// Repository-type profile fields
	issueUpdateMode?: "none" | "update" | "append";
	allowDeleteIssue?: boolean;
	issueFolder?: string;
	issueNoteTemplate?: string;
	issueContentTemplate?: string;
	useCustomIssueContentTemplate?: boolean;
	includeIssueComments?: boolean;
	pullRequestUpdateMode?: "none" | "update" | "append";
	allowDeletePullRequest?: boolean;
	pullRequestFolder?: string;
	pullRequestNoteTemplate?: string;
	pullRequestContentTemplate?: string;
	useCustomPullRequestContentTemplate?: boolean;
	includePullRequestComments?: boolean;
	includeClosedIssues?: boolean;
	includeClosedPullRequests?: boolean;
	trackIssues?: boolean;
	trackPullRequest?: boolean;
	includeSubIssues?: boolean;

	// Issue filter defaults (undefined = not set in this profile)
	enableLabelFilter?: boolean;
	labelFilterMode?: "include" | "exclude";
	labelFilters?: string[];
	enableAssigneeFilter?: boolean;
	assigneeFilterModes?: Array<
		| "assigned-to-me"
		| "assigned-to-specific"
		| "unassigned"
		| "any-assigned"
	>;
	assigneeFilters?: string[];

	// PR filter defaults (undefined = not set in this profile)
	enablePrLabelFilter?: boolean;
	prLabelFilterMode?: "include" | "exclude";
	prLabelFilters?: string[];
	enablePrAssigneeFilter?: boolean;
	prAssigneeFilterModes?: Array<
		| "assigned-to-me"
		| "assigned-to-specific"
		| "unassigned"
		| "any-assigned"
	>;
	prAssigneeFilters?: string[];
	enablePrReviewerFilter?: boolean;
	prReviewerFilterModes?: Array<
		| "review-requested-from-me"
		| "review-requested-from-specific"
		| "no-review-requested"
		| "any-review-requested"
	>;
	prReviewerFilters?: string[];

	// Project-type profile fields
	projectIssueFolder?: string;
	projectPullRequestFolder?: string;
	projectIssueNoteTemplate?: string;
	projectPullRequestNoteTemplate?: string;
	projectUseCustomIssueContentTemplate?: boolean;
	projectIssueContentTemplate?: string;
	projectUseCustomPullRequestContentTemplate?: boolean;
	projectPullRequestContentTemplate?: string;
	skipHiddenStatusesOnSync?: boolean;
	showEmptyColumns?: boolean;
	projectIncludeSubIssues?: boolean;
}

export interface RepositoryTracking {
	repository: string;
	profileId: string; // ID of the SettingsProfile to use
	ignoreGlobalSettings?: boolean; // @deprecated - kept for migration only
	trackIssues?: boolean;
	trackPullRequest?: boolean;
	useCustomIssueFolder: boolean;
	customIssueFolder: string;
	useCustomPullRequestFolder: boolean;
	customPullRequestFolder: string;
	enableLabelFilter: boolean;
	labelFilterMode: "include" | "exclude";
	labelFilters: string[];
	enablePrLabelFilter: boolean;
	prLabelFilterMode: "include" | "exclude";
	prLabelFilters: string[];
	enableAssigneeFilter: boolean;
	/** @deprecated Use assigneeFilterModes instead */
	assigneeFilterMode?:
		| "assigned-to-me"
		| "assigned-to-specific"
		| "unassigned"
		| "any-assigned";
	assigneeFilterModes: Array<
		| "assigned-to-me"
		| "assigned-to-specific"
		| "unassigned"
		| "any-assigned"
	>;
	assigneeFilters: string[];
	enablePrAssigneeFilter: boolean;
	/** @deprecated Use prAssigneeFilterModes instead */
	prAssigneeFilterMode?:
		| "assigned-to-me"
		| "assigned-to-specific"
		| "unassigned"
		| "any-assigned";
	prAssigneeFilterModes: Array<
		| "assigned-to-me"
		| "assigned-to-specific"
		| "unassigned"
		| "any-assigned"
	>;
	prAssigneeFilters: string[];
	enablePrReviewerFilter: boolean;
	/** @deprecated Use prReviewerFilterModes instead */
	prReviewerFilterMode?:
		| "review-requested-from-me"
		| "review-requested-from-specific"
		| "no-review-requested"
		| "any-review-requested";
	prReviewerFilterModes: Array<
		| "review-requested-from-me"
		| "review-requested-from-specific"
		| "no-review-requested"
		| "any-review-requested"
	>;
	prReviewerFilters: string[];
	escapeHashTags: boolean;
	overrideIssueFilters?: boolean;
	overridePrFilters?: boolean;

	// Profile-managed fields (optional - hydrated from profile at runtime)
	issueUpdateMode?: "none" | "update" | "append";
	allowDeleteIssue?: boolean;
	issueFolder?: string;
	issueNoteTemplate?: string;
	issueContentTemplate?: string;
	useCustomIssueContentTemplate?: boolean;
	includeIssueComments?: boolean;
	includeClosedIssues?: boolean;
	includeSubIssues?: boolean;
	pullRequestUpdateMode?: "none" | "update" | "append";
	allowDeletePullRequest?: boolean;
	pullRequestFolder?: string;
	pullRequestNoteTemplate?: string;
	pullRequestContentTemplate?: string;
	useCustomPullRequestContentTemplate?: boolean;
	includePullRequestComments?: boolean;
	includeClosedPullRequests?: boolean;
}

// Basic project info for selection UI
export interface ProjectInfo {
	id: string;
	title: string;
	number: number;
	url: string;
	closed: boolean;
	owner?: string; // Owner (user or org) of the project
}

// Status option from GitHub Projects
export interface ProjectStatusOption {
	id: string;
	name: string;
	color?: string;
	description?: string;
}

export interface TrackedProject {
	id: string;
	title: string;
	number: number;
	url: string;
	owner: string;
	enabled: boolean;
	profileId?: string; // ID of a "project" type SettingsProfile
	issueFolder?: string;
	useCustomIssueFolder?: boolean;
	customIssueFolder?: string;
	pullRequestFolder?: string;
	useCustomPullRequestFolder?: boolean;
	customPullRequestFolder?: string;
	issueNoteTemplate?: string;
	pullRequestNoteTemplate?: string;
	useCustomIssueContentTemplate?: boolean;
	issueContentTemplate?: string;
	useCustomPullRequestContentTemplate?: boolean;
	pullRequestContentTemplate?: string;
	statusOptions?: ProjectStatusOption[];
	customStatusOrder?: string[];
	useCustomStatusOrder?: boolean;
	showEmptyColumns?: boolean;
	hiddenStatuses?: string[];
	skipHiddenStatusesOnSync?: boolean;
	includeSubIssues?: boolean;
}

// GitHub Projects v2 types
export interface ProjectFieldValue {
	fieldName: string;
	type:
		| "text"
		| "number"
		| "date"
		| "single_select"
		| "iteration"
		| "user"
		| "labels";
	value: string | number | null;
	startDate?: string;
	duration?: number;
	users?: string[];
	labels?: string[];
}

export interface ProjectData {
	projectId: string;
	projectTitle: string;
	projectNumber: number;
	projectUrl: string;
	status?: string;
	priority?: string;
	iteration?: {
		title: string;
		startDate: string;
		duration: number;
	};
	customFields: Record<string, ProjectFieldValue>;
}

export interface IssueWithProjectData {
	issue: any;
	projectData: ProjectData[];
}

export interface PullRequestWithProjectData {
	pullRequest: any;
	projectData: ProjectData[];
}

export interface GlobalDefaults {
	issueUpdateMode: "none" | "update" | "append";
	allowDeleteIssue: boolean;
	issueFolder: string;
	issueNoteTemplate: string;
	issueContentTemplate: string;
	useCustomIssueContentTemplate: boolean;
	includeIssueComments: boolean;
	pullRequestUpdateMode: "none" | "update" | "append";
	allowDeletePullRequest: boolean;
	pullRequestFolder: string;
	pullRequestNoteTemplate: string;
	pullRequestContentTemplate: string;
	useCustomPullRequestContentTemplate: boolean;
	includePullRequestComments: boolean;
	includeClosedIssues: boolean;
	includeClosedPullRequests: boolean;
}

export interface GitHubTrackerSettings {
	githubToken: string;
	useSecretStorage: boolean;
	secretTokenName: string;
	repositories: RepositoryTracking[];
	dateFormat: string;
	syncOnStartup: boolean;
	syncNoticeMode: "minimal" | "normal" | "extensive" | "debug";
	syncInterval: number;
	escapeMode: "disabled" | "normal" | "strict" | "veryStrict";
	escapeHashTags: boolean;
	enableBackgroundSync: boolean;
	backgroundSyncInterval: number; // in minutes
	cleanupClosedIssuesDays: number;
	globalDefaults: GlobalDefaults;
	profiles: SettingsProfile[];
	enableProjectTracking: boolean;
	trackedProjects: TrackedProject[];
}

export const DEFAULT_GLOBAL_DEFAULTS: GlobalDefaults = {
	issueUpdateMode: "none",
	allowDeleteIssue: true,
	issueFolder: "GitHub",
	issueNoteTemplate: "Issue - {number}",
	issueContentTemplate: "",
	useCustomIssueContentTemplate: false,
	includeIssueComments: true,
	pullRequestUpdateMode: "none",
	allowDeletePullRequest: true,
	pullRequestFolder: "GitHub Pull Requests",
	pullRequestNoteTemplate: "PR - {number}",
	pullRequestContentTemplate: "",
	useCustomPullRequestContentTemplate: false,
	includePullRequestComments: true,
	includeClosedIssues: false,
	includeClosedPullRequests: false,
};

export const DEFAULT_REPOSITORY_PROFILE: SettingsProfile = {
	id: "default",
	name: "Default Profile",
	type: "repository",
	issueUpdateMode: "none",
	allowDeleteIssue: true,
	issueFolder: "GitHub",
	issueNoteTemplate: "Issue - {number}",
	issueContentTemplate: "",
	useCustomIssueContentTemplate: false,
	includeIssueComments: true,
	pullRequestUpdateMode: "none",
	allowDeletePullRequest: true,
	pullRequestFolder: "GitHub Pull Requests",
	pullRequestNoteTemplate: "PR - {number}",
	pullRequestContentTemplate: "",
	useCustomPullRequestContentTemplate: false,
	includePullRequestComments: true,
	includeClosedIssues: false,
	trackIssues: true,
	trackPullRequest: false,
	includeClosedPullRequests: false,
	includeSubIssues: false,
};

export const DEFAULT_PROJECT_PROFILE: SettingsProfile = {
	id: "default-project",
	name: "Default Project Profile",
	type: "project",
	projectIssueFolder: "GitHub/{project}",
	projectPullRequestFolder: "GitHub/{project}",
	projectIssueNoteTemplate: "Issue - {number}",
	projectPullRequestNoteTemplate: "PR - {number}",
	projectUseCustomIssueContentTemplate: false,
	projectIssueContentTemplate: "",
	projectUseCustomPullRequestContentTemplate: false,
	projectPullRequestContentTemplate: "",
	skipHiddenStatusesOnSync: false,
	showEmptyColumns: true,
	projectIncludeSubIssues: false,
};

export const DEFAULT_SETTINGS: GitHubTrackerSettings = {
	githubToken: "",
	useSecretStorage: false,
	secretTokenName: "",
	repositories: [],
	dateFormat: "",
	syncOnStartup: true,
	syncNoticeMode: "normal",
	syncInterval: 0,
	escapeMode: "strict",
	escapeHashTags: false,
	enableBackgroundSync: false,
	backgroundSyncInterval: 30,
	cleanupClosedIssuesDays: 30,
	globalDefaults: DEFAULT_GLOBAL_DEFAULTS,
	profiles: [
		{ ...DEFAULT_REPOSITORY_PROFILE },
		{ ...DEFAULT_PROJECT_PROFILE },
	],
	enableProjectTracking: true,
	trackedProjects: [],
};

// Default repository tracking settings (repo-specific fields only; profile fields come from the profile)
export const DEFAULT_REPOSITORY_TRACKING: RepositoryTracking = {
	repository: "",
	profileId: "default",
	useCustomIssueFolder: false,
	customIssueFolder: "",
	useCustomPullRequestFolder: false,
	customPullRequestFolder: "",
	enableLabelFilter: false,
	labelFilterMode: "include",
	labelFilters: [],
	enablePrLabelFilter: false,
	prLabelFilterMode: "include",
	prLabelFilters: [],
	enableAssigneeFilter: false,
	assigneeFilterModes: [],
	assigneeFilters: [],
	enablePrAssigneeFilter: false,
	prAssigneeFilterModes: [],
	prAssigneeFilters: [],
	enablePrReviewerFilter: false,
	prReviewerFilterModes: [],
	prReviewerFilters: [],
	escapeHashTags: false,
};
