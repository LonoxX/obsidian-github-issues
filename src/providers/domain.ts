/**
 * Normalized domain model shared by all providers (GitHub, GitLab, ...).
 *
 * Providers either return their raw API objects (GitHub/octokit) or map their
 * responses into these shapes (GitLab). The fields here are the ones the rest
 * of the plugin actually reads. An index signature is kept on the object types
 * so provider-specific extra fields pass through without widening to `any`.
 */

export interface GitUser {
	login: string;
	[key: string]: unknown;
}

export interface Label {
	name: string;
	color?: string;
	description?: string | null;
	[key: string]: unknown;
}

export interface Milestone {
	title?: string;
	name?: string;
	[key: string]: unknown;
}

export interface IssueComment {
	body?: string | null;
	created_at: string;
	user?: GitUser | null;
	is_review_comment?: boolean;
	line?: number | null;
	path?: string;
	[key: string]: unknown;
}

/** A normalized issue. GitHub returns octokit objects that satisfy this shape. */
export interface Issue {
	number: number;
	title?: string;
	state?: string;
	body?: string | null;
	user?: GitUser | null;
	assignee?: GitUser | null;
	assignees?: GitUser[] | null;
	labels?: Label[];
	milestone?: Milestone | null;
	created_at?: string;
	updated_at?: string;
	closed_at?: string | null;
	html_url?: string;
	url?: string;
	comments?: number;
	locked?: boolean;
	active_lock_reason?: string | null;
	/** Set by the plugin when a vault file already exists for this item. */
	vaultPath?: string;
	/** Present on issues returned together with PRs; used to filter PRs out. */
	pull_request?: unknown;
	[key: string]: unknown;
}

/** A normalized pull request / merge request. */
export interface PullRequest extends Issue {
	merged_at?: string | null;
	mergeable?: boolean | null;
	merged?: boolean;
	draft?: boolean;
	base?: { ref?: string; [key: string]: unknown };
	head?: { ref?: string; [key: string]: unknown };
}

/** Minimal repository descriptor used for the "available repositories" picker. */
export interface RepositoryRef {
	owner: { login: string };
	name: string;
	id?: number;
}

// --- GitHub Projects v2 (GraphQL) item shapes ---

export interface ProjectFieldValueNode {
	field?: { name?: string };
	text?: string;
	name?: string;
	date?: string;
	number?: number;
	title?: string;
	startDate?: string;
	duration?: number;
	users?: { nodes?: Array<{ login?: string }> };
	labels?: { nodes?: Array<{ name?: string }> };
	[key: string]: unknown;
}

export interface ProjectItemContent {
	number?: number;
	title?: string;
	body?: string | null;
	url?: string;
	state?: string;
	author?: { login?: string } | null;
	labels?: { nodes?: Array<{ name?: string; color?: string }> };
	[key: string]: unknown;
}

export interface ProjectItem {
	id?: string;
	content?: ProjectItemContent | null;
	fieldValues?: { nodes?: ProjectFieldValueNode[] };
	[key: string]: unknown;
}
