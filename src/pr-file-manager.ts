import { App, TFile } from "obsidian";
import { IssueTrackerSettings, RepositoryTracking } from "./types";
import { IssueComment, PullRequest } from "./providers/domain";
import { escapeBody } from "./util/escapeUtils";
import { NoticeManager } from "./notice-manager";
import { IssueProvider, ProviderExtraParams } from "./providers/provider";
import {
	createPullRequestTemplateData,
	processFilenameTemplate,
} from "./util/templateUtils";
import { getEffectiveRepoSettings } from "./util/settingsUtils";
import {
	parseRepository,
	sanitizeFolderSegment,
	sanitizeOwnerPath,
} from "./util/repo-path";
import { extractPersistBlocks, mergePersistBlocks } from "./util/persistUtils";
import { shouldUpdateContent, hasStatusChanged } from "./util/contentUtils";
import { FileHelpers } from "./util/file-helpers";
import { FolderPathManager } from "./folder-path-manager";
import { CleanupManager } from "./cleanup-manager";
import { ContentGenerator } from "./content-generator";

export class PullRequestFileManager {
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
	 * Create pull request files for a repository
	 */
	public async createPullRequestFiles(
		repo: RepositoryTracking,
		openPullRequests: PullRequest[],
		allPullRequestsIncludingRecentlyClosed: PullRequest[],
		_currentPRNumbers: Set<string>,
	): Promise<void> {
		// Apply global defaults to repository settings
		const effectiveRepo = getEffectiveRepoSettings(repo, this.settings);

		const { owner, repo: repoName } = parseRepository(
			effectiveRepo.repository,
		);
		if (!owner || !repoName) return;

		const repoCleaned = sanitizeFolderSegment(repoName);
		const ownerCleaned = sanitizeOwnerPath(owner);

		await this.cleanupManager.cleanupDeletedPullRequests(
			effectiveRepo,
			ownerCleaned,
			repoCleaned,
			allPullRequestsIncludingRecentlyClosed,
		);

		// Create or update pull request files (openPullRequests contains filtered PRs from main.ts)
		for (const pr of openPullRequests) {
			await this.createOrUpdatePullRequestFile(
				effectiveRepo,
				ownerCleaned,
				repoCleaned,
				pr,
			);
		}
	}

