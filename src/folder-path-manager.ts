import {
	DEFAULT_PROJECT_FOLDER_TEMPLATE,
	IssueTrackerSettings,
	RepositoryTracking,
	TrackedProject,
} from "./types";
import { ProviderTemplateInfo, providerTemplateInfo } from "./util/provider-ui";

export class FolderPathManager {
	constructor(private settings?: IssueTrackerSettings) {}

	/**
	 * Resolve {provider}, {providerId}, {owner} and {repo}/{repoName} in a
	 * repository folder. Default folders without {owner} or {repo} keep the
	 * classic layout and get "/owner/repo" appended.
	 */
	private resolveRepoFolder(
		template: string,
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		appendRepoPath: boolean,
	): string {
		const provider = providerTemplateInfo(
			this.settings?.providers,
			repo.provider,
		);
		const hasRepoPart = /\{(owner|repo|repoName)\}/.test(template);
		const resolved = template
			.replace(/\{providerId\}/g, this.sanitizeFolderPart(provider.id))
			.replace(/\{provider\}/g, this.sanitizeFolderPart(provider.name))
			.replace(/\{owner\}/g, ownerCleaned)
			.replace(/\{(repo|repoName)\}/g, repoCleaned);
		const path =
			appendRepoPath && !hasRepoPart
				? `${resolved}/${ownerCleaned}/${repoCleaned}`
				: resolved;
		return path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
	}

	/**
	 * Get the issue folder path for a repository
	 */
	public getIssueFolderPath(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
	): string {
		if (
			repo.useCustomIssueFolder &&
			repo.customIssueFolder &&
			repo.customIssueFolder.trim()
		) {
			return this.resolveRepoFolder(
				repo.customIssueFolder.trim(),
				repo,
				ownerCleaned,
				repoCleaned,
				false,
			);
		}
		return this.resolveRepoFolder(
			repo.issueFolder ?? "",
			repo,
			ownerCleaned,
			repoCleaned,
			true,
		);
	}

	/**
	 * Get the pull request folder path for a repository
	 */
	public getPullRequestFolderPath(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
	): string {
		if (
			repo.useCustomPullRequestFolder &&
			repo.customPullRequestFolder &&
			repo.customPullRequestFolder.trim()
		) {
			return this.resolveRepoFolder(
				repo.customPullRequestFolder.trim(),
				repo,
				ownerCleaned,
				repoCleaned,
				false,
			);
		}
		return this.resolveRepoFolder(
			repo.pullRequestFolder ?? "",
			repo,
			ownerCleaned,
			repoCleaned,
			true,
		);
	}

	public getProjectIssueFolderPath(
		project: TrackedProject,
		provider?: ProviderTemplateInfo,
	): string {
		if (project.useCustomIssueFolder && project.customIssueFolder?.trim()) {
			return this.processProjectFolderTemplate(
				project.customIssueFolder.trim(),
				project,
				provider,
			);
		}
		const folder =
			project.issueFolder?.trim() || DEFAULT_PROJECT_FOLDER_TEMPLATE;
		return this.processProjectFolderTemplate(folder, project, provider);
	}

	public getProjectPullRequestFolderPath(
		project: TrackedProject,
		provider?: ProviderTemplateInfo,
	): string | null {
		if (
			project.useCustomPullRequestFolder &&
			project.customPullRequestFolder?.trim()
		) {
			return this.processProjectFolderTemplate(
				project.customPullRequestFolder.trim(),
				project,
				provider,
			);
		}
		if (project.pullRequestFolder?.trim()) {
			return this.processProjectFolderTemplate(
				project.pullRequestFolder,
				project,
				provider,
			);
		}
		return null;
	}

	/**
	 * Placeholders: {project}, {owner}, {project_number}, {provider} and
	 * {providerId} (the server the project lives on).
	 */
	public processProjectFolderTemplate(
		folderTemplate: string,
		project: TrackedProject,
		provider?: ProviderTemplateInfo,
	): string {
		const info =
			provider ??
			providerTemplateInfo(this.settings?.providers, project.provider);
		return folderTemplate
			.replace(/\{project\}/g, this.sanitizeFolderPart(project.title))
			.replace(/\{owner\}/g, this.sanitizeFolderPart(project.owner))
			.replace(/\{project_number\}/g, project.number.toString())
			.replace(/\{providerId\}/g, this.sanitizeFolderPart(info.id))
			.replace(/\{provider\}/g, this.sanitizeFolderPart(info.name))
			.replace(/\/+/g, "/"); // Normalize multiple slashes
	}

	private sanitizeFolderPart(str: string): string {
		return str
			.replace(/[<>:"|?*\\]/g, "-")
			.replace(/\.\./g, ".")
			.trim();
	}
}
