import { describe, expect, it } from "vitest";
import { FolderPathManager } from "../src/folder-path-manager";
import {
	DEFAULT_REPOSITORY_TRACKING,
	type IssueTrackerSettings,
	type RepositoryTracking,
	type TrackedProject,
} from "../src/types";

const base = {
	enabled: true,
	token: "",
	useSecretStorage: false,
	secretTokenName: "",
};
const settings = {
	providers: [
		{ ...base, id: "github", type: "github" },
		{
			...base,
			id: "gitlab",
			type: "gitlab",
			baseUrl: "https://git.example.com",
		},
		{
			...base,
			id: "forgejo-2",
			type: "forgejo",
			baseUrl: "https://gitea.example.org",
			label: "Gitea Test",
		},
	],
} as IssueTrackerSettings;

function repo(overrides: Partial<RepositoryTracking>): RepositoryTracking {
	return {
		...DEFAULT_REPOSITORY_TRACKING,
		repository: "LonoxX/LonoxX-Testing",
		...overrides,
	};
}

const fpm = new FolderPathManager(settings);

describe("FolderPathManager", () => {
	it("keeps the classic owner/repo layout without placeholders", () => {
		expect(
			fpm.getIssueFolderPath(
				repo({ issueFolder: "GitHub" }),
				"LonoxX",
				"LonoxX-Testing",
			),
		).toBe("GitHub/LonoxX/LonoxX-Testing");
	});

	it("replaces {provider} and still appends owner/repo", () => {
		const r = repo({
			issueFolder: "Issues/{provider}",
			provider: "gitlab",
		});
		expect(fpm.getIssueFolderPath(r, "LonoxX", "LonoxX-Testing")).toBe(
			"Issues/GitLab/LonoxX/LonoxX-Testing",
		);
	});

	it("uses the custom label and the instance id", () => {
		const r = repo({
			pullRequestFolder: "PRs/{provider}/{providerId}",
			provider: "forgejo-2",
		});
		expect(
			fpm.getPullRequestFolderPath(r, "lonoxx", "LonoxX-Testing"),
		).toBe("PRs/Gitea Test/forgejo-2/lonoxx/LonoxX-Testing");
	});

	it("does not append owner/repo when the template places them itself", () => {
		const r = repo({
			issueFolder: "{provider}/{repo}",
			provider: "github",
		});
		expect(fpm.getIssueFolderPath(r, "LonoxX", "LonoxX-Testing")).toBe(
			"GitHub/LonoxX-Testing",
		);
	});

	it("resolves placeholders in custom folders without appending", () => {
		const r = repo({
			useCustomIssueFolder: true,
			customIssueFolder: "Notes/{providerId}/",
			provider: "gitlab",
		});
		expect(fpm.getIssueFolderPath(r, "LonoxX", "LonoxX-Testing")).toBe(
			"Notes/gitlab",
		);
	});

	it("keeps same-named repositories of different providers apart", () => {
		const gh = fpm.getIssueFolderPath(
			repo({ issueFolder: "Issues/{provider}", provider: "github" }),
			"LonoxX",
			"LonoxX-Testing",
		);
		const gl = fpm.getIssueFolderPath(
			repo({ issueFolder: "Issues/{provider}", provider: "gitlab" }),
			"LonoxX",
			"LonoxX-Testing",
		);
		expect(gh).not.toBe(gl);
	});
});

describe("project folders", () => {
	const project = (
		overrides: Partial<TrackedProject> = {},
	): TrackedProject => ({
		id: "p1",
		title: "Roadmap",
		number: 1,
		url: "",
		owner: "lonoxx",
		enabled: true,
		...overrides,
	});
	const fpm = new FolderPathManager(settings);

	it("keeps GitHub/{project} for GitHub projects with the default", () => {
		expect(fpm.getProjectIssueFolderPath(project())).toBe("GitHub/Roadmap");
	});

	it("uses the server of a Gitea project", () => {
		expect(
			fpm.getProjectIssueFolderPath(project({ provider: "forgejo-2" })),
		).toBe("Gitea Test/Roadmap");
	});

	it("resolves {providerId} and the other placeholders", () => {
		expect(
			fpm.getProjectIssueFolderPath(
				project({
					provider: "forgejo-2",
					issueFolder: "Boards/{providerId}/{owner}/{project_number}",
				}),
			),
		).toBe("Boards/forgejo-2/lonoxx/1");
	});
});
