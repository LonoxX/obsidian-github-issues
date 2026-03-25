import { App, TFile } from "obsidian";
import {
	IssueTrackerSettings,
	RepositoryTracking,
	TrackedProject,
	ProjectData,
} from "./types";
import { NoticeManager } from "./notice-manager";
import { IssueProvider } from "./providers/provider";
import { IssueFileManager } from "./issue-file-manager";
import { PullRequestFileManager } from "./pr-file-manager";
import { FilterManager } from "./filter-manager";
import { FolderPathManager } from "./folder-path-manager";
import { FileHelpers } from "./util/file-helpers";
import { escapeBody, escapeYamlString } from "./util/escapeUtils";
import { format } from "date-fns";
import {
	createIssueTemplateData,
	createPullRequestTemplateData,
	processContentTemplate,
	processFilenameTemplate,
	formatComments,
} from "./util/templateUtils";
import { extractPersistBlocks, mergePersistBlocks } from "./util/persistUtils";
import { getEffectiveProjectSettings } from "./util/settingsUtils";

export class FileManager {
	private issueFileManager: IssueFileManager;
	private prFileManager: PullRequestFileManager;
	private filterManager: FilterManager;
	private folderPathManager: FolderPathManager;
	private fileHelpers: FileHelpers;

	constructor(
		private app: App,
		private settings: IssueTrackerSettings,
		private noticeManager: NoticeManager,
		private provider: IssueProvider,
	) {
		this.issueFileManager = new IssueFileManager(
			app,
			settings,
			noticeManager,
			provider,
		);
		this.prFileManager = new PullRequestFileManager(
			app,
			settings,
			noticeManager,
			provider,
		);
		this.filterManager = new FilterManager(provider);
		this.folderPathManager = new FolderPathManager();
		this.fileHelpers = new FileHelpers(app, noticeManager);
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
		return this.issueFileManager.createIssueFiles(
			repo,
			openIssues,
			allIssuesIncludingRecentlyClosed,
			currentIssueNumbers,
		);
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
		return this.prFileManager.createPullRequestFiles(
			repo,
			openPullRequests,
			allPullRequestsIncludingRecentlyClosed,
			currentPRNumbers,
		);
	}

	public filterIssues(repo: RepositoryTracking, issues: any[]): any[] {
		return this.filterManager.filterIssues(repo, issues);
	}

	public filterPullRequests(
		repo: RepositoryTracking,
		pullRequests: any[],
	): any[] {
		return this.filterManager.filterPullRequests(repo, pullRequests);
	}

