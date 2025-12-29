import { RepositoryTracking, TrackedProject } from "./types";

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

	public getProjectIssueFolderPath(project: TrackedProject): string {
		if (project.useCustomIssueFolder && project.customIssueFolder?.trim()) {
			return this.processProjectFolderTemplate(project.customIssueFolder.trim(), project);
		}
		const folder = project.issueFolder?.trim() || "GitHub/{project}";
		return this.processProjectFolderTemplate(folder, project);
	}

	public getProjectPullRequestFolderPath(project: TrackedProject): string | null {
		if (project.useCustomPullRequestFolder && project.customPullRequestFolder?.trim()) {
			return this.processProjectFolderTemplate(project.customPullRequestFolder.trim(), project);
		}
		if (project.pullRequestFolder?.trim()) {
			return this.processProjectFolderTemplate(project.pullRequestFolder, project);
		}
		return null;
	}

	public processProjectFolderTemplate(folderTemplate: string, project: TrackedProject): string {
		return folderTemplate
			.replace(/\{project\}/g, this.sanitizeFolderPart(project.title))
			.replace(/\{owner\}/g, this.sanitizeFolderPart(project.owner))
			.replace(/\{project_number\}/g, project.number.toString());
	}

	private sanitizeFolderPart(str: string): string {
		return str
			.replace(/[<>:"|?*\\]/g, "-")
			.replace(/\.\./g, ".")
			.trim();
	}
}
