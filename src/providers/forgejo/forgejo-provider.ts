import { requestUrl } from "obsidian";
import {
	IssueTrackerSettings,
	ProjectInfo,
	ProjectStatusOption,
	ProviderConfig,
	ProviderType,
} from "../../types";
import { NoticeManager } from "../../notice-manager";
import {
	IssueProvider,
	ProjectSourceRepository,
	ProviderId,
} from "../provider";
import {
	GitUser,
	Issue,
	IssueComment,
	Label,
	ProjectItem,
	PullRequest,
	RepositoryRef,
} from "../domain";

interface RawProject {
	id: number;
	title?: string;
	html_url?: string;
	is_closed?: boolean;
}

interface RawProjectColumn {
	id: number;
	title?: string;
	color?: string;
	sorting?: number;
}

export const FORGEJO_DEFAULT_URL = "https://codeberg.org";

/** Forgejo/Gitea cap page sizes server-side; 50 is the default maximum. */
const PAGE_LIMIT = 50;

// --- Raw Forgejo/Gitea REST shapes (only the fields this provider reads) ---

interface RawForgejoUser {
	login?: string;
	username?: string;
	avatar_url?: string;
	[key: string]: unknown;
}

interface RawForgejoLabel {
	name: string;
	color?: string;
	description?: string | null;
	[key: string]: unknown;
}

interface RawForgejoIssue {
	number: number;
	title?: string;
	body?: string | null;
	state?: string;
	user?: RawForgejoUser | null;
	assignee?: RawForgejoUser | null;
	assignees?: RawForgejoUser[] | null;
	labels?: RawForgejoLabel[] | null;
	created_at?: string;
	updated_at?: string;
	closed_at?: string | null;
	html_url?: string;
	pull_request?: unknown;
	[key: string]: unknown;
}

interface RawForgejoPullRequest extends RawForgejoIssue {
	merged?: boolean;
	merged_at?: string | null;
	mergeable?: boolean | null;
	draft?: boolean;
	requested_reviewers?: RawForgejoUser[] | null;
	head?: { ref?: string; [key: string]: unknown };
	base?: { ref?: string; [key: string]: unknown };
}

interface RawForgejoComment {
	id?: number;
	body?: string;
	user?: RawForgejoUser | null;
	created_at: string;
	updated_at?: string;
	[key: string]: unknown;
}

interface RawForgejoReview {
	id: number;
	body?: string;
	state?: string;
	user?: RawForgejoUser | null;
	submitted_at?: string;
	comments_count?: number;
	[key: string]: unknown;
}

interface RawForgejoReviewComment {
	id?: number;
	body?: string;
	path?: string;
	position?: number;
	original_position?: number;
	user?: RawForgejoUser | null;
	created_at: string;
	updated_at?: string;
	[key: string]: unknown;
}

interface RawForgejoRepository {
	id?: number;
	name: string;
	full_name?: string;
	owner?: RawForgejoUser;
	[key: string]: unknown;
}

interface RawForgejoOrg {
	username?: string;
	name?: string;
	[key: string]: unknown;
}

/**
 * Provider for Forgejo and Gitea instances (e.g. codeberg.org or self-hosted).
 * Both share the Gitea-compatible REST API under /api/v1. Read-only: the
 * provider only ever issues GET requests.
 */
export class ForgejoProvider implements IssueProvider {
	readonly id: ProviderId;
	readonly type: ProviderType = "forgejo";
	readonly displayName: string;

	private baseUrl: string;
	private currentUser: string = "";
	private tokenGetter: () => string;
	private configId: string;

	constructor(
		private settings: IssueTrackerSettings,
		private noticeManager: NoticeManager,
		tokenGetter: () => string,
		providerConfig: ProviderConfig,
	) {
		this.tokenGetter = tokenGetter;
		this.id = providerConfig.id;
		this.configId = providerConfig.id;
		this.displayName = providerConfig.label || "Forgejo";
		this.baseUrl = ForgejoProvider.normalizeBaseUrl(providerConfig.baseUrl);
	}

	private static normalizeBaseUrl(url?: string): string {
		return (url || FORGEJO_DEFAULT_URL).trim().replace(/\/+$/, "");
	}