	public async cleanupEmptyFolders(): Promise<void> {
		try {
			for (const repo of this.settings.repositories) {
				const [owner, repoName] = repo.repository.split("/");
				if (!owner || !repoName) continue;

				const repoCleaned = repoName.replace(/\//g, "-");
				const ownerCleaned = owner.replace(/\//g, "-");
				const issueFolder = this.folderPathManager.getIssueFolderPath(
					repo,
					ownerCleaned,
					repoCleaned,
				);
				const pullRequestFolder =
					this.folderPathManager.getPullRequestFolderPath(
						repo,
						ownerCleaned,
						repoCleaned,
					);

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

	/**
	 * Create files for project items (issues and PRs from a GitHub Project)
	 */
	public async createProjectItemFiles(
		project: TrackedProject,
		items: any[],
	): Promise<void> {
		// Apply profile settings to get effective project configuration
		const effectiveProject = getEffectiveProjectSettings(
			project,
			this.settings,
		);

		const issueFolderPath =
			this.folderPathManager.getProjectIssueFolderPath(effectiveProject);
		const prFolderPath =
			this.folderPathManager.getProjectPullRequestFolderPath(
				effectiveProject,
			);

		if (!issueFolderPath && !prFolderPath) {
			this.noticeManager.debug(
				`No folder configured for project ${project.title}`,
			);
			return;
		}

		let createdCount = 0;
		let skippedNoContent = 0;
		let skippedNotIssueOrPr = 0;
		let skippedHiddenStatus = 0;
		let deletedHiddenCount = 0;

		const hiddenStatuses = new Set(project.hiddenStatuses || []);
		const skipHidden =
			effectiveProject.skipHiddenStatusesOnSync &&
			hiddenStatuses.size > 0;
		const hiddenItemUrls = new Set<string>();

		for (const item of items) {
			const content = item.content;
			if (!content) {
				skippedNoContent++;
				continue;
			}

			const isIssue = content.url?.includes("/issues/");
			const isPullRequest = content.url?.includes("/pull/");
			if (!isIssue && !isPullRequest) {
				skippedNotIssueOrPr++;
				continue;
			}

			// Extract status first to check if it should be skipped
			let status = "";
			if (item.fieldValues?.nodes) {
				for (const fieldValue of item.fieldValues.nodes) {
					if (
						fieldValue.field?.name === "Status" &&
						fieldValue.name
					) {
						status = fieldValue.name;
						break;
					}
				}
			}

			// Skip items with hidden statuses if enabled, and collect their URLs for cleanup
			if (skipHidden && hiddenStatuses.has(status || "No Status")) {
				skippedHiddenStatus++;
				if (content.url) {
					hiddenItemUrls.add(content.url);
				}
				continue;
			}

			const folderPath = isIssue ? issueFolderPath : prFolderPath;
			if (!folderPath) continue;

			await this.fileHelpers.ensureFolderExists(folderPath);

			const repository =
				this.extractRepositoryFromUrl(content.url) ||
				`${project.owner}/unknown`;
			const projectData = this.convertFieldValuesToProjectData(
				project,
				status,
				item.fieldValues?.nodes || [],
			);

			// Fetch sub-issues and parent issue for template support (only if enabled for project)
			let subIssues: any[] = [];
			let parentIssue: any = null;

			if (isIssue && effectiveProject.includeSubIssues) {
				const [owner, repoName] = repository.split("/");
				if (owner && repoName) {
					subIssues =
						(await this.provider.fetchSubIssues?.(
							owner,
							repoName,
							content.number,
						)) ?? [];
					parentIssue =
						(await this.provider.fetchParentIssue?.(
							owner,
							repoName,
							content.number,
						)) ?? null;

					// Enrich sub-issues with vault paths if they exist
					const noteTemplate =
						effectiveProject.issueNoteTemplate ||
						"Issue - {number} - {title}";
					subIssues =
						await this.fileHelpers.enrichSubIssuesWithVaultPaths(
							subIssues,
							folderPath,
							noteTemplate,
							repository,
							this.settings.dateFormat,
							this.settings.escapeMode,
						);
				}
			}

			const templateData = isIssue
				? createIssueTemplateData(
						this.convertToIssueFormat(content),
						repository,
						[],
						this.settings.dateFormat,
						this.settings.escapeMode,
						this.settings.escapeHashTags,
						[projectData],
						subIssues,
						parentIssue,
					)
				: createPullRequestTemplateData(
						this.convertToPullRequestFormat(content),
						repository,
						[],
						this.settings.dateFormat,
						this.settings.escapeMode,
						this.settings.escapeHashTags,
						[projectData],
					);

			const filenameTemplate = isIssue
				? effectiveProject.issueNoteTemplate ||
					"Issue - {number} - {title}"
				: effectiveProject.pullRequestNoteTemplate ||
					"PR - {number} - {title}";

			const baseFileName = processFilenameTemplate(
				filenameTemplate,
				templateData,
				this.settings.dateFormat,
			);
			const fileName = `${baseFileName}.md`;
			// Normalize folder path to use forward slashes for consistent vault lookups
			const normalizedFolderPath = folderPath.replace(/\\/g, "/");
			const filePath = `${normalizedFolderPath}/${fileName}`;

			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			let fileContent = await this.generateProjectItemContent(
				content,
				effectiveProject,
				status,
				isIssue,
				item.fieldValues?.nodes || [],
				subIssues,
				parentIssue,
			);

			if (existingFile && existingFile instanceof TFile) {
				const existingContent = await this.app.vault.read(existingFile);
				const persistBlocks = extractPersistBlocks(existingContent);
				if (persistBlocks.size > 0) {
					fileContent = mergePersistBlocks(
						fileContent,
						existingContent,
						persistBlocks,
					);
					this.noticeManager.debug(
						`Restored ${persistBlocks.size} persist block(s) for project item #${content.number}`,
					);
				}
				await this.app.vault.modify(existingFile, fileContent);
			} else {
				try {
					await this.app.vault.create(filePath, fileContent);
				} catch (fileCreateError: unknown) {
					const errorMsg = fileCreateError instanceof Error ? fileCreateError.message : String(fileCreateError);
					
					// Check if file exists due to stale cache
					const fileCheck = this.app.vault.getAbstractFileByPath(filePath);
					
					if (fileCheck instanceof TFile) {

						// File exists but wasn't detected before - update it
						const existingContent = await this.app.vault.read(fileCheck);
						await this.app.vault.modify(fileCheck, fileContent);
						this.noticeManager.debug(`Updated existing project item file for #${content.number} (file existed but cache was stale)`);
					} else {
						// File creation genuinely failed - rethrow
						throw fileCreateError;
					}
				}
			}
			createdCount++;
		}

		this.noticeManager.debug(
			`Project ${project.title}: Created ${createdCount} files, skipped ${skippedNoContent} drafts, ${skippedNotIssueOrPr} other, ${skippedHiddenStatus} hidden`,
		);

		// Clean up existing files for items that moved to a hidden status
		if (hiddenItemUrls.size > 0) {
			const foldersToScan = [issueFolderPath, prFolderPath].filter(
				Boolean,
			) as string[];
			const allFiles = this.app.vault.getMarkdownFiles();

			for (const file of allFiles) {
				const inProjectFolder = foldersToScan.some((f) =>
					file.path.startsWith(f + "/"),
				);
				if (!inProjectFolder) continue;

				try {
					const fileContent = await this.app.vault.read(file);
					const urlMatch = fileContent.match(
						/^url:\s*"?([^"\n]+)"?\s*$/m,
					);
					if (urlMatch && hiddenItemUrls.has(urlMatch[1])) {
						await this.app.fileManager.trashFile(file);
						deletedHiddenCount++;
						this.noticeManager.debug(
							`Deleted file for hidden-status item: ${file.path}`,
						);
					}
				} catch (error) {
					// File may have been deleted already, ignore
				}
			}

			if (deletedHiddenCount > 0) {
				this.noticeManager.debug(
					`Project ${project.title}: Removed ${deletedHiddenCount} file(s) for items moved to hidden statuses`,
				);
			}
		}
	}

	/**
	 * Generate content for a project item file
	 */
	private async generateProjectItemContent(
		content: any,
		project: TrackedProject,
		status: string,
		isIssue: boolean,
		fieldValues: any[],
		subIssues?: any[],
		parentIssue?: any,
	): Promise<string> {
		const shouldEscapeHashTags = this.settings.escapeHashTags;

		// Check if custom template is enabled
		const useCustomTemplate = isIssue
			? project.useCustomIssueContentTemplate
			: project.useCustomPullRequestContentTemplate;
		const templatePath = isIssue
			? project.issueContentTemplate
			: project.pullRequestContentTemplate;

		if (useCustomTemplate && templatePath) {
			const templateContent =
				await this.fileHelpers.loadTemplateContent(templatePath);
			if (templateContent) {
				// Convert project item data to template-compatible format
				const projectData = this.convertFieldValuesToProjectData(
					project,
					status,
					fieldValues,
				);

				// Create a pseudo-repository string for template compatibility
				const repository =
					this.extractRepositoryFromUrl(content.url) ||
					`${project.owner}/unknown`;

				// Create template data based on item type
				const templateData = isIssue
					? createIssueTemplateData(
							this.convertToIssueFormat(content),
							repository,
							[], // No comments for project items currently
							this.settings.dateFormat,
							this.settings.escapeMode,
							shouldEscapeHashTags,
							[projectData],
							subIssues,
							parentIssue,
						)
					: createPullRequestTemplateData(
							this.convertToPullRequestFormat(content),
							repository,
							[], // No comments for project items currently
							this.settings.dateFormat,
							this.settings.escapeMode,
							shouldEscapeHashTags,
							[projectData],
						);

				return processContentTemplate(
					templateContent,
					templateData,
					this.settings.dateFormat,
				);
			}
		}

		// Fallback to default format
		return this.generateDefaultProjectItemContent(
			content,
			project,
			status,
			isIssue,
			fieldValues,
			subIssues,
			parentIssue,
		);
	}

	/**
	 * Generate default content for project items (same format as repo issues/PRs)
	 */
	private generateDefaultProjectItemContent(
		content: any,
		project: TrackedProject,
		status: string,
		isIssue: boolean,
		fieldValues: any[],
		subIssues?: any[],
		parentIssue?: any,
	): string {
		const shouldEscapeHashTags = this.settings.escapeHashTags;
		const dateFormat = this.settings.dateFormat;

		// Format date helper
		const formatDate = (dateStr: string | undefined): string => {
			if (!dateStr) return "";
			const date = new Date(dateStr);
			if (dateFormat !== "") {
				return format(date, dateFormat);
			}
			return date.toLocaleString();
		};

		// Build frontmatter - same format as repo issues
		const title = escapeYamlString(content.title || "");
		const createdAt = formatDate(content.createdAt);
		const updatedAt = formatDate(content.updatedAt);
		const author = content.author?.login || "";
		const assignees =
			content.assignees?.nodes?.map((a: any) => `"${a.login}"`) || [];
		const labels =
			content.labels?.nodes?.map((l: any) => `"${l.name}"`) || [];

		let frontmatter = `---
title: "${title}"
number: ${content.number}
state: "${content.state || "open"}"
type: "${isIssue ? "issue" : "pr"}"
created: "${createdAt}"
updated: "${updatedAt}"
url: "${content.url || ""}"
opened_by: "${author}"
assignees: [${assignees.join(", ")}]
labels: [${labels.join(", ")}]
project: "${project.title}"
project_status: "${status}"`;

		// Add PR-specific fields
		if (!isIssue) {
			const reviewers =
				content.reviewRequests?.nodes?.map(
					(r: any) => `"${r.requestedReviewer?.login || ""}"`,
				) || [];
			frontmatter += `
requested_reviewers: [${reviewers.join(", ")}]`;
		}

		// Add parent issue if available
		if (parentIssue) {
			frontmatter += `
parent_issue: ${parentIssue.number}
parent_issue_url: "${parentIssue.url}"`;
		}

		// Add sub-issues metadata if available
		if (subIssues && subIssues.length > 0) {
			const closedCount = subIssues.filter(
				(si: any) => si.state === "closed",
			).length;
			const openCount = subIssues.length - closedCount;
			frontmatter += `
sub_issues: [${subIssues.map((si: any) => si.number).join(", ")}]
sub_issues_count: ${subIssues.length}
sub_issues_open: ${openCount}
sub_issues_closed: ${closedCount}`;
		}

		frontmatter += `
---

# ${escapeBody(content.title || "", this.settings.escapeMode, false)}
${
	content.body
		? escapeBody(
				content.body,
				this.settings.escapeMode,
				shouldEscapeHashTags,
			)
		: "_No description provided._"
}`;

		// Add sub-issues section if available
		if (subIssues && subIssues.length > 0) {
			frontmatter += `

## Sub-Issues
${subIssues
	.map((si: any) => {
		const statusIcon =
			si.state === "closed"
				? '<span class="github-issues-sub-issue-closed">●</span>'
				: '<span class="github-issues-sub-issue-open">●</span>';
		return `- ${statusIcon} [#${si.number} ${si.title}](${si.url})`;
	})
	.join("\n")}`;
		}

		// Add parent issue link if available
		if (parentIssue) {
			frontmatter += `

## Parent Issue
- [#${parentIssue.number} ${parentIssue.title}](${parentIssue.url})`;
		}

		return frontmatter;
	}

	/**
	 * Convert GraphQL field values to ProjectData format for template processing
	 */
	private convertFieldValuesToProjectData(
		project: TrackedProject,
		status: string,
		fieldValues: any[],
	): ProjectData {
		const customFields: Record<string, any> = {};
		let priority: string | undefined;
		let iteration:
			| { title: string; startDate: string; duration: number }
			| undefined;

		for (const fieldValue of fieldValues) {
			if (!fieldValue.field?.name) continue;
			const fieldName = fieldValue.field.name;

			if (fieldName.toLowerCase() === "priority" && fieldValue.name) {
				priority = fieldValue.name;
			} else if (
				fieldValue.title !== undefined &&
				fieldValue.startDate !== undefined
			) {
				// Iteration field
				iteration = {
					title: fieldValue.title,
					startDate: fieldValue.startDate,
					duration: fieldValue.duration || 14,
				};
			}

			// Add to custom fields
			let value: string | number | null = null;
			if (fieldValue.text !== undefined) {
				value = fieldValue.text;
			} else if (fieldValue.name !== undefined) {
				value = fieldValue.name;
			} else if (fieldValue.number !== undefined) {
				value = fieldValue.number;
			} else if (fieldValue.date !== undefined) {
				value = fieldValue.date;
			}

			if (value !== null) {
				customFields[fieldName] = {
					fieldName,
					type: this.inferFieldType(fieldValue),
					value,
				};
			}
		}

		return {
			projectId: project.id,
			projectTitle: project.title,
			projectNumber: project.number,
			projectUrl: project.url,
			status,
			priority,
			iteration,
			customFields,
		};
	}

	/**
	 * Infer field type from field value structure
	 */
	private inferFieldType(
		fieldValue: any,
	):
		| "text"
		| "number"
		| "date"
		| "single_select"
		| "iteration"
		| "user"
		| "labels" {
		if (
			fieldValue.title !== undefined &&
			fieldValue.startDate !== undefined
		) {
			return "iteration";
		}
		if (fieldValue.users?.nodes?.length > 0) {
			return "user";
		}
		if (fieldValue.labels?.nodes?.length > 0) {
			return "labels";
		}
		if (fieldValue.name !== undefined) {
			return "single_select";
		}
		if (fieldValue.number !== undefined) {
			return "number";
		}
		if (fieldValue.date !== undefined) {
			return "date";
		}
		return "text";
	}

	/**
	 * Extract repository (owner/repo) from GitHub URL
	 */
	private extractRepositoryFromUrl(url: string): string | null {
		if (!url) return null;
		const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\//);
		if (match) {
			return `${match[1]}/${match[2]}`;
		}
		return null;
	}

	/**
	 * Convert GraphQL project item content to issue format for template processing
	 */
	private convertToIssueFormat(content: any): any {
		return {
			title: content.title,
			number: content.number,
			state: content.state || "open",
			created_at: content.createdAt,
			updated_at: content.updatedAt,
			closed_at: content.closedAt,
			html_url: content.url,
			body: content.body || "",
			user: content.author,
			assignee: content.assignees?.nodes?.[0] || null,
			assignees: content.assignees?.nodes || [],
			labels:
				content.labels?.nodes?.map((l: any) => ({ name: l.name })) ||
				[],
			milestone: content.milestone,
			comments: 0,
			locked: false,
		};
	}

	/**
	 * Convert GraphQL project item content to pull request format for template processing
	 */
	private convertToPullRequestFormat(content: any): any {
		return {
			title: content.title,
			number: content.number,
			state: content.state || "open",
			created_at: content.createdAt,
			updated_at: content.updatedAt,
			closed_at: content.closedAt,
			merged_at: content.mergedAt,
			html_url: content.url,
			body: content.body || "",
			user: content.author,
			assignee: content.assignees?.nodes?.[0] || null,
			assignees: content.assignees?.nodes || [],
			requested_reviewers:
				content.reviewRequests?.nodes?.map(
					(r: any) => r.requestedReviewer,
				) || [],
			labels:
				content.labels?.nodes?.map((l: any) => ({ name: l.name })) ||
				[],
			milestone: content.milestone,
			comments: 0,
			locked: false,
			merged: content.merged || false,
			mergeable: content.mergeable,
			base: content.baseRefName
				? { ref: content.baseRefName }
				: undefined,
			head: content.headRefName
				? { ref: content.headRefName }
				: undefined,
		};
	}
}
