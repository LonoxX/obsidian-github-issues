import { App, TFile } from "obsidian";
import { IssueTrackerSettings, RepositoryTracking } from "./types";
import { escapeBody } from "./util/escapeUtils";
import { NoticeManager } from "./notice-manager";
import { IssueProvider, ProviderExtraParams } from "./providers/provider";
import {
	createIssueTemplateData,
	processFilenameTemplate,
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
		private settings: IssueTrackerSettings,
		private noticeManager: NoticeManager,
		private provider: IssueProvider,
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
		const effectiveRepo = getEffectiveRepoSettings(repo, this.settings);

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

		// Create or update issue files (openIssues contains filtered issues from main.ts)
		// Note: projectData is only added for project items, not for repository issues
		for (const issue of openIssues) {
			await this.createOrUpdateIssueFile(
				effectiveRepo,
				ownerCleaned,
				repoCleaned,
				issue,
			);
		}
	}

	private async createOrUpdateIssueFile(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		issue: any,
	): Promise<void> {
		// Generate filename using template
		const templateData = createIssueTemplateData(issue, repo.repository);
		const baseFileName = processFilenameTemplate(
			repo.issueNoteTemplate || "Issue - {number}",
			templateData,
			this.settings.dateFormat,
		);
		const fileName = `${baseFileName}.md`;
		const issueFolderPath = this.folderPathManager.getIssueFolderPath(
			repo,
			ownerCleaned,
			repoCleaned,
		);

		// Ensure folder structure exists
		if (
			repo.useCustomIssueFolder &&
			repo.customIssueFolder &&
			repo.customIssueFolder.trim()
		) {
			// For custom folders, just ensure the custom path exists
			await this.fileHelpers.ensureFolderExists(
				repo.customIssueFolder.trim(),
			);
		} else {
			// For default structure, ensure nested path exists
			const issueFolder = repo.issueFolder ?? "GitHub";
			await this.fileHelpers.ensureFolderExists(issueFolder);
			await this.fileHelpers.ensureFolderExists(
				`${issueFolder}/${ownerCleaned}`,
			);
			await this.fileHelpers.ensureFolderExists(
				`${issueFolder}/${ownerCleaned}/${repoCleaned}`,
			);
		}

		// Normalize folder path to use forward slashes for consistent vault lookups
		const normalizedIssueFolderPath = issueFolderPath.replace(/\\/g, "/");
		const file = this.app.vault.getAbstractFileByPath(
			`${normalizedIssueFolderPath}/${fileName}`,
		);

		const [owner, repoName] = repo.repository.split("/");
		const extra: ProviderExtraParams | undefined = repo.gitlabProjectId
			? { gitlabProjectId: repo.gitlabProjectId }
			: undefined;

		// Only fetch comments if they should be included
		let comments: any[] = [];
		if (repo.includeIssueComments) {
			comments = await this.provider.fetchIssueComments(
				owner,
				repoName,
				issue.number,
				extra,
			);
		} else {
			this.noticeManager.debug(
				`Skipping comments for issue ${issue.number}: repository setting disabled`,
			);
		}

		// Fetch sub-issues and parent issue for template support (only if enabled)
		let subIssues: any[] = [];
		let parentIssue: any = null;

		if (repo.includeSubIssues) {
			subIssues =
				(await this.provider.fetchSubIssues?.(
					owner,
					repoName,
					issue.number,
					extra,
				)) ?? [];
			parentIssue =
				(await this.provider.fetchParentIssue?.(
					owner,
					repoName,
					issue.number,
					extra,
				)) ?? null;

			// Enrich sub-issues with vault paths if they exist
			const issueFolder = this.folderPathManager.getIssueFolderPath(
				repo,
				owner,
				repoName,
			);
			const noteTemplate = repo.issueNoteTemplate || "Issue - {number}";
			subIssues = await this.fileHelpers.enrichSubIssuesWithVaultPaths(
				subIssues,
				issueFolder,
				noteTemplate,
				repo.repository,
				this.settings.dateFormat,
				this.settings.escapeMode,
			);
		}

		let content = await this.contentGenerator.createIssueContent(
			issue,
			repo,
			comments,
			this.settings,
			undefined, // projectData
			subIssues,
			parentIssue,
		);

		if (file) {
			if (file instanceof TFile) {
				// Use current repository updateMode setting (not the old value from file properties)
				const updateMode = repo.issueUpdateMode;

				// Read existing content to check for changes
				const existingContent = await this.app.vault.read(file);

				// Check if status has changed (e.g., open -> closed)
				const statusHasChanged = hasStatusChanged(
					existingContent,
					issue.state,
				);

				// If status changed, always update regardless of updateMode
				// Otherwise, respect the updateMode setting
				if (statusHasChanged || updateMode === "update") {
					// Check if content needs updating based on updated_at field
					if (
						!statusHasChanged &&
						!shouldUpdateContent(existingContent, issue.updated_at)
					) {
						this.noticeManager.debug(
							`Skipped update for issue ${issue.number}: no changes detected (updated_at match)`,
						);
						return;
					}

					// Extract persist blocks from existing content
					const persistBlocks = extractPersistBlocks(existingContent);

					// Create the complete new content with updated frontmatter
					let updatedContent =
						await this.contentGenerator.createIssueContent(
							issue,
							repo,
							comments,
							this.settings,
							undefined, // projectData
							subIssues,
							parentIssue,
						);

					// Merge persist blocks back into new content
					if (persistBlocks.size > 0) {
						updatedContent = mergePersistBlocks(
							updatedContent,
							existingContent,
							persistBlocks,
						);
						this.noticeManager.debug(
							`Restored ${persistBlocks.size} persist block(s) for issue ${issue.number}`,
						);
					}

					await this.app.vault.modify(file, updatedContent);
					if (statusHasChanged) {
						this.noticeManager.debug(
							`Updated issue ${issue.number} (status changed to ${issue.state})`,
						);
					} else {
						this.noticeManager.debug(
							`Updated issue ${issue.number}`,
						);
					}
				} else if (updateMode === "append") {
					const shouldEscapeHashTags =
						repo.profileId !== "default"
							? repo.escapeHashTags
							: this.settings.escapeHashTags;
					content = `---\n### New status: "${
						issue.state
					}"\n\n# ${escapeBody(
						issue.title,
						this.settings.escapeMode,
						false,
					)}\n${
						issue.body
							? escapeBody(
									issue.body,
									this.settings.escapeMode,
									shouldEscapeHashTags,
								)
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
			// Normalize path to use forward slashes consistently
			const normalizedFolderPath = issueFolderPath.replace(/\\/g, "/");
			const filePathToCreate = `${normalizedFolderPath}/${fileName}`;
			
			try {
				await this.app.vault.create(filePathToCreate, content);
				this.noticeManager.debug(`Created issue file for ${issue.number}`);
			} catch (fileCreateError: unknown) {
				const errorMsg = fileCreateError instanceof Error ? fileCreateError.message : String(fileCreateError);
				
				// Check if file exists due to stale cache
				const fileCheck = this.app.vault.getAbstractFileByPath(filePathToCreate);
				
				if (fileCheck instanceof TFile) {
					// File exists but wasn't detected before - update it
					const existingContent = await this.app.vault.read(fileCheck);
					await this.app.vault.modify(fileCheck, content);
					this.noticeManager.debug(`Updated existing issue file for ${issue.number} (file existed but cache was stale)`);
					return;
				}
				
				// File creation genuinely failed - rethrow
				throw fileCreateError;
			}
		}
	}

	public async cleanupEmptyIssueFolder(
		repo: RepositoryTracking,
		issueFolder: string,
		ownerCleaned: string,
	): Promise<void> {
		return this.cleanupManager.cleanupEmptyIssueFolder(
			repo,
			issueFolder,
			ownerCleaned,
		);
	}
}