	private async createOrUpdatePullRequestFile(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		pr: PullRequest,
	): Promise<void> {
		// Generate filename using template
		const templateData = createPullRequestTemplateData(pr, repo.repository);
		const baseFileName = processFilenameTemplate(
			repo.pullRequestNoteTemplate || "PR - {number}",
			templateData,
			this.settings.dateFormat,
		);
		const fileName = `${baseFileName}.md`;
		const pullRequestFolderPath =
			this.folderPathManager.getPullRequestFolderPath(
				repo,
				ownerCleaned,
				repoCleaned,
			);

		// Ensure folder structure exists. createFolder creates nested paths
		// recursively, so a single call covers custom and default (owner may
		// itself be a nested GitLab group path).
		await this.fileHelpers.ensureFolderExists(pullRequestFolderPath);

		// Normalize folder path to use forward slashes for consistent vault lookups
		const normalizedPullRequestFolderPath = pullRequestFolderPath.replace(
			/\\/g,
			"/",
		);
		const file = this.app.vault.getAbstractFileByPath(
			`${normalizedPullRequestFolderPath}/${fileName}`,
		);

		const { owner, repo: repoName } = parseRepository(repo.repository);
		const extra: ProviderExtraParams | undefined = repo.gitlabProjectId
			? { gitlabProjectId: repo.gitlabProjectId }
			: undefined;

		// Only fetch comments if they should be included
		let comments: IssueComment[] = [];
		if (repo.includePullRequestComments) {
			comments = await this.provider.fetchPullRequestComments(
				owner,
				repoName,
				pr.number,
				extra,
			);
		} else {
			this.noticeManager.debug(
				`Skipping comments for PR ${pr.number}: repository setting disabled`,
			);
		}

		let content = await this.contentGenerator.createPullRequestContent(
			pr,
			repo,
			comments,
			this.settings,
		);

		if (file) {
			if (file instanceof TFile) {
				// Use current repository updateMode setting (not the old value from file properties)
				const updateMode = repo.pullRequestUpdateMode;

				// Read existing content to check for changes
				const existingContent = await this.app.vault.read(file);

				// Check if status has changed (e.g., open -> closed)
				const statusHasChanged = hasStatusChanged(
					existingContent,
					pr.state ?? "",
				);

				// If status changed, always update regardless of updateMode
				// Otherwise, respect the updateMode setting
				if (statusHasChanged || updateMode === "update") {
					// Check if content needs updating based on updated_at field
					if (
						!statusHasChanged &&
						!shouldUpdateContent(
							existingContent,
							pr.updated_at ?? "",
						)
					) {
						this.noticeManager.debug(
							`Skipped update for PR ${pr.number}: no changes detected (updated_at match)`,
						);
						return;
					}

					// Extract persist blocks from existing content
					const persistBlocks = extractPersistBlocks(existingContent);

					// Create the complete new content with updated frontmatter
					let updatedContent =
						await this.contentGenerator.createPullRequestContent(
							pr,
							repo,
							comments,
							this.settings,
						);

					// Merge persist blocks back into new content
					if (persistBlocks.size > 0) {
						updatedContent = mergePersistBlocks(
							updatedContent,
							existingContent,
							persistBlocks,
						);
						this.noticeManager.debug(
							`Restored ${persistBlocks.size} persist block(s) for PR ${pr.number}`,
						);
					}

					await this.app.vault.modify(file, updatedContent);
					if (statusHasChanged) {
						this.noticeManager.debug(
							`Updated PR ${pr.number} (status changed to ${pr.state})`,
						);
					} else {
						this.noticeManager.debug(`Updated PR ${pr.number}`);
					}
				} else if (updateMode === "append") {
					const shouldEscapeHashTags =
						repo.profileId !== "default"
							? repo.escapeHashTags
							: this.settings.escapeHashTags;
					content = `---\n### New status: "${
						pr.state ?? ""
					}"\n\n# ${escapeBody(
						pr.title ?? "",
						this.settings.escapeMode,
						false,
					)}\n${
						pr.body
							? escapeBody(
									pr.body,
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
						`Appended content to PR ${pr.number}`,
					);
				} else {
					this.noticeManager.debug(
						`Skipped update for PR ${pr.number} (mode: ${updateMode})`,
					);
				}
			}
		} else {
			// Normalize path to use forward slashes consistently
			const normalizedFolderPath = pullRequestFolderPath.replace(
				/\\/g,
				"/",
			);
			const filePathToCreate = `${normalizedFolderPath}/${fileName}`;

			try {
				await this.app.vault.create(filePathToCreate, content);
				this.noticeManager.debug(`Created PR file for ${pr.number}`);
			} catch (fileCreateError: unknown) {
				// Check if file exists due to stale cache
				const fileCheck =
					this.app.vault.getAbstractFileByPath(filePathToCreate);

				if (fileCheck instanceof TFile) {
					// File exists but wasn't detected before - update it
					await this.app.vault.modify(fileCheck, content);
					this.noticeManager.debug(
						`Updated existing PR file for ${pr.number} (file existed but cache was stale)`,
					);
					return;
				}

				// File creation genuinely failed - rethrow
				throw fileCreateError;
			}
		}
	}

	public async cleanupEmptyPullRequestFolder(
		repo: RepositoryTracking,
		pullRequestFolder: string,
		ownerCleaned: string,
	): Promise<void> {
		return this.cleanupManager.cleanupEmptyPullRequestFolder(
			repo,
			pullRequestFolder,
			ownerCleaned,
		);
	}
}