	/** Gitea has a project API, Forgejo does not yet; checked on use. */
	supportsProjects(): boolean {
		return true;
	}

	supportsSubIssues(): boolean {
		return false;
	}

	public initializeClient(): void {
		const providerConfig = this.settings.providers?.find(
			(p) => p.id === this.configId,
		);
		this.baseUrl = ForgejoProvider.normalizeBaseUrl(
			providerConfig?.baseUrl,
		);
	}

	public isReady(): boolean {
		return !!this.tokenGetter();
	}

	public getCurrentUser(): string {
		return this.currentUser;
	}

	public dispose(): void {
		this.currentUser = "";
	}

	private apiUrl(path: string): string {
		return `${this.baseUrl}/api/v1${path}`;
	}

	private repoPath(owner: string, repo: string): string {
		return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
	}

	private authHeaders(): Record<string, string> {
		return {
			Authorization: `token ${this.tokenGetter()}`,
			Accept: "application/json",
		};
	}

	private async getJson<T>(path: string): Promise<T | null> {
		if (!this.tokenGetter()) return null;
		const response = await requestUrl({
			url: this.apiUrl(path),
			headers: this.authHeaders(),
			throw: false,
		});
		if (response.status < 200 || response.status >= 300) return null;
		return response.json as T;
	}

	/**
	 * Fetch all pages of a list endpoint. `stopWhen` lets callers end early
	 * once a page reaches items older than they need (lists sorted by update).
	 */
	private async fetchPaginated<T>(
		endpoint: string,
		params: Record<string, string> = {},
		stopWhen?: (item: T) => boolean,
	): Promise<T[]> {
		if (!this.tokenGetter()) return [];

		const allItems: T[] = [];
		let page = 1;

		for (;;) {
			const urlParams = new URLSearchParams({
				...params,
				limit: String(PAGE_LIMIT),
				page: String(page),
			});
			const response = await requestUrl({
				url: `${this.apiUrl(endpoint)}?${urlParams.toString()}`,
				headers: this.authHeaders(),
				throw: false,
			});

			if (response.status < 200 || response.status >= 300) {
				throw new Error(
					`${this.displayName} API error ${response.status} for ${endpoint}`,
				);
			}

			const data = (response.json ?? []) as T[];
			if (!Array.isArray(data) || data.length === 0) break;

			let stop = false;
			for (const item of data) {
				if (stopWhen?.(item)) {
					stop = true;
					break;
				}
				allItems.push(item);
			}

			const total = Number(response.headers["x-total-count"]);
			if (
				stop ||
				data.length < PAGE_LIMIT ||
				(Number.isFinite(total) && allItems.length >= total)
			) {
				break;
			}
			page++;
		}

		return allItems;
	}

	private static user(u?: RawForgejoUser | null): GitUser | null {
		if (!u) return null;
		return { ...u, login: u.login || u.username || "" };
	}

	private static users(list?: RawForgejoUser[] | null): GitUser[] {
		return (list ?? [])
			.map((u) => ForgejoProvider.user(u))
			.filter((u): u is GitUser => u !== null);
	}

