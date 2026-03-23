import { NoticeManager } from "../notice-manager";
import {
	ProjectData,
	ProjectInfo,
	ProjectStatusOption,
	ProviderType,
} from "../types";

export type ProviderId = string;

/**
 * Common interface for all issue tracking providers (GitHub, GitLab, etc.)
 *
 * All providers normalize their API responses into a common format so that
 * the rest of the plugin (file managers, content generators, filters, etc.)
 * can work provider-agnostically.
 */
export interface IssueProvider {
	/** Unique instance identifier (e.g. "github", "gitlab", "gitlab-2") */
	readonly id: ProviderId;
	/** Provider type – "github" or "gitlab" */
	readonly type: ProviderType;
	readonly displayName: string;

	// --- Lifecycle ---

	/** (Re-)initialize the underlying HTTP client after token/settings change. */
	initializeClient(): void;

	/** Whether the client has a valid token and is ready to make requests. */
	isReady(): boolean;

	/** Clean up resources. */
	dispose(): void;

	// --- Authentication ---

	/** Validate the configured token. */
	validateToken(): Promise<{
		valid: boolean;
		scopes?: string[];
		user?: string;
	}>;

	/** Get rate limit information (if supported by the provider). */
	getRateLimit?(): Promise<{
		limit: number;
		remaining: number;
		reset: Date;
	} | null>;

	/** Fetch the currently authenticated user's login/username. */
	fetchAuthenticatedUser(): Promise<string>;

	/** Get the cached current user (set after fetchAuthenticatedUser). */
	getCurrentUser(): string;

	// --- Issues ---

	fetchRepositoryIssues(
		owner: string,
		repo: string,
		includeClosed: boolean,
		daysToKeepClosed: number,
		extra?: ProviderExtraParams,
	): Promise<any[]>;

	fetchIssueComments(
		owner: string,
		repo: string,
		issueNumber: number,
		extra?: ProviderExtraParams,
	): Promise<any[]>;

	// --- Pull Requests / Merge Requests ---

	fetchRepositoryPullRequests(
		owner: string,
		repo: string,
		includeClosed: boolean,
		daysToKeepClosed: number,
		extra?: ProviderExtraParams,
	): Promise<any[]>;

	fetchPullRequestComments(
		owner: string,
		repo: string,
		prNumber: number,
		extra?: ProviderExtraParams,
	): Promise<any[]>;

	// --- Metadata ---

	fetchRepositoryLabels(
		owner: string,
		repo: string,
		extra?: ProviderExtraParams,
	): Promise<any[]>;

	fetchRepositoryCollaborators(
		owner: string,
		repo: string,
		extra?: ProviderExtraParams,
	): Promise<any[]>;

	fetchAvailableRepositories(): Promise<
		{ owner: { login: string }; name: string; id?: number }[]
	>;

	// --- Optional capabilities ---

	/** Whether this provider supports GitHub Projects v2 style tracking. */
	supportsProjects(): boolean;

	/** Whether this provider supports sub-issues. */
	supportsSubIssues(): boolean;

	// Sub-issues (optional)
	fetchSubIssues?(
		owner: string,
		repo: string,
		issueNumber: number,
		extra?: ProviderExtraParams,
	): Promise<any[]>;

	fetchParentIssue?(
		owner: string,
		repo: string,
		issueNumber: number,
		extra?: ProviderExtraParams,
	): Promise<any | null>;

	// GitHub Projects v2 (optional)
	fetchProjectItems?(projectId: string): Promise<any[]>;
	fetchAllAvailableProjects?(): Promise<ProjectInfo[]>;
	fetchProjectsForRepository?(
		owner: string,
		repo: string,
	): Promise<ProjectInfo[]>;
	fetchProjectStatusOptions?(
		projectId: string,
	): Promise<ProjectStatusOption[]>;
	fetchProjectDataForItem?(nodeId: string): Promise<ProjectData[]>;
	fetchProjectDataForItems?(
		nodeIds: string[],
	): Promise<Map<string, ProjectData[]>>;
	hasProjectScope?(): Promise<boolean>;
}

/**
 * Provider-specific extra parameters that don't fit the common interface.
 * Each provider can read the fields it cares about and ignore the rest.
 */
export interface ProviderExtraParams {
	/** GitLab numeric project ID (avoids URL encoding issues). */
	gitlabProjectId?: number;
}
