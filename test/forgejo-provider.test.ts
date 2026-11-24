import { beforeEach, describe, expect, it } from "vitest";
import { ForgejoProvider } from "../src/providers/forgejo/forgejo-provider";
import type { IssueTrackerSettings, ProviderConfig } from "../src/types";
import type { NoticeManager } from "../src/notice-manager";
import { daysAgo, json, noticeManager, routeRequests } from "./helpers";

const config: ProviderConfig = {
	id: "forgejo",
	type: "forgejo",
	enabled: true,
	token: "",
	useSecretStorage: false,
	secretTokenName: "",
	baseUrl: "https://forgejo.example.org/",
};

function provider(token = "secret") {
	return new ForgejoProvider(
		{ providers: [config] } as IssueTrackerSettings,
		noticeManager as unknown as NoticeManager,
		() => token,
		config,
	);
}

const REPO = "https://forgejo.example.org/api/v1/repos/lonoxx/LonoxX-Testing";

beforeEach(() => {
	Object.values(noticeManager).forEach((fn) => fn.mockClear());
});

describe("ForgejoProvider", () => {
	it("defaults to codeberg.org without a base URL", async () => {
		const cfg = { ...config, baseUrl: undefined };
		const p = new ForgejoProvider(
			{ providers: [cfg] } as IssueTrackerSettings,
			noticeManager as unknown as NoticeManager,
			() => "t",
			cfg,
		);
		const seen = routeRequests([["/user", json({ login: "me" })]]);
		await p.validateToken();
		expect(seen[0]).toBe("https://codeberg.org/api/v1/user");
	});

	it("does not call the API without a token", async () => {
		const seen = routeRequests([]);
		expect(
			await provider("").fetchRepositoryIssues(
				"lonoxx",
				"LonoxX-Testing",
			),
		).toEqual([]);
		expect(seen).toHaveLength(0);
	});

	it("sends the token header and only GET requests", async () => {
		routeRequests([["/user", json({ login: "lonoxx" })]]);
		const { requestUrl } = await import("./obsidian.mock");
		expect(await provider().validateToken()).toEqual({
			valid: true,
			user: "lonoxx",
		});
		const calls = requestUrl.mock.calls;
		const call = calls[calls.length - 1]?.[0];
		expect(call?.headers?.Authorization).toBe("token secret");
		expect(call?.method ?? "GET").toBe("GET");
	});

	it("normalises issues and drops pull requests from the issue list", async () => {
		routeRequests([
			[
				"/issues?state=open",
				json([
					{
						number: 1,
						title: "Bug",
						state: "open",
						user: { login: "lonoxx" },
						labels: [{ name: "bug", color: "#e11d21" }],
						assignees: [{ username: "helper" }],
						pull_request: null,
					},
					{
						number: 2,
						title: "PR",
						state: "open",
						pull_request: { merged: false },
					},
				]),
			],
		]);
		const issues = await provider().fetchRepositoryIssues(
			"lonoxx",
			"LonoxX-Testing",
		);
		expect(issues.map((i) => i.number)).toEqual([1]);
		expect(issues[0].labels?.[0].color).toBe("e11d21");
		expect(issues[0].assignees?.[0].login).toBe("helper");
	});

	it("keeps only recently closed issues", async () => {
		const seen = routeRequests([
			["/issues?state=open", json([])],
			[
				"/issues?state=closed",
				json([
					{ number: 3, state: "closed", closed_at: daysAgo(2) },
					{ number: 4, state: "closed", closed_at: daysAgo(40) },
				]),
			],
		]);
		const issues = await provider().fetchRepositoryIssues(
			"lonoxx",
			"LonoxX-Testing",
			true,
			30,
		);
		expect(issues.map((i) => i.number)).toEqual([3]);
		expect(seen.some((u) => u.includes("since="))).toBe(true);
	});

	it("follows pagination until a short page", async () => {
		const full = Array.from({ length: 50 }, (_, i) => ({
			number: i + 1,
			state: "open",
		}));
		routeRequests([
			[/issues\?.*page=1(&|$)/, json(full)],
			[/issues\?.*page=2(&|$)/, json([{ number: 51, state: "open" }])],
		]);
		const issues = await provider().fetchRepositoryIssues(
			"lonoxx",
			"LonoxX-Testing",
		);
		expect(issues).toHaveLength(51);
	});

	it("maps pull request state, draft and branches", async () => {
		routeRequests([
			[
				"/pulls?state=open",
				json([
					{
						number: 5,
						title: "WIP: neues Feature",
						state: "open",
						head: { ref: "feature" },
						base: { ref: "main" },
					},
					{
						number: 6,
						title: "Fertig",
						state: "open",
						draft: false,
						merged: false,
					},
				]),
			],
		]);
		const prs = await provider().fetchRepositoryPullRequests(
			"lonoxx",
			"LonoxX-Testing",
		);
		expect(prs[0]).toMatchObject({
			draft: true,
			merged: false,
			head: { ref: "feature" },
		});
		expect(prs[1].draft).toBe(false);
	});

	it("stops reading closed pull requests once they are older than the cutoff", async () => {
		const seen = routeRequests([
			["/pulls?state=open", json([])],
			[
				"/pulls?state=closed",
				json([
					{
						number: 7,
						state: "closed",
						merged: true,
						merged_at: daysAgo(1),
						updated_at: daysAgo(1),
					},
					{
						number: 8,
						state: "closed",
						closed_at: daysAgo(90),
						updated_at: daysAgo(90),
					},
				]),
			],
		]);
		const prs = await provider().fetchRepositoryPullRequests(
			"lonoxx",
			"LonoxX-Testing",
			true,
			30,
		);
		expect(prs.map((p) => p.number)).toEqual([7]);
		expect(seen.filter((u) => u.includes("state=closed"))).toHaveLength(1);
	});

	it("merges conversation and review comments in time order", async () => {
		routeRequests([
			[
				"/issues/9/comments",
				json([
					{
						body: "später",
						created_at: "2026-01-03T00:00:00Z",
						user: { login: "a" },
					},
				]),
			],
			[
				"/pulls/9/reviews/11/comments",
				json([
					{
						body: "Zeile",
						path: "x.ts",
						position: 4,
						created_at: "2026-01-02T00:00:00Z",
						user: { login: "b" },
					},
				]),
			],
			[
				"/pulls/9/reviews",
				json([
					{
						id: 11,
						body: "Review",
						submitted_at: "2026-01-01T00:00:00Z",
						comments_count: 1,
						user: { login: "b" },
					},
				]),
			],
		]);
		const comments = await provider().fetchPullRequestComments(
			"lonoxx",
			"LonoxX-Testing",
			9,
		);
		expect(comments.map((c) => c.body)).toEqual([
			"Review",
			"Zeile",
			"später",
		]);
		expect(comments[1]).toMatchObject({
			path: "x.ts",
			line: 4,
			is_review_comment: true,
		});
		expect(comments[0].is_review_comment).toBeUndefined();
	});

	it("lists people via assignees, falling back to collaborators", async () => {
		routeRequests([[`${REPO}/assignees`, json([{ login: "lonoxx" }])]]);
		expect(
			(
				await provider().fetchRepositoryCollaborators(
					"lonoxx",
					"LonoxX-Testing",
				)
			).map((u) => u.login),
		).toEqual(["lonoxx"]);

		routeRequests([
			[`${REPO}/assignees`, { status: 404, json: null }],
			[`${REPO}/collaborators`, json([{ login: "other" }])],
		]);
		expect(
			(
				await provider().fetchRepositoryCollaborators(
					"lonoxx",
					"LonoxX-Testing",
				)
			).map((u) => u.login),
		).toEqual(["other"]);
	});

	it("returns own repositories when organisations are not readable", async () => {
		routeRequests([
			[
				"/user/repos",
				json([{ name: "LonoxX-Testing", owner: { login: "lonoxx" } }]),
			],
			["/user/orgs", { status: 403, json: null }],
		]);
		const repos = await provider().fetchAvailableRepositories();
		expect(repos).toEqual([
			{
				owner: { login: "lonoxx" },
				name: "LonoxX-Testing",
				id: undefined,
			},
		]);
		expect(noticeManager.error).not.toHaveBeenCalled();
	});

	describe("projects", () => {
		const PROJECT_URL =
			"https://forgejo.example.org/lonoxx/LonoxX-Testing/projects/1";

		it("lists projects of the given repositories with the URL as id", async () => {
			routeRequests([
				[
					`${REPO}/projects?`,
					json([
						{
							id: 1,
							title: "Roadmap",
							html_url: PROJECT_URL,
							is_closed: false,
						},
					]),
				],
			]);
			expect(
				await provider().fetchAllAvailableProjects([
					{ repository: "lonoxx/LonoxX-Testing" },
				]),
			).toEqual([
				{
					id: PROJECT_URL,
					title: "Roadmap",
					number: 1,
					url: PROJECT_URL,
					closed: false,
					owner: "lonoxx",
					provider: "forgejo",
				},
			]);
		});

		it("reports a server without project API", async () => {
			routeRequests([
				[`${REPO}/projects?`, { status: 404, json: {}, headers: {} }],
			]);
			await expect(
				provider().fetchAllAvailableProjects([
					{ repository: "lonoxx/LonoxX-Testing" },
				]),
			).rejects.toThrow("no project API");
		});

		it("maps columns to the Status field and keeps pull requests", async () => {
			routeRequests([
				[
					`${REPO}/projects/1/columns?`,
					json([
						{ id: 2, title: "Done", sorting: 1 },
						{ id: 1, title: "To Do", sorting: 0 },
					]),
				],
				[
					`${REPO}/projects/1/columns/1/issues?`,
					json([
						{
							number: 7,
							title: "Show labels as tags",
							state: "open",
							html_url:
								"https://forgejo.example.org/lonoxx/LonoxX-Testing/issues/7",
							user: { login: "lonoxx" },
							labels: [{ name: "feature", color: "#00ff00" }],
						},
					]),
				],
				[
					`${REPO}/projects/1/columns/2/issues?`,
					json([
						{
							number: 5,
							title: "Fix sync",
							state: "closed",
							html_url:
								"https://forgejo.example.org/lonoxx/LonoxX-Testing/pulls/5",
							pull_request: {},
						},
					]),
				],
			]);
			const items = await provider().fetchProjectItems(PROJECT_URL);
			expect(items.map((i) => i.fieldValues?.nodes?.[0]?.name)).toEqual([
				"To Do",
				"Done",
			]);
			expect(items[0].content).toMatchObject({
				number: 7,
				repository: "lonoxx/LonoxX-Testing",
				author: { login: "lonoxx" },
				labels: { nodes: [{ name: "feature", color: "00ff00" }] },
			});
			expect(items[1].content?.url).toContain("/pulls/5");
		});

		it("returns the columns as status options", async () => {
			routeRequests([
				[
					`${REPO}/projects/1/columns?`,
					json([{ id: 1, title: "To Do", color: "#ff0000" }]),
				],
			]);
			expect(
				await provider().fetchProjectStatusOptions(PROJECT_URL),
			).toEqual([{ id: "1", name: "To Do", color: "#ff0000" }]);
		});
	});
});
