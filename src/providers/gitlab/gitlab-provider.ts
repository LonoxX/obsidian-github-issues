import { requestUrl } from "obsidian";
import {
	IssueTrackerSettings,
	ProviderConfig,
	ProviderType,
} from "../../types";
import { NoticeManager } from "../../notice-manager";
import { IssueProvider, ProviderId, ProviderExtraParams } from "../provider";

export class GitLabProvider implements IssueProvider {
	readonly id: ProviderId;
	readonly type: ProviderType = "gitlab";
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
		this.displayName = providerConfig.label || "GitLab";
		this.baseUrl = (providerConfig.baseUrl || "https://gitlab.com").replace(
			/\/$/,
			"",
		);
	}

	supportsProjects(): boolean {
		return false;
	}
	supportsSubIssues(): boolean {
		return true;
	}

	/**
	 * Re-initialize client (after settings change)
	 */
	public initializeClient(): void {
		const providerConfig = this.settings.providers?.find(
			(p) => p.id === this.configId,
		);
		this.baseUrl = (
			providerConfig?.baseUrl || "https://gitlab.com"
		).replace(/\/$/, "");
	}

	/**
	 * Check if the client is ready to use
	 */
	public isReady(): boolean {
		return !!this.tokenGetter();
	}

	/**
	 * Get the currently cached authenticated user
	 */
	public getCurrentUser(): string {
		return this.currentUser;
	}

	/**
	 * Build API URL
	 */
	private apiUrl(path: string): string {
		return `${this.baseUrl}/api/v4${path}`;
	}

	/**
	 * Auth headers
	 */
	private authHeaders(): Record<string, string> {
		const token = this.tokenGetter();
		return {
			"PRIVATE-TOKEN": token,
			"Content-Type": "application/json",
		};
	}

	/**
	 * Return numeric project ID (avoids %2F path encoding issues with nginx proxied
	 * self-hosted GitLab instances) or fall back to URL-encoded path.
	 */
	private projectApiId(owner: string, repo: string, id?: number): string {
		return id !== undefined
			? String(id)
			: encodeURIComponent(`${owner}/${repo}`);
	}

	/**
	 * Fetch with pagination support (X-Next-Page header based)
	 */
	private async fetchPaginated<T>(
		endpoint: string,
		params: Record<string, string> = {},
	): Promise<T[]> {
		const token = this.tokenGetter();
		if (!token) return [];

		let allItems: T[] = [];
		let page = 1;
		let hasMorePages = true;

		while (hasMorePages) {
			const urlParams = new URLSearchParams({
				...params,
				per_page: "100",
				page: page.toString(),
			});

			const url = `${this.apiUrl(endpoint)}?${urlParams.toString()}`;

			try {
				const response = await requestUrl({
					url,
					headers: this.authHeaders(),
					throw: false,
				});

				if (response.status < 200 || response.status >= 300) {
					this.noticeManager.error(
						`GitLab API error ${response.status}`,
					);
					break;
				}

				const data: T[] = response.json;
				allItems = [...allItems, ...data];

				// Check pagination via X-Next-Page header
				const nextPage = response.headers["x-next-page"];
				hasMorePages = !!nextPage && nextPage !== "";
				page++;
			} catch (error) {
				this.noticeManager.error(`Error fetching ${endpoint}`, error);
				break;
			}
		}

		return allItems;
	}

	/**
	 * Fetch the currently authenticated user
	 */
	public async fetchAuthenticatedUser(): Promise<string> {
		const token = this.tokenGetter();
		if (!token) return "";

		try {
			const response = await requestUrl({
				url: this.apiUrl("/user"),
				headers: this.authHeaders(),
				throw: false,
			});

			if (response.status < 200 || response.status >= 300) return "";

			const user = response.json;
			this.currentUser = user.username;
			return this.currentUser;
		} catch (error) {
			this.noticeManager.error(
				"Error fetching authenticated user",
				error,
			);
			return "";
		}
	}

	/**
	 * Normalize a raw GitLab issue to match the common format
	 */
	private normalizeIssue(issue: any): any {
		return {
			...issue,
			html_url: issue.web_url,
			number: issue.iid,
			user: { login: issue.author?.username ?? "" },
			assignees: (issue.assignees || []).map((a: any) => ({
				login: a.username ?? "",
			})),
			labels: (issue.labels || []).map((l: string) => ({ name: l })),
			body: issue.description,
			state: issue.state === "opened" ? "open" : issue.state,
		};
	}

	/**
	 * Fetch issues for a project
	 */
	public async fetchRepositoryIssues(
		owner: string,
		repo: string,
		includeClosed: boolean = false,
		daysToKeepClosed: number = 30,
		extra?: ProviderExtraParams,
	): Promise<any[]> {
		const projectPath = `${owner}/${repo}`;
		const encodedId = this.projectApiId(
			owner,
			repo,
			extra?.gitlabProjectId,
		);
		const state = includeClosed ? "all" : "opened";

		try {
			const items = await this.fetchPaginated<any>(
				`/projects/${encodedId}/issues`,
				{ state },
			);

			if (includeClosed) {
				const cutoffDate = new Date();
				cutoffDate.setDate(cutoffDate.getDate() - daysToKeepClosed);

				const filtered = items.filter((issue: any) => {
					if (issue.state === "opened") return true;
					if (issue.closed_at) {
						return new Date(issue.closed_at) > cutoffDate;
					}
					return false;
				});
				return filtered.map((issue: any) => this.normalizeIssue(issue));
			}

			this.noticeManager.debug(
				`Fetched ${items.length} issues for ${projectPath}`,
			);
			return items.map((issue: any) => this.normalizeIssue(issue));
		} catch (error) {
			this.noticeManager.error(
				`Error fetching issues for ${projectPath}`,
				error,
			);
			return [];
		}
	}

	/**
	 * Fetch merge requests for a project
	 */
	public async fetchRepositoryPullRequests(
		owner: string,
		repo: string,
		includeClosed: boolean = false,
		daysToKeepClosed: number = 30,
		extra?: ProviderExtraParams,
	): Promise<any[]> {
		const projectPath = `${owner}/${repo}`;
		const encodedId = this.projectApiId(
			owner,
			repo,
			extra?.gitlabProjectId,
		);
		const state = includeClosed ? "all" : "opened";

		try {
			const items = await this.fetchPaginated<any>(
				`/projects/${encodedId}/merge_requests`,
				{ state },
			);

			// Normalize to common format
			const normalized = items.map((mr: any) => ({
				...mr,
				html_url: mr.web_url,
				number: mr.iid,
				user: { login: mr.author?.username ?? "" },
				assignees: (mr.assignees || []).map((a: any) => ({
					login: a.username ?? "",
				})),
				requested_reviewers: (mr.reviewers || []).map((r: any) => ({
					login: r.username ?? "",
				})),
				labels: (mr.labels || []).map((l: string) => ({ name: l })),
				body: mr.description,
				state:
					mr.state === "opened"
						? "open"
						: mr.state === "merged"
							? "closed"
							: mr.state,
				merged_at: mr.merged_at,
				head: mr.source_branch ? { ref: mr.source_branch } : undefined,
				base: mr.target_branch ? { ref: mr.target_branch } : undefined,
				draft: mr.draft || mr.work_in_progress || false,
			}));

			if (includeClosed) {
				const cutoffDate = new Date();
				cutoffDate.setDate(cutoffDate.getDate() - daysToKeepClosed);

				return normalized.filter((mr: any) => {
					if (mr.state === "open" || mr.state === "opened")
						return true;
					const closedAt = mr.closed_at || mr.merged_at;
					if (closedAt) {
						return new Date(closedAt) > cutoffDate;
					}
					return false;
				});
			}

			this.noticeManager.debug(
				`Fetched ${normalized.length} merge requests for ${projectPath}`,
			);
			return normalized;
		} catch (error) {
			this.noticeManager.error(
				`Error fetching merge requests for ${projectPath}`,
				error,
			);
			return [];
		}
	}

	/**
	 * Fetch comments (notes) for an issue
	 */
	public async fetchIssueComments(
		owner: string,
		repo: string,
		issueIid: number,
		extra?: ProviderExtraParams,
	): Promise<any[]> {
		const encodedId = this.projectApiId(
			owner,
			repo,
			extra?.gitlabProjectId,
		);

		try {
			const notes = await this.fetchPaginated<any>(
				`/projects/${encodedId}/issues/${issueIid}/notes`,
			);

			// Filter out system notes (events like "closed the issue")
			const userNotes = notes.filter((note: any) => !note.system);

			// Normalize to common comment format
			return userNotes.map((note: any) => ({
				id: note.id,
				body: note.body,
				user: { login: note.author.username },
				created_at: note.created_at,
				updated_at: note.updated_at,
			}));
		} catch (error) {
			this.noticeManager.error(
				`Error fetching comments for issue #${issueIid}`,
				error,
			);
			return [];
		}
	}

	/**
	 * Fetch comments (notes) for a merge request
	 */
	public async fetchPullRequestComments(
		owner: string,
		repo: string,
		mrIid: number,
		extra?: ProviderExtraParams,
	): Promise<any[]> {
		const encodedId = this.projectApiId(
			owner,
			repo,
			extra?.gitlabProjectId,
		);

		try {
			const notes = await this.fetchPaginated<any>(
				`/projects/${encodedId}/merge_requests/${mrIid}/notes`,
			);

			// Filter out system notes
			const userNotes = notes.filter((note: any) => !note.system);

			// Normalize to common comment format
			return userNotes.map((note: any) => ({
				id: note.id,
				body: note.body,
				user: { login: note.author.username },
				created_at: note.created_at,
				updated_at: note.updated_at,
			}));
		} catch (error) {
			this.noticeManager.error(
				`Error fetching comments for MR !${mrIid}`,
				error,
			);
			return [];
		}
	}

	/**
	 * Fetch labels for a project
	 */
	public async fetchRepositoryLabels(
		owner: string,
		repo: string,
		extra?: ProviderExtraParams,
	): Promise<any[]> {
		const projectPath = `${owner}/${repo}`;
		const encodedId = this.projectApiId(
			owner,
			repo,
			extra?.gitlabProjectId,
		);

		try {
			const labels = await this.fetchPaginated<any>(
				`/projects/${encodedId}/labels`,
			);

			this.noticeManager.debug(
				`Fetched ${labels.length} labels for ${projectPath}`,
			);
			return labels;
		} catch (error) {
			this.noticeManager.error(
				`Error fetching labels for ${projectPath}`,
				error,
			);
			return [];
		}
	}

	/**
	 * Fetch members for a project (equivalent to collaborators)
	 */
	public async fetchRepositoryCollaborators(
		owner: string,
		repo: string,
		extra?: ProviderExtraParams,
	): Promise<any[]> {
		const projectPath = `${owner}/${repo}`;
		const encodedId = this.projectApiId(
			owner,
			repo,
			extra?.gitlabProjectId,
		);

		try {
			const members = await this.fetchPaginated<any>(
				`/projects/${encodedId}/members/all`,
			);

			// Normalize to common collaborator format
			return members.map((member: any) => ({
				login: member.username,
				avatar_url: member.avatar_url,
				type: "User",
			}));
		} catch (error) {
			this.noticeManager.error(
				`Error fetching members for ${projectPath}`,
				error,
			);
			return [];
		}
	}

	/**
	 * Fetch available repositories (projects) for the authenticated user
	 */
	public async fetchAvailableRepositories(): Promise<
		{ owner: { login: string }; name: string; id?: number }[]
	> {
		try {
			this.noticeManager.debug("Fetching projects from GitLab");
			const projects = await this.fetchPaginated<any>("/projects", {
				membership: "true",
				order_by: "last_activity_at",
			});

			return projects.map((p: any) => {
				const parts = p.path_with_namespace.split("/");
				const name = parts[parts.length - 1];
				const ownerPath = parts.slice(0, -1).join("/");
				return {
					owner: { login: ownerPath },
					name,
					full_name: p.path_with_namespace,
					id: p.id as number,
				};
			});
		} catch (error) {
			this.noticeManager.error("Error fetching repositories", error);
			return [];
		}
	}

	/**
	 * Fetch linked issues treated as sub-issues / children.
	 * Uses the GitLab GraphQL API to fetch child work items from the hierarchy widget.
	 * Falls back to the REST Issue Links API for older GitLab versions.
	 */
	public async fetchSubIssues(
		owner: string,
		repo: string,
		issueIid: number,
		extra?: ProviderExtraParams,
	): Promise<any[]> {
		// Try GraphQL work item hierarchy first (GitLab 15.3+)
		try {
			const children = await this.fetchChildWorkItems(
				owner,
				repo,
				issueIid,
			);
			if (children !== null) {
				this.noticeManager.debug(
					`Found ${children.length} child issues for #${issueIid} via work items API`,
				);
				return children;
			}
		} catch {
			// GraphQL not available or failed, fall through to REST
		}

		// Fallback: REST issue links API (older GitLab / Premium link types)
		const encodedId = this.projectApiId(
			owner,
			repo,
			extra?.gitlabProjectId,
		);

		try {
			const links = await this.fetchPaginated<any>(
				`/projects/${encodedId}/issues/${issueIid}/links`,
			);

			const children = links.filter(
				(link: any) => link.link_type !== "is_blocked_by",
			);

			this.noticeManager.debug(
				`Found ${children.length} child issues for #${issueIid} (of ${links.length} total links)`,
			);

			return children.map((link: any) => ({
				number: link.iid,
				title: link.title,
				state: link.state === "opened" ? "open" : link.state,
				url: link.web_url,
			}));
		} catch (error) {
			this.noticeManager.debug(
				`Error fetching linked issues for #${issueIid}: ${error}`,
			);
			return [];
		}
	}

	/**
	 * Fetch child work items via GitLab GraphQL API (Work Items hierarchy widget).
	 * Returns null if GraphQL is unavailable or the query fails.
	 */
	private async fetchChildWorkItems(
		owner: string,
		repo: string,
		issueIid: number,
	): Promise<any[] | null> {
		const token = this.tokenGetter();
		if (!token) return null;

		const query = `
			query($projectPath: ID!, $iid: String!) {
				project(fullPath: $projectPath) {
					issue(iid: $iid) {
						id
					}
				}
			}
		`;

		// First resolve the issue's global ID
		const idResponse = await requestUrl({
			url: `${this.baseUrl}/api/graphql`,
			method: "POST",
			headers: {
				...this.authHeaders(),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query,
				variables: {
					projectPath: `${owner}/${repo}`,
					iid: String(issueIid),
				},
			}),
			throw: false,
		});

		if (idResponse.status < 200 || idResponse.status >= 300) return null;
		const issueGid = idResponse.json?.data?.project?.issue?.id;
		if (!issueGid) return null;

		// Now fetch child work items via the hierarchy widget
		const childrenQuery = `
			query($id: WorkItemID!) {
				workItem(id: $id) {
					widgets {
						... on WorkItemWidgetHierarchy {
							children {
								nodes {
									iid
									title
									state
									webUrl
								}
							}
						}
					}
				}
			}
		`;

		const childResponse = await requestUrl({
			url: `${this.baseUrl}/api/graphql`,
			method: "POST",
			headers: {
				...this.authHeaders(),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query: childrenQuery,
				variables: { id: issueGid },
			}),
			throw: false,
		});

		if (childResponse.status < 200 || childResponse.status >= 300)
			return null;

		const widgets = childResponse.json?.data?.workItem?.widgets;
		if (!widgets) return null;

		const hierarchyWidget = widgets.find(
			(w: any) => w.children !== undefined,
		);
		if (!hierarchyWidget?.children?.nodes) return null;

		return hierarchyWidget.children.nodes.map((child: any) => ({
			number: parseInt(child.iid, 10),
			title: child.title,
			state: child.state === "OPEN" ? "open" : "closed",
			url: child.webUrl,
		}));
	}

	/**
	 * Fetch the parent issue via GitLab GraphQL Work Items hierarchy.
	 * Falls back to REST Issue Links API for older GitLab versions.
	 */
	public async fetchParentIssue(
		owner: string,
		repo: string,
		issueIid: number,
		extra?: ProviderExtraParams,
	): Promise<any | null> {
		// Try GraphQL work item hierarchy first (GitLab 15.3+)
		try {
			const parent = await this.fetchParentWorkItem(
				owner,
				repo,
				issueIid,
			);
			if (parent !== undefined) {
				if (parent) {
					this.noticeManager.debug(
						`Found parent issue #${parent.number} for #${issueIid} via work items API`,
					);
				}
				return parent;
			}
		} catch {
			// GraphQL not available, fall through to REST
		}

		// Fallback: REST issue links API
		const encodedId = this.projectApiId(
			owner,
			repo,
			extra?.gitlabProjectId,
		);

		try {
			const links = await this.fetchPaginated<any>(
				`/projects/${encodedId}/issues/${issueIid}/links`,
			);

			const parent = links.find(
				(link: any) => link.link_type === "is_blocked_by",
			);

			if (parent) {
				this.noticeManager.debug(
					`Found parent issue #${parent.iid} for #${issueIid}`,
				);
				return {
					number: parent.iid,
					title: parent.title,
					state: parent.state === "opened" ? "open" : parent.state,
					url: parent.web_url,
				};
			}

			return null;
		} catch (error) {
			this.noticeManager.debug(
				`Error fetching parent issue for #${issueIid}: ${error}`,
			);
			return null;
		}
	}

	/**
	 * Fetch the parent work item via GitLab GraphQL API.
	 * Returns undefined if GraphQL is unavailable, null if no parent, or the parent object.
	 */
	private async fetchParentWorkItem(
		owner: string,
		repo: string,
		issueIid: number,
	): Promise<any | undefined> {
		const token = this.tokenGetter();
		if (!token) return undefined;

		// Resolve the issue's global ID
		const idQuery = `
			query($projectPath: ID!, $iid: String!) {
				project(fullPath: $projectPath) {
					issue(iid: $iid) {
						id
					}
				}
			}
		`;

		const idResponse = await requestUrl({
			url: `${this.baseUrl}/api/graphql`,
			method: "POST",
			headers: {
				...this.authHeaders(),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query: idQuery,
				variables: {
					projectPath: `${owner}/${repo}`,
					iid: String(issueIid),
				},
			}),
			throw: false,
		});

		if (idResponse.status < 200 || idResponse.status >= 300)
			return undefined;
		const issueGid = idResponse.json?.data?.project?.issue?.id;
		if (!issueGid) return undefined;

		// Fetch parent via hierarchy widget
		const parentQuery = `
			query($id: WorkItemID!) {
				workItem(id: $id) {
					widgets {
						... on WorkItemWidgetHierarchy {
							parent {
								iid
								title
								state
								webUrl
							}
						}
					}
				}
			}
		`;

		const parentResponse = await requestUrl({
			url: `${this.baseUrl}/api/graphql`,
			method: "POST",
			headers: {
				...this.authHeaders(),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query: parentQuery,
				variables: { id: issueGid },
			}),
			throw: false,
		});

		if (parentResponse.status < 200 || parentResponse.status >= 300)
			return undefined;

		const widgets = parentResponse.json?.data?.workItem?.widgets;
		if (!widgets) return undefined;

		const hierarchyWidget = widgets.find(
			(w: any) => w.parent !== undefined,
		);
		if (!hierarchyWidget?.parent) return null;

		const p = hierarchyWidget.parent;
		return {
			number: parseInt(p.iid, 10),
			title: p.title,
			state: p.state === "OPEN" ? "open" : "closed",
			url: p.webUrl,
		};
	}

	/**
	 * Resolve the numeric project ID from an owner/repo path.
	 * This avoids %2F URL-encoding issues on self-hosted instances behind nginx.
	 */
	public async resolveProjectId(
		owner: string,
		repo: string,
	): Promise<number | undefined> {
		const token = this.tokenGetter();
		if (!token) return undefined;

		try {
			const encoded = encodeURIComponent(`${owner}/${repo}`);
			const response = await requestUrl({
				url: this.apiUrl(`/projects/${encoded}`),
				headers: this.authHeaders(),
				throw: false,
			});

			if (response.status >= 200 && response.status < 300) {
				return response.json.id as number;
			}
		} catch (error) {
			this.noticeManager.debug(
				`Could not resolve project ID for ${owner}/${repo}`,
			);
		}
		return undefined;
	}

	/**
	 * Validate the GitLab token
	 */
	public async validateToken(): Promise<{ valid: boolean; user?: string }> {
		const token = this.tokenGetter();
		if (!token) return { valid: false };

		try {
			const response = await requestUrl({
				url: this.apiUrl("/user"),
				headers: this.authHeaders(),
				throw: false,
			});

			if (response.status < 200 || response.status >= 300)
				return { valid: false };

			const user = response.json;
			return { valid: true, user: user.username };
		} catch {
			return { valid: false };
		}
	}

	public dispose(): void {
		this.currentUser = "";
	}
}
