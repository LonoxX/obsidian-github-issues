import { App, TFile, TFolder } from "obsidian";
import { GitHubTrackerSettings, RepositoryTracking } from "./types";
import { extractProperties } from "./util/properties";
import { NoticeManager } from "./notice-manager";
import { extractNumberFromFilename } from "./util/templateUtils";
import { FolderPathManager } from "./folder-path-manager";

export class CleanupManager {
	private folderPathManager: FolderPathManager;

	constructor(
		private app: App,
		private settings: GitHubTrackerSettings,
		private noticeManager: NoticeManager,
	) {
		this.folderPathManager = new FolderPathManager();
	}

	/**
	 * Cleanup deleted issues - remove files for issues that are no longer tracked
	 */
	public async cleanupDeletedIssues(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		allIssuesIncludingRecentlyClosed: any[],
	): Promise<void> {
		const issueFolderPath = this.folderPathManager.getIssueFolderPath(repo, ownerCleaned, repoCleaned);
		const repoFolder = this.app.vault.getAbstractFileByPath(issueFolderPath);

		if (repoFolder) {
			const files = this.app.vault
				.getFiles()
				.filter(
					(file) =>
						file.path.startsWith(`${issueFolderPath}/`) && file.extension === "md",
				);

			for (const file of files) {
				// Try to get number from frontmatter first (most reliable)
				const properties = extractProperties(this.app, file);
				let fileNumberString: string | null = null;

				if (properties.number) {
					fileNumberString = properties.number.toString();
				} else {
					// Fallback: try to extract from filename
					fileNumberString = extractNumberFromFilename(
						file.name,
						repo.issueNoteTemplate || "Issue - {number}"
					);
				}

				if (!fileNumberString) {
					// If we can't determine the issue number, log a warning but skip
					this.noticeManager.debug(
						`Could not determine issue number for file: ${file.name}. Consider adding a 'number' property to the frontmatter.`
					);
					continue;
				}

				const correspondingIssue =
					allIssuesIncludingRecentlyClosed.find(
						(issue: any) =>
							issue.number.toString() === fileNumberString,
					);

				let shouldDelete = false;
				let deleteReason = "";

				if (correspondingIssue) {
					if (correspondingIssue.state === "closed" && correspondingIssue.closed_at) {
						// Check if issue has been closed longer than the configured days
						const closedDate = new Date(correspondingIssue.closed_at);
						const cutoffDate = new Date();
						cutoffDate.setDate(cutoffDate.getDate() - this.settings.cleanupClosedIssuesDays);

						if (closedDate < cutoffDate) {
							shouldDelete = true;
							const daysClosed = Math.floor((Date.now() - closedDate.getTime()) / (1000 * 60 * 60 * 24));
							deleteReason = `Deleted issue ${fileNumberString} from ${repo.repository} (closed ${daysClosed} days ago, threshold: ${this.settings.cleanupClosedIssuesDays} days)`;
						}
					}
				} else {
					shouldDelete = true;
					deleteReason = `Deleted issue ${fileNumberString} from ${repo.repository} as it's no longer tracked (closed > ${this.settings.cleanupClosedIssuesDays} days or deleted)`;
				}

				if (shouldDelete) {
					const allowDelete = properties.allowDelete
					? String(properties.allowDelete)
							.toLowerCase()
							.replace('"', "") === "true"
					: repo.allowDeleteIssue;

					if (allowDelete) {
						await this.app.fileManager.trashFile(file);
						this.noticeManager.info(deleteReason);
					}
				}
			}
		}
	}

	/**
	 * Cleanup deleted pull requests - remove files for PRs that are no longer tracked
	 */
	public async cleanupDeletedPullRequests(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		allPullRequestsIncludingRecentlyClosed: any[],
	): Promise<void> {
		const pullRequestFolderPath = this.folderPathManager.getPullRequestFolderPath(repo, ownerCleaned, repoCleaned);
		const repoFolder = this.app.vault.getAbstractFileByPath(pullRequestFolderPath);

		if (repoFolder) {
			const files = this.app.vault
				.getFiles()
				.filter(
					(file) =>
						file.path.startsWith(`${pullRequestFolderPath}/`) && file.extension === "md",
				);

			for (const file of files) {
				// Try to get number from frontmatter first (most reliable)
				const properties = extractProperties(this.app, file);
				let fileNumberString: string | null = null;

				if (properties.number) {
					fileNumberString = properties.number.toString();
				} else {
					// Fallback: try to extract from filename
					fileNumberString = extractNumberFromFilename(
						file.name,
						repo.pullRequestNoteTemplate || "Pull Request - {number}"
					);
				}

				if (!fileNumberString) {
					// If we can't determine the PR number, log a warning but skip
					this.noticeManager.debug(
						`Could not determine PR number for file: ${file.name}. Consider adding a 'number' property to the frontmatter.`
					);
					continue;
				}

				const correspondingPR =
					allPullRequestsIncludingRecentlyClosed.find(
						(pr: any) => pr.number.toString() === fileNumberString,
					);

				let shouldDelete = false;
				let deleteReason = "";

				if (correspondingPR) {
					if (correspondingPR.state === "closed" && correspondingPR.closed_at) {
						// Check if PR has been closed longer than the configured days
						const closedDate = new Date(correspondingPR.closed_at);
						const cutoffDate = new Date();
						cutoffDate.setDate(cutoffDate.getDate() - this.settings.cleanupClosedIssuesDays);

						if (closedDate < cutoffDate) {
							shouldDelete = true;
							const daysClosed = Math.floor((Date.now() - closedDate.getTime()) / (1000 * 60 * 60 * 24));
							deleteReason = `Deleted pull request ${fileNumberString} from ${repo.repository} (closed ${daysClosed} days ago, threshold: ${this.settings.cleanupClosedIssuesDays} days)`;
						}
					}
				} else {
					shouldDelete = true;
					deleteReason = `Deleted pull request ${fileNumberString} from ${repo.repository} as it's no longer tracked (closed > ${this.settings.cleanupClosedIssuesDays} days or deleted)`;
				}

				if (shouldDelete) {
					const allowDelete = properties.allowDelete
					? String(properties.allowDelete)
							.toLowerCase()
							.replace('"', "") === "true"
					: repo.allowDeletePullRequest;

					if (allowDelete) {
						await this.app.fileManager.trashFile(file);
						this.noticeManager.info(deleteReason);
					}
				}
			}
		}
	}

