import { App, TFile } from "obsidian";
import { GitHubTrackerSettings, RepositoryTracking, ProjectData } from "./types";
import { escapeBody } from "./util/escapeUtils";
import { NoticeManager } from "./notice-manager";
import { GitHubClient } from "./github-client";
import {
	createIssueTemplateData,
	processFilenameTemplate
} from "./util/templateUtils";
import { getEffectiveRepoSettings } from "./util/settingsUtils";
import { extractPersistBlocks, mergePersistBlocks } from "./util/persistUtils";
import { shouldUpdateContent, hasStatusChanged } from "./util/contentUtils";
import { FileHelpers } from "./util/file-helpers";
import { FolderPathManager } from "./folder-path-manager";
import { CleanupManager } from "./cleanup-manager";
import { ContentGenerator } from "./content-generator";

export class IssueFileManager {
	private fileHelpers: FileHelpers;
	private folderPathManager: FolderPathManager;
	private cleanupManager: CleanupManager;
	private contentGenerator: ContentGenerator;

	constructor(
		private app: App,
		private settings: GitHubTrackerSettings,
		private noticeManager: NoticeManager,
		private gitHubClient: GitHubClient,
	) {
		this.fileHelpers = new FileHelpers(app, noticeManager);
		this.folderPathManager = new FolderPathManager();
		this.cleanupManager = new CleanupManager(app, settings, noticeManager);
		this.contentGenerator = new ContentGenerator(this.fileHelpers);
	}

