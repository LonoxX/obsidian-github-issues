import { App, TFile, TFolder } from "obsidian";
import { format } from "date-fns";
import { escapeBody } from "./escapeUtils";
import { NoticeManager } from "../notice-manager";
import {
	createIssueTemplateData,
	processFilenameTemplate,
} from "./templateUtils";

export class FileHelpers {
	constructor(
		private app: App,
		private noticeManager: NoticeManager,
	) {}

	/**
	 * Load template content from a file
	 */
	public async loadTemplateContent(
		templatePath: string,
	): Promise<string | null> {
		if (!templatePath || templatePath.trim() === "") {
			return null;
		}

		try {
			const templateFile = this.app.vault.getAbstractFileByPath(
				templatePath.trim(),
			);
			if (templateFile instanceof TFile) {
				return await this.app.vault.read(templateFile);
			}
		} catch (error) {
			this.noticeManager.warning(
				`Could not load template file: ${templatePath}`,
			);
		}
		return null;
	}

	/**
	 * Ensure a folder exists, creating it if necessary
	 */
	public async ensureFolderExists(path: string): Promise<void> {
		// Guard against undefined or empty paths
		if (!path || path.trim() === "") {
			this.noticeManager.error(
				"Cannot create folder: path is empty or undefined",
			);
			return;
		}

		// Normalize path separators to forward slashes for consistency
		const normalizedPath = path.replace(/\\/g, "/");
		let existing = this.app.vault.getAbstractFileByPath(normalizedPath);
		
		// Check if folder already exists
		if (existing instanceof TFolder) {
			return;
		}



		try {
			await this.app.vault.createFolder(normalizedPath);
			this.noticeManager.debug(`Created folder: ${normalizedPath}`);
		} catch (error: unknown) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			
			// Handle "Folder already exists" or other folder creation errors
			// Retry vault check with slight delay to allow cache to update
			const existsNow = this.app.vault.getAbstractFileByPath(normalizedPath);
			
			if (existsNow instanceof TFolder) {
				// Folder exists now, which is fine (concurrent creation or cache stale)
				return;
			}

			if (
				error instanceof Error &&
				error.message.includes("Folder already exists")
			) {
				// Expected case - folder was created successfully but Obsidian threw error anyway
				// This commonly happens when the vault cache is out of sync
				// Try one more time with a tiny delay to let cache update
				await new Promise(resolve => setTimeout(resolve, 10));
				const retryCheck = this.app.vault.getAbstractFileByPath(normalizedPath);
				if (retryCheck instanceof TFolder) {
					this.noticeManager.debug(
						`Folder created successfully: ${normalizedPath}`,
					);
					return;
				}
				// Even though cache says it doesn't exist, the folder was likely created
				// Continue anyway - subsequent operations will work since the folder actually exists
				return;
			}

			// Folder creation genuinely failed - rethrow
			throw error;
		}
	}

	/**
	 * Format comments section for issues and pull requests
	 */
	public formatComments(
		comments: any[],
		escapeMode: "disabled" | "normal" | "strict" | "veryStrict",
		dateFormat: string,
		escapeHashTags: boolean = false,
	): string {
		if (!comments || comments.length === 0) {
			return "";
		}

		comments.sort(
			(a, b) =>
				new Date(a.created_at).getTime() -
				new Date(b.created_at).getTime(),
		);

		let commentSection = "\n## Comments\n\n";

		comments.forEach((comment) => {
			const createdAt =
				dateFormat !== ""
					? format(new Date(comment.created_at), dateFormat)
					: new Date(comment.created_at).toLocaleString();

			const username = comment.user?.login || "Unknown User";

			if (comment.is_review_comment) {
				commentSection += `### ${username} commented on line ${
					comment.line || "N/A"
				} of file \`${comment.path || "unknown"}\` (${createdAt}):\n\n`;
			} else {
				commentSection += `### ${username} commented (${createdAt}):\n\n`;
			}

			commentSection += `${escapeBody(
				comment.body || "No content",
				escapeMode,
				escapeHashTags,
			)}\n\n---\n\n`;
		});

		return commentSection;
	}

	/**
	 * Enrich sub-issues with vault paths if the corresponding files exist
	 * This allows templates to use internal Obsidian links instead of GitHub URLs
	 */
	public async enrichSubIssuesWithVaultPaths(
		subIssues: any[],
		issueFolder: string,
		noteTemplate: string,
		repository: string,
		dateFormat: string,
		escapeMode: "disabled" | "normal" | "strict" | "veryStrict",
	): Promise<any[]> {
		if (!subIssues || subIssues.length === 0) {
			return subIssues;
		}

		return Promise.all(
			subIssues.map(async (subIssue) => {
				const templateData = createIssueTemplateData(
					{
						title: subIssue.title || "Untitled",
						number: subIssue.number,
						state: subIssue.state || "open",
						user: { login: subIssue.user?.login || "unknown" },
						created_at:
							subIssue.created_at || new Date().toISOString(),
						updated_at:
							subIssue.updated_at || new Date().toISOString(),
						html_url: subIssue.html_url || subIssue.url || "",
						body: subIssue.body || "",
						comments: 0,
						locked: false,
					},
					repository,
					[],
					dateFormat,
					escapeMode,
					false,
				);

				const expectedFilename = processFilenameTemplate(
					noteTemplate,
					templateData,
					dateFormat,
				);
				const expectedPath = `${issueFolder}/${expectedFilename}.md`;

				// Check if the file exists in the vault
				const file = this.app.vault.getAbstractFileByPath(expectedPath);
				if (file instanceof TFile) {
					return {
						...subIssue,
						vaultPath: expectedFilename,
					};
				}

				return subIssue;
			}),
		);
	}
}
