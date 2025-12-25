import { GitHubTrackerSettings, ProjectData, ProjectFieldValue, ProjectInfo } from "./types";
import { Octokit } from "octokit";
import { NoticeManager } from "./notice-manager";
import {
	GET_ITEM_PROJECT_DATA,
	GET_ITEMS_PROJECT_DATA_BATCH,
	GET_REPOSITORY_PROJECTS,
	GET_ORGANIZATION_PROJECTS,
	GET_USER_PROJECTS,
	GET_PROJECT_ITEMS,
	parseItemProjectData,
	ProjectItemData,
} from "./github-graphql";

export class GitHubClient {
	private octokit: Octokit | null = null;
	private currentUser: string = "";

	constructor(
		private settings: GitHubTrackerSettings,
		private noticeManager: NoticeManager,
	) {
		this.initializeClient();
	}

	/**
	 * Initialize GitHub client with the current token
	 */
	public initializeClient(token?: string): void {
		const authToken = token || this.settings.githubToken;

		if (!authToken) {
			this.noticeManager.error(
				"GitHub token is not set. Please set it in settings.",
			);
			return;
		}

		this.octokit = new Octokit({
			auth: authToken,
		});
	}

	/**
	 * Check if the client is ready to use
	 */
	public isReady(): boolean {
		return this.octokit !== null;
	}

	/**
	 * Get the Octokit instance
	 */
	public getClient(): Octokit | null {
		return this.octokit;
	}