	private static labels(list?: RawForgejoLabel[] | null): Label[] {
		return (list ?? []).map((l) => ({
			...l,
			color: l.color?.replace(/^#/, ""),
		}));
	}

	/**
	 * Projects of the given repositories ("owner/repo"). The project URL is
	 * the id, so it stays unique across repositories and servers.
	 */
	public async fetchAllAvailableProjects(
		repositories: ProjectSourceRepository[] = [],
	): Promise<ProjectInfo[]> {
		const projects: ProjectInfo[] = [];
		let supported = false;
		for (const { repository: full } of repositories) {
			const slash = full.lastIndexOf("/");
			if (slash <= 0) continue;
			const owner = full.slice(0, slash);
			const repo = full.slice(slash + 1);
			let list: RawProject[];
			try {
				list = await this.fetchPaginated<RawProject>(
					`${this.repoPath(owner, repo)}/projects`,
					{ state: "all" },
				);
			} catch (error) {
				if ((error as Error).message.includes("error 404")) continue;
				throw error;
			}
			supported = true;
			for (const project of list) {
				const url =
					project.html_url ||
					`${this.baseUrl}/${owner}/${repo}/projects/${project.id}`;
				projects.push({
					id: url,
					title: project.title || `Project ${project.id}`,
					number: project.id,
					url,
					closed: !!project.is_closed,
					owner,
					provider: this.id,
				});
			}
		}
		if (repositories.length > 0 && !supported) {
			throw new Error(
				`${this.displayName} has no project API (Forgejo does not offer one yet)`,
			);
		}
		return projects;
	}

	private static parseProjectUrl(
		projectId: string,
	): { owner: string; repo: string; id: number } | null {
		const match = projectId.match(
			/\/([^/]+)\/([^/]+)\/projects\/(\d+)\/?$/,
		);
		if (!match) return null;
		return {
			owner: decodeURIComponent(match[1]),
			repo: decodeURIComponent(match[2]),
			id: Number(match[3]),
		};
	}

	private async fetchProjectColumns(
		owner: string,
		repo: string,
		id: number,
	): Promise<RawProjectColumn[]> {
		const columns = await this.fetchPaginated<RawProjectColumn>(
			`${this.repoPath(owner, repo)}/projects/${id}/columns`,
		);
		return columns.sort(
			(a, b) => (a.sorting ?? 0) - (b.sorting ?? 0) || a.id - b.id,
		);
	}

	public async fetchProjectStatusOptions(
		projectId: string,
	): Promise<ProjectStatusOption[]> {
		const ref = ForgejoProvider.parseProjectUrl(projectId);
		if (!ref) return [];
		const columns = await this.fetchProjectColumns(
			ref.owner,
			ref.repo,
			ref.id,
		);
		return columns.map((column) => ({
			id: String(column.id),
			name: column.title || `Column ${column.id}`,
			color: column.color || undefined,
		}));
	}

	/**
	 * Items of a project in the shape the project sync and the Kanban view
	 * read: the column becomes the "Status" field.
	 */
	public async fetchProjectItems(projectId: string): Promise<ProjectItem[]> {
		const ref = ForgejoProvider.parseProjectUrl(projectId);
		if (!ref) return [];
		const base = `${this.repoPath(ref.owner, ref.repo)}/projects/${ref.id}`;
		const columns = await this.fetchProjectColumns(
			ref.owner,
			ref.repo,
			ref.id,
		);
		const items: ProjectItem[] = [];
		for (const column of columns) {
			const issues = await this.fetchPaginated<RawForgejoIssue>(
				`${base}/columns/${column.id}/issues`,
			);
			for (const issue of issues) {
				const normalized = this.normalizeIssue(issue);
				items.push({
					id: `${ref.id}-${issue.number}`,
					content: {
						number: issue.number,
						title: issue.title ?? "",
						body: issue.body ?? "",
						url: issue.html_url,
						state: issue.state ?? "open",
						author: { login: normalized.user?.login ?? "" },
						createdAt: issue.created_at,
						updatedAt: issue.updated_at,
						closedAt: issue.closed_at ?? null,
						assignees: {
							nodes: (normalized.assignees ?? []).map((u) => ({
								login: u.login,
							})),
						},
						labels: {
							nodes: (normalized.labels ?? []).map((l) => ({
								name: l.name,
								color: l.color,
							})),
						},
						repository: `${ref.owner}/${ref.repo}`,
					},
					fieldValues: {
						nodes: [
							{
								field: { name: "Status" },
								name: column.title || `Column ${column.id}`,
							},
						],
					},
				});
			}
		}
		return items;
	}

	private normalizeIssue(issue: RawForgejoIssue): Issue {
		return {
			...issue,
			user: ForgejoProvider.user(issue.user),
			assignee: ForgejoProvider.user(issue.assignee),
			assignees: ForgejoProvider.users(issue.assignees),
			labels: ForgejoProvider.labels(issue.labels),
		};
	}

	private normalizePullRequest(pr: RawForgejoPullRequest): PullRequest {
		const title = pr.title ?? "";
		return {
			...this.normalizeIssue(pr),
			merged: pr.merged ?? !!pr.merged_at,
			merged_at: pr.merged_at ?? null,
			mergeable: pr.mergeable ?? null,
			draft: pr.draft ?? /^\s*(\[WIP\]|WIP:)/i.test(title),
			requested_reviewers: ForgejoProvider.users(pr.requested_reviewers),
			head: pr.head,
			base: pr.base,
		};
	}

	private static cutoff(daysToKeepClosed: number): Date {
		const date = new Date();
		date.setDate(date.getDate() - daysToKeepClosed);
		return date;
	}

	// --- Authentication ---

	public async validateToken(): Promise<{ valid: boolean; user?: string }> {
		try {
			const user = await this.getJson<RawForgejoUser>("/user");
			if (!user) return { valid: false };
			return { valid: true, user: user.login || user.username };
		} catch {
			return { valid: false };
		}
	}

	public async fetchAuthenticatedUser(): Promise<string> {
		try {
			const user = await this.getJson<RawForgejoUser>("/user");
			this.currentUser = user?.login || user?.username || "";
			return this.currentUser;
		} catch (error) {
			this.noticeManager.error(
				"Error fetching authenticated user",
				error,
			);
			return "";
		}
	}

	// --- Issues ---

	public async fetchRepositoryIssues(
		owner: string,
		repo: string,
		includeClosed: boolean = false,
		daysToKeepClosed: number = 30,
	): Promise<Issue[]> {
		const path = `${this.repoPath(owner, repo)}/issues`;
		try {
			const open = await this.fetchPaginated<RawForgejoIssue>(path, {
				state: "open",
				type: "issues",
			});
			let items = open;

			if (includeClosed) {
				const cutoff = ForgejoProvider.cutoff(daysToKeepClosed);
				const closed = await this.fetchPaginated<RawForgejoIssue>(
					path,
					{
						state: "closed",
						type: "issues",
						since: cutoff.toISOString(),
					},
				);
				items = open.concat(
					closed.filter(
						(i) => !!i.closed_at && new Date(i.closed_at) > cutoff,
					),
				);
			}

			this.noticeManager.debug(
				`Fetched ${items.length} issues for ${owner}/${repo}`,
			);
			return items
				.filter((i) => !i.pull_request)
				.map((i) => this.normalizeIssue(i));
		} catch (error) {
			this.noticeManager.error(
				`Error fetching issues for ${owner}/${repo}`,
				error,
			);
			return [];
		}
	}

	public async fetchIssueComments(
		owner: string,
		repo: string,
		issueNumber: number,
	): Promise<IssueComment[]> {
		try {
			const comments = await this.fetchPaginated<RawForgejoComment>(
				`${this.repoPath(owner, repo)}/issues/${issueNumber}/comments`,
			);
			return comments.map((c) => ({
				...c,
				user: ForgejoProvider.user(c.user),
			}));
		} catch (error) {
			this.noticeManager.error(
				`Error fetching comments for #${issueNumber}`,
				error,
			);
			return [];
		}
	}

	// --- Pull Requests ---

	public async fetchRepositoryPullRequests(
		owner: string,
		repo: string,
		includeClosed: boolean = false,
		daysToKeepClosed: number = 30,
	): Promise<PullRequest[]> {
		const path = `${this.repoPath(owner, repo)}/pulls`;
		try {
			const open = await this.fetchPaginated<RawForgejoPullRequest>(
				path,
				{
					state: "open",
				},
			);
			let items = open;

			if (includeClosed) {
				const cutoff = ForgejoProvider.cutoff(daysToKeepClosed);
				const closed = await this.fetchPaginated<RawForgejoPullRequest>(
					path,
					{ state: "closed", sort: "recentupdate" },
					(pr) => !!pr.updated_at && new Date(pr.updated_at) < cutoff,
				);
				items = open.concat(
					closed.filter((pr) => {
						const closedAt = pr.closed_at || pr.merged_at;
						return !!closedAt && new Date(closedAt) > cutoff;
					}),
				);
			}

			this.noticeManager.debug(
				`Fetched ${items.length} pull requests for ${owner}/${repo}`,
			);
			return items.map((pr) => this.normalizePullRequest(pr));
		} catch (error) {
			this.noticeManager.error(
				`Error fetching pull requests for ${owner}/${repo}`,
				error,
			);
			return [];
		}
	}

	public async fetchPullRequestComments(
		owner: string,
		repo: string,
		prNumber: number,
	): Promise<IssueComment[]> {
		const conversation = await this.fetchIssueComments(
			owner,
			repo,
			prNumber,
		);
		const reviewComments: IssueComment[] = [];

		try {
			const base = `${this.repoPath(owner, repo)}/pulls/${prNumber}/reviews`;
			const reviews = await this.fetchPaginated<RawForgejoReview>(base);

			for (const review of reviews) {
				if (review.body?.trim() && review.submitted_at) {
					reviewComments.push({
						id: review.id,
						body: review.body,
						user: ForgejoProvider.user(review.user),
						created_at: review.submitted_at,
					});
				}
				if (!review.comments_count) continue;

				const comments =
					(await this.getJson<RawForgejoReviewComment[]>(
						`${base}/${review.id}/comments`,
					)) ?? [];
				for (const c of comments) {
					reviewComments.push({
						id: c.id,
						body: c.body,
						user: ForgejoProvider.user(c.user),
						created_at: c.created_at,
						updated_at: c.updated_at,
						path: c.path,
						line: c.position || c.original_position || null,
						is_review_comment: true,
					});
				}
			}
		} catch (error) {
			this.noticeManager.debug(
				`Could not fetch reviews for PR #${prNumber}: ${error}`,
			);
		}

		return conversation
			.concat(reviewComments)
			.sort(
				(a, b) =>
					new Date(a.created_at).getTime() -
					new Date(b.created_at).getTime(),
			);
	}

	// --- Metadata ---

	public async fetchRepositoryLabels(
		owner: string,
		repo: string,
	): Promise<Label[]> {
		try {
			const labels = await this.fetchPaginated<RawForgejoLabel>(
				`${this.repoPath(owner, repo)}/labels`,
			);
			return ForgejoProvider.labels(labels);
		} catch (error) {
			this.noticeManager.error(
				`Error fetching labels for ${owner}/${repo}`,
				error,
			);
			return [];
		}
	}

	/**
	 * Assignees cover everyone who can be assigned, including the owner, and
	 * work with read-only tokens. Collaborators (push access needed) are the
	 * fallback for servers that do not offer the assignees endpoint.
	 */
	public async fetchRepositoryCollaborators(
		owner: string,
		repo: string,
	): Promise<GitUser[]> {
		const base = this.repoPath(owner, repo);
		try {
			const users = await this.getJson<RawForgejoUser[]>(
				`${base}/assignees`,
			);
			if (users) return ForgejoProvider.users(users);
			return ForgejoProvider.users(
				await this.fetchPaginated<RawForgejoUser>(
					`${base}/collaborators`,
				),
			);
		} catch (error) {
			this.noticeManager.error(
				`Error fetching collaborators for ${owner}/${repo}`,
				error,
			);
			return [];
		}
	}

	/** Repositories the user owns or collaborates on, plus those of their orgs. */
	public async fetchAvailableRepositories(): Promise<RepositoryRef[]> {
		const byName = new Map<string, RepositoryRef>();
		const add = (r: RawForgejoRepository) => {
			const owner = r.owner?.login || r.owner?.username || "";
			const fullName = r.full_name || `${owner}/${r.name}`;
			if (!owner || byName.has(fullName)) return;
			byName.set(fullName, {
				owner: { login: owner },
				name: r.name,
				id: r.id,
			});
		};

		try {
			(
				await this.fetchPaginated<RawForgejoRepository>("/user/repos")
			).forEach(add);
		} catch (error) {
			this.noticeManager.error("Error fetching repositories", error);
			return [];
		}

		try {
			const orgs = await this.fetchPaginated<RawForgejoOrg>("/user/orgs");
			for (const org of orgs) {
				const name = org.username || org.name;
				if (!name) continue;
				(
					await this.fetchPaginated<RawForgejoRepository>(
						`/orgs/${encodeURIComponent(name)}/repos`,
					)
				).forEach(add);
			}
		} catch (error) {
			this.noticeManager.debug(
				`Skipping organization repositories (token needs read:organization): ${error}`,
			);
		}

		return Array.from(byName.values());
	}
}
