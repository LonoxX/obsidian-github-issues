import { App } from "obsidian";
import { GitHubTrackerSettings, RepositoryTracking } from "./types";
import { NoticeManager } from "./notice-manager";
import { GitHubClient } from "./github-client";
import { IssueFileManager } from "./issue-file-manager";
import { PullRequestFileManager } from "./pr-file-manager";
import { FilterManager } from "./filter-manager";
import { FolderPathManager } from "./folder-path-manager";

export class FileManager {
	private issueFileManager: IssueFileManager;
	private prFileManager: PullRequestFileManager;
	private filterManager: FilterManager;
	private folderPathManager: FolderPathManager;

	constructor(
		app: App,
		private settings: GitHubTrackerSettings,
		private noticeManager: NoticeManager,
		gitHubClient: GitHubClient,
	) {
		this.issueFileManager = new IssueFileManager(app, settings, noticeManager, gitHubClient);
		this.prFileManager = new PullRequestFileManager(app, settings, noticeManager, gitHubClient);
		this.filterManager = new FilterManager(gitHubClient);
		this.folderPathManager = new FolderPathManager();
	}

	/**
	 * Create issue files for a repository
	 */
	public async createIssueFiles(
		repo: RepositoryTracking,
		openIssues: any[],
		allIssuesIncludingRecentlyClosed: any[],
		currentIssueNumbers: Set<string>,
	): Promise<void> {
		return this.issueFileManager.createIssueFiles(repo, openIssues, allIssuesIncludingRecentlyClosed, currentIssueNumbers);
	}

	/**
	 * Create pull request files for a repository
	 */
	public async createPullRequestFiles(
		repo: RepositoryTracking,
		openPullRequests: any[],
		allPullRequestsIncludingRecentlyClosed: any[],
		currentPRNumbers: Set<string>,
	): Promise<void> {
		return this.prFileManager.createPullRequestFiles(repo, openPullRequests, allPullRequestsIncludingRecentlyClosed, currentPRNumbers);
	}

	public filterIssues(repo: RepositoryTracking, issues: any[]): any[] {
		return this.filterManager.filterIssues(repo, issues);
	}

	public filterPullRequests(repo: RepositoryTracking, pullRequests: any[]): any[] {
		return this.filterManager.filterPullRequests(repo, pullRequests);
	}

	public async cleanupEmptyFolders(): Promise<void> {
		try {
			for (const repo of this.settings.repositories) {
				const [owner, repoName] = repo.repository.split("/");
				if (!owner || !repoName) continue;

				const repoCleaned = repoName.replace(/\//g, "-");
				const ownerCleaned = owner.replace(/\//g, "-");
				const issueFolder = this.folderPathManager.getIssueFolderPath(repo, ownerCleaned, repoCleaned);
				const pullRequestFolder = this.folderPathManager.getPullRequestFolderPath(repo, ownerCleaned, repoCleaned);

				await this.issueFileManager.cleanupEmptyIssueFolder(
					repo,
					issueFolder,
					ownerCleaned,
				);
				await this.prFileManager.cleanupEmptyPullRequestFolder(
					repo,
					pullRequestFolder,
					ownerCleaned,
				);
			}
		} catch (error: unknown) {
			this.noticeManager.error("Error cleaning up empty folders", error);
		}
	}
}