	/**
	 * Cleanup empty issue folder and its parent folders
	 */
	public async cleanupEmptyIssueFolder(
		repo: RepositoryTracking,
		issueFolder: string,
		ownerCleaned: string,
	): Promise<void> {
		const issueFolderContent =
			this.app.vault.getAbstractFileByPath(issueFolder);

		if (issueFolderContent instanceof TFolder) {
			const files = issueFolderContent.children;

			if (!repo.trackIssues) {
				for (const file of files) {
					if (file instanceof TFile) {
						// Use Obsidian's MetadataCache to get frontmatter
						const properties = extractProperties(this.app, file);
						const allowDelete = properties.allowDelete
						? String(properties.allowDelete)
							.toLowerCase()
							.replace('"', "") === "true"
						: false;

						if (allowDelete) {
							await this.app.fileManager.trashFile(file);
							this.noticeManager.debug(
								`Deleted file ${file.name} from untracked repo`,
							);
							files.splice(files.indexOf(file), 1);
						}
					}
				}
			}

			// Only cleanup nested folder structure if not using custom folder
			if (!repo.useCustomIssueFolder || !repo.customIssueFolder || !repo.customIssueFolder.trim()) {
				if (files.length === 0) {
					this.noticeManager.info(
						`Deleting empty folder: ${issueFolder}`,
					);
					const folder =
						this.app.vault.getAbstractFileByPath(issueFolder);
					if (folder instanceof TFolder && folder.children.length === 0) {
						await this.app.fileManager.trashFile(folder);
					}
				}

				const issueOwnerFolder = this.app.vault.getAbstractFileByPath(
					`${repo.issueFolder}/${ownerCleaned}`,
				);

				if (issueOwnerFolder instanceof TFolder) {
					const files = issueOwnerFolder.children;
					if (files.length === 0) {
						this.noticeManager.info(
							`Deleting empty folder: ${issueOwnerFolder.path}`,
						);
						await this.app.fileManager.trashFile(issueOwnerFolder);
					}
				}
			}
		}
	}

	/**
	 * Cleanup empty pull request folder and its parent folders
	 */
	public async cleanupEmptyPullRequestFolder(
		repo: RepositoryTracking,
		pullRequestFolder: string,
		ownerCleaned: string,
	): Promise<void> {
		const pullRequestFolderContent =
			this.app.vault.getAbstractFileByPath(pullRequestFolder);

		if (pullRequestFolderContent instanceof TFolder) {
			const files = pullRequestFolderContent.children;

			if (!repo.trackPullRequest) {
				for (const file of files) {
					if (file instanceof TFile) {
						// Use Obsidian's MetadataCache to get frontmatter
						const properties = extractProperties(this.app, file);
						const allowDelete = properties.allowDelete
						? String(properties.allowDelete)
							.toLowerCase()
							.replace('"', "") === "true"
						: false;

						if (allowDelete) {
							await this.app.fileManager.trashFile(file);
							this.noticeManager.debug(
								`Deleted file ${file.name} from untracked repo`,
							);
							files.splice(files.indexOf(file), 1);
						}
					}
				}
			}

			// Only cleanup nested folder structure if not using custom folder
			if (!repo.useCustomPullRequestFolder || !repo.customPullRequestFolder || !repo.customPullRequestFolder.trim()) {
				if (files.length === 0) {
					this.noticeManager.info(
						`Deleting empty folder: ${pullRequestFolder}`,
					);
					const folder =
						this.app.vault.getAbstractFileByPath(pullRequestFolder);
					if (folder instanceof TFolder && folder.children.length === 0) {
						await this.app.fileManager.trashFile(folder);
					}
				}

				const pullRequestOwnerFolder = this.app.vault.getAbstractFileByPath(
					`${repo.pullRequestFolder}/${ownerCleaned}`,
				);

				if (pullRequestOwnerFolder instanceof TFolder) {
					const files = pullRequestOwnerFolder.children;
					if (files.length === 0) {
						this.noticeManager.info(
							`Deleting empty folder: ${pullRequestOwnerFolder.path}`,
						);
						await this.app.fileManager.trashFile(
							pullRequestOwnerFolder,
						);
					}
				}
			}
		}
	}
}