	/**
	 * Create issue files for a repository
	 */
	public async createIssueFiles(
		repo: RepositoryTracking,
		openIssues: any[],
		allIssuesIncludingRecentlyClosed: any[],
		_currentIssueNumbers: Set<string>,
	): Promise<void> {
		// Apply global defaults to repository settings
		const effectiveRepo = getEffectiveRepoSettings(repo, this.settings.globalDefaults);

		const [owner, repoName] = effectiveRepo.repository.split("/");
		if (!owner || !repoName) return;
		const repoCleaned = repoName.replace(/\//g, "-");
		const ownerCleaned = owner.replace(/\//g, "-");
		await this.cleanupManager.cleanupDeletedIssues(
			effectiveRepo,
			ownerCleaned,
			repoCleaned,
			allIssuesIncludingRecentlyClosed,
		);

		// Batch fetch project data if tracking is enabled globally
		let projectDataMap = new Map<string, ProjectData[]>();
		if (this.settings.enableProjectTracking) {
			const nodeIds = openIssues
				.filter((issue: any) => issue.node_id)
				.map((issue: any) => issue.node_id);

			if (nodeIds.length > 0) {
				this.noticeManager.debug(
					`Fetching project data for ${nodeIds.length} issues`
				);
				projectDataMap = await this.gitHubClient.fetchProjectDataForItems(nodeIds);
			}
		}

		// Get tracked project IDs from global settings
		const trackedProjectIds = this.settings.trackedProjects.map(p => p.id);

		// Create or update issue files (openIssues contains filtered issues from main.ts)
		for (const issue of openIssues) {
			let projectData = issue.node_id ? projectDataMap.get(issue.node_id) : undefined;

			// Filter by tracked projects from global settings
			if (projectData && trackedProjectIds.length > 0) {
				projectData = projectData.filter(p =>
					trackedProjectIds.includes(p.projectId)
				);
			}

			await this.createOrUpdateIssueFile(
				effectiveRepo,
				ownerCleaned,
				repoCleaned,
				issue,
				projectData,
			);
		}
	}

	private async createOrUpdateIssueFile(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		issue: any,
		projectData?: ProjectData[],
	): Promise<void> {
		// Generate filename using template
		const templateData = createIssueTemplateData(issue, repo.repository);
		const baseFileName = processFilenameTemplate(
			repo.issueNoteTemplate || "Issue - {number}",
			templateData,
			this.settings.dateFormat
		);
		const fileName = `${baseFileName}.md`;
		const issueFolderPath = this.folderPathManager.getIssueFolderPath(repo, ownerCleaned, repoCleaned);

		// Ensure folder structure exists
		if (repo.useCustomIssueFolder && repo.customIssueFolder && repo.customIssueFolder.trim()) {
			// For custom folders, just ensure the custom path exists
			await this.fileHelpers.ensureFolderExists(repo.customIssueFolder.trim());
		} else {
			// For default structure, ensure nested path exists
			await this.fileHelpers.ensureFolderExists(repo.issueFolder);
			await this.fileHelpers.ensureFolderExists(`${repo.issueFolder}/${ownerCleaned}`);
			await this.fileHelpers.ensureFolderExists(`${repo.issueFolder}/${ownerCleaned}/${repoCleaned}`);
		}

		const file = this.app.vault.getAbstractFileByPath(`${issueFolderPath}/${fileName}`);

		const [owner, repoName] = repo.repository.split("/");

		// Only fetch comments if they should be included
		let comments: any[] = [];
		if (repo.includeIssueComments) {
			comments = await this.gitHubClient.fetchIssueComments(
				owner,
				repoName,
				issue.number,
			);
		} else {
			this.noticeManager.debug(
				`Skipping comments for issue ${issue.number}: repository setting disabled`,
			);
		}

		let content = await this.contentGenerator.createIssueContent(issue, repo, comments, this.settings, projectData);

		if (file) {
			if (file instanceof TFile) {
				// Use current repository updateMode setting (not the old value from file properties)
				const updateMode = repo.issueUpdateMode;

				// Read existing content to check for changes
				const existingContent = await this.app.vault.read(file);

				// Check if status has changed (e.g., open -> closed)
				const statusHasChanged = hasStatusChanged(existingContent, issue.state);

				// If status changed, always update regardless of updateMode
				// Otherwise, respect the updateMode setting
				if (statusHasChanged || updateMode === "update") {
					// Check if content needs updating based on updated_at field
					if (!statusHasChanged && !shouldUpdateContent(existingContent, issue.updated_at)) {
						this.noticeManager.debug(
							`Skipped update for issue ${issue.number}: no changes detected (updated_at match)`
						);
						return;
					}

					// Extract persist blocks from existing content
					const persistBlocks = extractPersistBlocks(existingContent);

					// Create the complete new content with updated frontmatter
					let updatedContent = await this.contentGenerator.createIssueContent(
						issue,
						repo,
						comments,
						this.settings,
						projectData,
					);

					// Merge persist blocks back into new content
					if (persistBlocks.size > 0) {
						updatedContent = mergePersistBlocks(updatedContent, existingContent, persistBlocks);
						this.noticeManager.debug(
							`Restored ${persistBlocks.size} persist block(s) for issue ${issue.number}`
						);
					}

					await this.app.vault.modify(file, updatedContent);
					if (statusHasChanged) {
						this.noticeManager.debug(`Updated issue ${issue.number} (status changed to ${issue.state})`);
					} else {
						this.noticeManager.debug(`Updated issue ${issue.number}`);
					}
				} else if (updateMode === "append") {
					const shouldEscapeHashTags = repo.ignoreGlobalSettings ? repo.escapeHashTags : this.settings.escapeHashTags;
					content = `---\n### New status: "${
						issue.state
					}"\n\n# ${escapeBody(
						issue.title,
						this.settings.escapeMode,
						false,
					)}\n${
						issue.body
							? escapeBody(issue.body, this.settings.escapeMode, shouldEscapeHashTags)
							: "No description found"
					}\n`;

					if (comments.length > 0) {
						content += this.fileHelpers.formatComments(
							comments,
							this.settings.escapeMode,
							this.settings.dateFormat,
							shouldEscapeHashTags,
						);
					}
					const currentFileContent = await this.app.vault.read(file);
					const newContent = currentFileContent + "\n\n" + content;
					await this.app.vault.modify(file, newContent);
					this.noticeManager.debug(
						`Appended content to issue ${issue.number}`,
					);
				} else {
					this.noticeManager.debug(
						`Skipped update for issue ${issue.number} (mode: ${updateMode})`,
					);
				}
			}
		} else {
			await this.app.vault.create(`${issueFolderPath}/${fileName}`, content);
			this.noticeManager.debug(`Created issue file for ${issue.number}`);
		}
	}

	public async cleanupEmptyIssueFolder(
		repo: RepositoryTracking,
		issueFolder: string,
		ownerCleaned: string,
	): Promise<void> {
		return this.cleanupManager.cleanupEmptyIssueFolder(repo, issueFolder, ownerCleaned);
	}
}
