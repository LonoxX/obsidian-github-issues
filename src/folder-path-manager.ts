import { RepositoryTracking } from "./types";

export class FolderPathManager {
	/**
	 * Get the issue folder path for a repository
	 */
	public getIssueFolderPath(repo: RepositoryTracking, ownerCleaned: string, repoCleaned: string): string {
		if (repo.useCustomIssueFolder && repo.customIssueFolder && repo.customIssueFolder.trim()) {
			return repo.customIssueFolder.trim();
		}
		return `${repo.issueFolder}/${ownerCleaned}/${repoCleaned}`;
	}

	/**
	 * Get the pull request folder path for a repository
	 */
	public getPullRequestFolderPath(repo: RepositoryTracking, ownerCleaned: string, repoCleaned: string): string {
		if (repo.useCustomPullRequestFolder && repo.customPullRequestFolder && repo.customPullRequestFolder.trim()) {
			return repo.customPullRequestFolder.trim();
		}
		return `${repo.pullRequestFolder}/${ownerCleaned}/${repoCleaned}`;
	}
}
