import { describe, expect, it } from "vitest";
import { GitLabProvider } from "../src/providers/gitlab/gitlab-provider";
import type { IssueTrackerSettings, ProviderConfig } from "../src/types";
import type { NoticeManager } from "../src/notice-manager";
import { daysAgo, json, noticeManager, routeRequests } from "./helpers";

const config: ProviderConfig = {
	id: "gitlab",
	type: "gitlab",
	enabled: true,
	token: "",
	useSecretStorage: false,
	secretTokenName: "",
	baseUrl: "https://git.example.com/",
};

const provider = () =>
	new GitLabProvider(
		{ providers: [config] } as IssueTrackerSettings,
		noticeManager as unknown as NoticeManager,
		() => "secret",
		config,
	);

describe("GitLabProvider", () => {
	it("maps GitLab fields onto the common issue shape", async () => {
		routeRequests([
			[
				"/projects/25/issues",
				json([
					{
						iid: 3,
						state: "opened",
						web_url: "https://git.example.com/x/-/issues/3",
						author: { username: "lonoxx" },
						labels: ["bug"],
						description: "Text",
						created_at: daysAgo(1),
					},
				]),
			],
		]);
		const [issue] = await provider().fetchRepositoryIssues(
			"LonoxX",
			"LonoxX-Testing",
			false,
			30,
			{ gitlabProjectId: 25 },
		);
		expect(issue).toMatchObject({
			number: 3,
			state: "open",
			user: { login: "lonoxx" },
			labels: [{ name: "bug" }],
			body: "Text",
			html_url: "https://git.example.com/x/-/issues/3",
		});
	});

	it("uses the URL-encoded path for nested groups without a project id", async () => {
		const seen = routeRequests([["/issues", json([])]]);
		await provider().fetchRepositoryIssues("intern/team", "repo");
		expect(seen[0]).toContain(
			"/api/v4/projects/intern%2Fteam%2Frepo/issues",
		);
	});

	it("treats merged merge requests as closed and detects drafts", async () => {
		routeRequests([
			[
				"/merge_requests",
				json([
					{
						iid: 1,
						state: "merged",
						merged_at: daysAgo(1),
						created_at: daysAgo(3),
						source_branch: "f",
						target_branch: "main",
					},
					{
						iid: 2,
						state: "opened",
						work_in_progress: true,
						created_at: daysAgo(1),
					},
				]),
			],
		]);
		const mrs = await provider().fetchRepositoryPullRequests(
			"LonoxX",
			"LonoxX-Testing",
			true,
			30,
		);
		expect(mrs[0]).toMatchObject({
			number: 1,
			state: "closed",
			head: { ref: "f" },
			base: { ref: "main" },
		});
		expect(mrs[1]).toMatchObject({ number: 2, state: "open", draft: true });
	});

	it("follows the X-Next-Page header", async () => {
		routeRequests([
			[
				/labels\?.*page=1(&|$)/,
				json([{ name: "a" }], { "x-next-page": "2" }),
			],
			[
				/labels\?.*page=2(&|$)/,
				json([{ name: "b" }], { "x-next-page": "" }),
			],
		]);
		const labels = await provider().fetchRepositoryLabels(
			"LonoxX",
			"LonoxX-Testing",
		);
		expect(labels.map((l) => l.name)).toEqual(["a", "b"]);
	});
});

describe("GitLab issue boards", () => {
	const API = "https://git.example.com/api/v4";
	const BOARD_ID =
		"https://git.example.com/LonoxX/LonoxX-Testing/-/boards/7#project=25";
	const board = {
		id: 7,
		name: "Development",
		lists: [
			{ id: 2, position: 1, label: { name: "Doing", color: "#00f" } },
			{ id: 1, position: 0, label: { name: "To Do", color: "#f00" } },
		],
	};

	it("lists project boards and skips user namespaces for group boards", async () => {
		routeRequests([
			[`${API}/projects/25/boards?`, json([board])],
			[`${API}/groups/LonoxX`, { status: 404, json: {}, headers: {} }],
		]);
		expect(
			await provider().fetchAllAvailableProjects([
				{ repository: "LonoxX/LonoxX-Testing", gitlabProjectId: 25 },
			]),
		).toEqual([
			{
				id: BOARD_ID,
				title: "Development",
				number: 7,
				url: "https://git.example.com/LonoxX/LonoxX-Testing/-/boards/7",
				closed: false,
				owner: "LonoxX",
				provider: "gitlab",
			},
		]);
	});

	it("lists group boards of a group namespace once", async () => {
		const seen = routeRequests([
			[/\/projects\/(25|26)\/boards\?/, json([])],
			[
				`${API}/groups/panda-network`,
				json({ id: 4, full_path: "panda-network" }),
			],
			[
				`${API}/groups/4/boards?`,
				json([{ ...board, id: 9, name: "Team" }]),
			],
		]);
		const boards = await provider().fetchAllAvailableProjects([
			{ repository: "panda-network/a", gitlabProjectId: 25 },
			{ repository: "panda-network/b", gitlabProjectId: 26 },
		]);
		expect(boards.map((b) => b.id)).toEqual([
			"https://git.example.com/groups/panda-network/-/boards/9#group=4",
		]);
		expect(seen.filter((u) => u.includes("/groups/4/boards"))).toHaveLength(
			1,
		);
	});

	it("returns Open, the lists in board order and Closed as columns", async () => {
		routeRequests([[`${API}/projects/25/boards/7`, json(board)]]);
		expect(
			(await provider().fetchProjectStatusOptions(BOARD_ID)).map(
				(o) => o.name,
			),
		).toEqual(["Open", "To Do", "Doing", "Closed"]);
	});

	it("places issues like GitLab does", async () => {
		const issue = (iid: number, extra: Record<string, unknown>) => ({
			iid,
			title: `Issue ${iid}`,
			state: "opened",
			created_at: daysAgo(1),
			web_url: `https://git.example.com/LonoxX/LonoxX-Testing/-/work_items/${iid}`,
			references: { full: `LonoxX/LonoxX-Testing#${iid}` },
			labels: [],
			...extra,
		});
		routeRequests([
			[`${API}/projects/25/boards/7`, json(board)],
			[
				/\/projects\/25\/issues\?.*state=opened/,
				json([
					issue(1, { labels: ["Doing", "To Do"] }),
					issue(2, { labels: ["bug"] }),
				]),
			],
			[
				/\/projects\/25\/issues\?.*state=closed/,
				json([issue(3, { state: "closed", labels: ["Doing"] })]),
			],
		]);
		const items = await provider().fetchProjectItems(BOARD_ID);
		const placed = Object.fromEntries(
			items.map((i) => [
				i.content?.number,
				i.fieldValues?.nodes?.[0]?.name,
			]),
		);
		expect(placed).toEqual({ 1: "To Do", 2: "Open", 3: "Closed" });
		expect(items[0].content).toMatchObject({
			repository: "LonoxX/LonoxX-Testing",
			state: "open",
		});
	});
});