	/**
	 * Fetch the currently authenticated user
	 */
	public async fetchAuthenticatedUser(): Promise<string> {
		if (!this.octokit) {
			return "";
		}

		try {
			const response = await this.octokit.rest.users.getAuthenticated();
			this.currentUser = response.data.login;
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
	 * Get the currently cached authenticated user
	 */
	public getCurrentUser(): string {
		return this.currentUser;
	}

	/**
	 * Fetch issues for a repository
	 */
	public async fetchRepositoryIssues(
		owner: string,
		repo: string,
		includeClosed: boolean = false,
		daysToKeepClosed: number = 30, // Default to 30 days if not provided
	): Promise<any[]> {
		if (!this.octokit) {
			return [];
		}

		try {
			let allItems: any[] = [];
			let page = 1;
			let hasMorePages = true;
			const state = includeClosed ? "all" : "open";
			while (hasMorePages) {
				const response = await this.octokit.rest.issues.listForRepo({
					owner,
					repo,
					state,
					per_page: 100,
					page,
				});

				const issuesOnly = response.data.filter(
					(item: any) => !item.pull_request,
				);
				allItems = [...allItems, ...issuesOnly];

				hasMorePages = response.data.length === 100;
				page++;
			}

			if (includeClosed) {
				const cutoffDate = new Date();
				cutoffDate.setDate(cutoffDate.getDate() - daysToKeepClosed);

				allItems = allItems.filter((issue) => {
					if (issue.state === "open") {
						return true;
					}
					if (issue.closed_at) {
						return new Date(issue.closed_at) > cutoffDate;
					}
					return false;
				});
			}

			this.noticeManager.debug(
				`Fetched ${allItems.length} issues for ${owner}/${repo}`,
			);
			return allItems;
		} catch (error) {
			this.noticeManager.error(
				`Error fetching issues for ${owner}/${repo}`,
				error,
			);
			return [];
		}
	}

	/**
	 * Fetch pull requests for a repository
	 */
	public async fetchRepositoryPullRequests(
		owner: string,
		repo: string,
		includeClosed: boolean = false,
		daysToKeepClosed: number = 30, // Default to 30 days if not provided
	): Promise<any[]> {
		if (!this.octokit) {
			return [];
		}

		try {
			let allItems: any[] = [];
			let page = 1;
			let hasMorePages = true;
			const state = includeClosed ? "all" : "open";

			while (hasMorePages) {
				const response = await this.octokit.rest.pulls.list({
					owner,
					repo,
					state,
					per_page: 100,
					page,
					// Include milestone data explicitly
					sort: 'updated',
				});

				allItems = [...allItems, ...response.data];
				hasMorePages = response.data.length === 100;
				page++;
			}

			if (includeClosed) {
				const cutoffDate = new Date();
				cutoffDate.setDate(cutoffDate.getDate() - daysToKeepClosed);

				allItems = allItems.filter((pr) => {
					if (pr.state === "open") {
						return true;
					}
					if (pr.closed_at) {
						return new Date(pr.closed_at) > cutoffDate;
					}
					return false;
				});
			}

			this.noticeManager.debug(
				`Fetched ${allItems.length} pull requests for ${owner}/${repo}`,
			);
			return allItems;
		} catch (error) {
			this.noticeManager.error(
				`Error fetching pull requests for ${owner}/${repo}`,
				error,
			);
			return [];
		}
	}

	/**
	 * Check if a pull request is opened by a specific user
	 */
	public isPullRequestByUser(pullRequest: any, username: string): boolean {
		if (!pullRequest || !pullRequest.user) {
			return false;
		}

		return pullRequest.user.login === username;
	}

	/**
	 * Fetch available repositories for the authenticated user
	 */
	public async fetchAvailableRepositories(): Promise<
		{ owner: { login: string }; name: string }[]
	> {
		if (!this.octokit) {
			return [];
		}

		try {
			this.noticeManager.debug("Fetching repositories from GitHub");
			let allUserRepos: { owner: { login: string }; name: string }[] = [];
			let userReposPage = 1;
			let hasMoreUserRepos = true;

			while (hasMoreUserRepos) {
				const { data: repos } =
					await this.octokit.rest.repos.listForAuthenticatedUser({
						per_page: 100,
						sort: "updated",
						page: userReposPage,
					});

				allUserRepos = [...allUserRepos, ...repos];
				hasMoreUserRepos = repos.length === 100;
				userReposPage++;
			}
			let allOrgs: { login: string }[] = [];
			let orgsPage = 1;
			let hasMoreOrgs = true;

			while (hasMoreOrgs) {
				const { data: orgs } =
					await this.octokit.rest.orgs.listForAuthenticatedUser({
						per_page: 100,
						page: orgsPage,
					});

				allOrgs = [...allOrgs, ...orgs];
				hasMoreOrgs = orgs.length === 100;
				orgsPage++;
			}
			const orgRepos = await Promise.all(
				allOrgs.map(async (org: { login: string }) => {
					this.noticeManager.debug(
						`Fetching repositories for organization: ${org.login}`,
					);
					if (!this.octokit) {
						this.noticeManager.error(
							"GitHub client is not initialized",
						);
						return [];
					}

					let allOrgRepos: {
						owner: { login: string };
						name: string;
					}[] = [];
					let orgReposPage = 1;
					let hasMoreOrgRepos = true;

					while (hasMoreOrgRepos) {
						const { data } =
							await this.octokit.rest.repos.listForOrg({
								org: org.login,
								per_page: 100,
								page: orgReposPage,
							});

						allOrgRepos = [...allOrgRepos, ...data];
						hasMoreOrgRepos = data.length === 100;
						orgReposPage++;
					}

					return allOrgRepos;
				}),
			);
			const allRepos = [...allUserRepos, ...orgRepos.flat()];

			const uniqueRepoMap = new Map();
			allRepos.forEach((repo) => {
				const fullName = `${repo.owner.login}/${repo.name}`;
				if (!uniqueRepoMap.has(fullName)) {
					uniqueRepoMap.set(fullName, repo);
				}
			});

			const uniqueRepos = Array.from(uniqueRepoMap.values());

			this.noticeManager.debug(
				`Found ${allRepos.length} repositories before deduplication, ${uniqueRepos.length} unique repositories after`,
			);

			return uniqueRepos;
		} catch (error) {
			this.noticeManager.error("Error fetching repositories", error);
			return [];
		}
	}

	/**
	 * Fetch comments for an issue
	 */
	public async fetchIssueComments(
		owner: string,
		repo: string,
		issueNumber: number,
	): Promise<any[]> {
		if (!this.octokit) {
			return [];
		}

		try {
			let allComments: any[] = [];
			let page = 1;
			let hasMorePages = true;

			while (hasMorePages) {
				const response = await this.octokit.rest.issues.listComments({
					owner,
					repo,
					issue_number: issueNumber,
					per_page: 100,
					page,
				});

				allComments = [...allComments, ...response.data];

				hasMorePages = response.data.length === 100;
				page++;
			}

			this.noticeManager.debug(
				`Fetched ${allComments.length} comments for issue #${issueNumber}`,
			);
			return allComments;
		} catch (error) {
			this.noticeManager.error(
				`Error fetching comments for issue #${issueNumber}`,
				error,
			);
			return [];
		}
	}

	/**
	 * Fetch comments for a pull request
	 */

	public async fetchPullRequestComments(
		owner: string,
		repo: string,
		prNumber: number,
	): Promise<any[]> {
		if (!this.octokit) {
			return [];
		}

		try {
			const issueComments = await this.fetchIssueComments(
				owner,
				repo,
				prNumber,
			);

			let allReviewComments: any[] = [];
			let page = 1;
			let hasMorePages = true;

			while (hasMorePages) {
				const response =
					await this.octokit.rest.pulls.listReviewComments({
						owner,
						repo,
						pull_number: prNumber,
						per_page: 100,
						page,
					});

				allReviewComments = [...allReviewComments, ...response.data];
				hasMorePages = response.data.length === 100;
				page++;
			}

			this.noticeManager.debug(
				`Fetched ${issueComments.length} general comments and ${allReviewComments.length} review comments for PR #${prNumber}`,
			);

			allReviewComments.forEach((comment) => {
				comment.is_review_comment = true;
			});

			return [...issueComments, ...allReviewComments];
		} catch (error) {
			this.noticeManager.error(
				`Error fetching comments for PR #${prNumber}`,
				error,
			);
			return [];
		}
	}

	/**
	 * Fetch labels for a repository
	 */
	public async fetchRepositoryLabels(
		owner: string,
		repo: string,
	): Promise<any[]> {
		if (!this.octokit) {
			return [];
		}

		try {
			let allLabels: any[] = [];
			let page = 1;
			let hasMorePages = true;

			while (hasMorePages) {
				const response = await this.octokit.rest.issues.listLabelsForRepo({
					owner,
					repo,
					per_page: 100,
					page,
				});

				allLabels = [...allLabels, ...response.data];
				hasMorePages = response.data.length === 100;
				page++;
			}

			this.noticeManager.debug(
				`Fetched ${allLabels.length} labels for ${owner}/${repo}`,
			);
			return allLabels;
		} catch (error) {
			this.noticeManager.error(
				`Error fetching labels for ${owner}/${repo}`,
				error,
			);
			return [];
		}
	}

	/**
	 * Fetch repository collaborators/contributors
	 */
	public async fetchRepositoryCollaborators(
		owner: string,
		repo: string,
	): Promise<any[]> {
		if (!this.octokit) {
			return [];
		}

		try {
			let allCollaborators: any[] = [];
			let page = 1;
			let hasMorePages = true;

			while (hasMorePages) {
				const response = await this.octokit.rest.repos.listCollaborators({
					owner,
					repo,
					per_page: 100,
					page,
				});

				allCollaborators = [...allCollaborators, ...response.data];
				hasMorePages = response.data.length === 100;
				page++;
			}

			this.noticeManager.debug(
				`Fetched ${allCollaborators.length} collaborators for ${owner}/${repo}`,
			);
			return allCollaborators;
		} catch (error) {
			// If collaborators endpoint fails (permissions), try contributors as fallback
			try {
				let allContributors: any[] = [];
				let page = 1;
				let hasMorePages = true;

				while (hasMorePages) {
					const response = await this.octokit.rest.repos.listContributors({
						owner,
						repo,
						per_page: 100,
						page,
					});

					allContributors = [...allContributors, ...response.data];
					hasMorePages = response.data.length === 100;
					page++;
				}

				this.noticeManager.debug(
					`Fetched ${allContributors.length} contributors for ${owner}/${repo} (fallback)`,
				);
				return allContributors;
			} catch (fallbackError) {
				this.noticeManager.error(
					`Error fetching collaborators/contributors for ${owner}/${repo}`,
					fallbackError,
				);
				return [];
			}
		}
	}

	/**
	 * Validate the GitHub token and get its scopes
	 */
	public async validateToken(): Promise<{ valid: boolean; scopes: string[]; user?: string }> {
		if (!this.octokit) {
			return { valid: false, scopes: [] };
		}

		try {
			const response = await this.octokit.rest.users.getAuthenticated();
			const scopes = response.headers['x-oauth-scopes']?.split(', ') || [];
			return {
				valid: true,
				scopes,
				user: response.data.login
			};
		} catch (error) {
			return { valid: false, scopes: [] };
		}
	}

	/**
	 * Get current rate limit information
	 */
	public async getRateLimit(): Promise<{ remaining: number; limit: number; reset: Date } | null> {
		if (!this.octokit) {
			return null;
		}

		try {
			const response = await this.octokit.rest.rateLimit.get();
			return {
				remaining: response.data.rate.remaining,
				limit: response.data.rate.limit,
				reset: new Date(response.data.rate.reset * 1000)
			};
		} catch (error) {
			return null;
		}
	}

	/**
	 * Fetch project data for a single issue or PR by its node ID
	 */
	public async fetchProjectDataForItem(nodeId: string): Promise<ProjectData[]> {
		if (!this.octokit) {
			return [];
		}

		try {
			const response: any = await this.octokit.graphql(GET_ITEM_PROJECT_DATA, {
				nodeId,
			});

			if (!response?.node) {
				return [];
			}

			const projectItems = parseItemProjectData(response.node);
			return this.convertToProjectData(projectItems);
		} catch (error) {
			this.noticeManager.debug(
				`Error fetching project data for item ${nodeId}: ${error}`,
			);
			return [];
		}
	}

	/**
	 * Batch fetch project data for multiple issues/PRs
	 * Returns a map of nodeId -> ProjectData[]
	 */
	public async fetchProjectDataForItems(
		nodeIds: string[],
	): Promise<Map<string, ProjectData[]>> {
		const result = new Map<string, ProjectData[]>();

		if (!this.octokit || nodeIds.length === 0) {
			return result;
		}

		// Process in batches of 50 to avoid hitting GraphQL limits
		const batchSize = 50;
		for (let i = 0; i < nodeIds.length; i += batchSize) {
			const batch = nodeIds.slice(i, i + batchSize);

			try {
				const response: any = await this.octokit.graphql(
					GET_ITEMS_PROJECT_DATA_BATCH,
					{ nodeIds: batch },
				);

				if (response?.nodes) {
					for (const node of response.nodes) {
						if (node?.id) {
							const projectItems = parseItemProjectData(node);
							result.set(node.id, this.convertToProjectData(projectItems));
						}
					}
				}
			} catch (error) {
				this.noticeManager.debug(
					`Error fetching batch project data: ${error}`,
				);
				// Continue with other batches even if one fails
			}
		}

		this.noticeManager.debug(
			`Fetched project data for ${result.size} items`,
		);
		return result;
	}

	/**
	 * Convert parsed project items to ProjectData format
	 */
	private convertToProjectData(projectItems: ProjectItemData[]): ProjectData[] {
		return projectItems.map((item) => {
			const customFields: Record<string, ProjectFieldValue> = {};
			let status: string | undefined;
			let priority: string | undefined;
			let iteration: { title: string; startDate: string; duration: number } | undefined;

			for (const field of item.fieldValues) {
				// Store in customFields
				customFields[field.fieldName] = field;

				// Extract common fields
				const fieldNameLower = field.fieldName.toLowerCase();
				if (fieldNameLower === 'status' && field.type === 'single_select') {
					status = field.value as string;
				} else if (fieldNameLower === 'priority' && field.type === 'single_select') {
					priority = field.value as string;
				} else if (field.type === 'iteration' && field.startDate && field.duration !== undefined) {
					iteration = {
						title: field.value as string,
						startDate: field.startDate,
						duration: field.duration,
					};
				}
			}

			return {
				projectId: item.projectId,
				projectTitle: item.projectTitle,
				projectNumber: item.projectNumber,
				projectUrl: item.projectUrl,
				status,
				priority,
				iteration,
				customFields,
			};
		});
	}

	/**
	 * Fetch available projects for a repository (includes org projects)
	 */
	public async fetchProjectsForRepository(
		owner: string,
		repo: string,
	): Promise<ProjectInfo[]> {
		if (!this.octokit) {
			return [];
		}

		const projects: ProjectInfo[] = [];

		this.noticeManager.debug(`[Projects] Fetching for owner='${owner}', repo='${repo}'`);

		try {
			// First, try to get repository-linked projects
			let hasNextPage = true;
			let cursor: string | null = null;

			while (hasNextPage) {
				this.noticeManager.debug(`[Projects] Querying repository projects: owner='${owner}', repo='${repo}', after='${cursor}'`);
				const response: any = await this.octokit.graphql(
					GET_REPOSITORY_PROJECTS,
					{
						owner,
						repo,
						first: 50,
						after: cursor,
					},
				);

				if (response?.repository?.projectsV2?.nodes) {
					for (const node of response.repository.projectsV2.nodes) {
						projects.push({
							id: node.id,
							title: node.title,
							number: node.number,
							url: node.url,
							closed: node.closed,
						});
					}
				}

				hasNextPage = response?.repository?.projectsV2?.pageInfo?.hasNextPage ?? false;
				cursor = response?.repository?.projectsV2?.pageInfo?.endCursor ?? null;
				this.noticeManager.debug(`[Projects] Repo projects page: found=${response?.repository?.projectsV2?.nodes?.length ?? 0}, hasNextPage=${hasNextPage}`);
			}

			// Also try to get organization projects if the owner is an org
			try {
				this.noticeManager.debug(`[Projects] Querying org projects: org='${owner}', after='${cursor}'`);
				hasNextPage = true;
				cursor = null;

				while (hasNextPage) {
					const orgResponse: any = await this.octokit.graphql(
						GET_ORGANIZATION_PROJECTS,
						{
							org: owner,
							first: 50,
							after: cursor,
						},
					);

					if (orgResponse?.organization?.projectsV2?.nodes) {
						for (const node of orgResponse.organization.projectsV2.nodes) {
							// Avoid duplicates
							if (!projects.some(p => p.id === node.id)) {
								projects.push({
									id: node.id,
									title: node.title,
									number: node.number,
									url: node.url,
									closed: node.closed,
								});
							}
						}
					}

					hasNextPage = orgResponse?.organization?.projectsV2?.pageInfo?.hasNextPage ?? false;
					cursor = orgResponse?.organization?.projectsV2?.pageInfo?.endCursor ?? null;
					this.noticeManager.debug(`[Projects] Org projects page: found=${orgResponse?.organization?.projectsV2?.nodes?.length ?? 0}, hasNextPage=${hasNextPage}`);
				}
			} catch (orgError) {
				// Owner is probably a user, not an org - that's fine
				this.noticeManager.debug(`Could not fetch org projects for ${owner}: likely a user account`);
				this.noticeManager.debug(`[Projects] Org projects error: ${orgError}`);
			}

			// Also try to get user projects if the owner is a user
			try {
				this.noticeManager.debug(`[Projects] Querying user projects: user='${owner}', after='${cursor}'`);
				hasNextPage = true;
				cursor = null;

				while (hasNextPage) {
					const userResponse: any = await this.octokit.graphql(
						GET_USER_PROJECTS,
						{
							user: owner,
							first: 50,
							after: cursor,
						},
					);

					if (userResponse?.user?.projectsV2?.nodes) {
						for (const node of userResponse.user.projectsV2.nodes) {
							if (!projects.some(p => p.id === node.id)) {
								projects.push({
									id: node.id,
									title: node.title,
									number: node.number,
									url: node.url,
									closed: node.closed,
								});
							}
						}
					}

					hasNextPage = userResponse?.user?.projectsV2?.pageInfo?.hasNextPage ?? false;
					cursor = userResponse?.user?.projectsV2?.pageInfo?.endCursor ?? null;
					this.noticeManager.debug(`[Projects] User projects page: found=${userResponse?.user?.projectsV2?.nodes?.length ?? 0}, hasNextPage=${hasNextPage}`);
				}
			} catch (userError) {
				this.noticeManager.debug(`Could not fetch user projects for ${owner}: likely an org account`);
				this.noticeManager.debug(`[Projects] User projects error: ${userError}`);
			}

			this.noticeManager.debug(
				`Found ${projects.length} projects for ${owner}/${repo}`,
			);
			this.noticeManager.debug(`[Projects] Final project count for owner='${owner}', repo='${repo}': ${projects.length}`);
		} catch (error) {
			this.noticeManager.debug(
				`Error fetching projects for ${owner}/${repo}: ${error}`,
			);
		}

		return projects;
	}

	/**
	 * Check if token has read:project scope
	 */
	public async hasProjectScope(): Promise<boolean> {
		const { scopes } = await this.validateToken();
		return scopes.some(scope =>
			scope === 'read:project' ||
			scope === 'project' ||
			scope === 'repo' // repo scope includes project access
		);
	}

	/**
	 * Fetch all items for a specific project
	 */
	public async fetchProjectItems(projectId: string): Promise<any[]> {
		if (!this.octokit) {
			return [];
		}

		try {
			let allItems: any[] = [];
			let hasNextPage = true;
			let cursor: string | null = null;

			while (hasNextPage) {
				const response: any = await this.octokit.graphql(
					GET_PROJECT_ITEMS,
					{
						projectId,
						first: 50,
						after: cursor,
					},
				);

				if (response?.node?.items?.nodes) {
					allItems = [...allItems, ...response.node.items.nodes];
				}

				hasNextPage = response?.node?.items?.pageInfo?.hasNextPage ?? false;
				cursor = response?.node?.items?.pageInfo?.endCursor ?? null;
			}

			this.noticeManager.debug(
				`Fetched ${allItems.length} items for project ${projectId}`,
			);
			return allItems;
		} catch (error) {
			this.noticeManager.error(
				`Error fetching project items for ${projectId}`,
				error,
			);
			return [];
		}
	}

	public dispose(): void {
		this.octokit = null;
		this.currentUser = "";
	}
}
