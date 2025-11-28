import { App, TFile } from "obsidian";
import { format } from "date-fns";
import { escapeBody } from "./escapeUtils";
import { NoticeManager } from "../notice-manager";

export class FileHelpers {
	constructor(
		private app: App,
		private noticeManager: NoticeManager,
	) {}

	/**
	 * Load template content from a file
	 */
	public async loadTemplateContent(templatePath: string): Promise<string | null> {
		if (!templatePath || templatePath.trim() === "") {
			return null;
		}

		try {
			const templateFile = this.app.vault.getAbstractFileByPath(templatePath.trim());
			if (templateFile instanceof TFile) {
				return await this.app.vault.read(templateFile);
			}
		} catch (error) {
			this.noticeManager.warning(`Could not load template file: ${templatePath}`);
		}
		return null;
	}

	/**
	 * Ensure a folder exists, creating it if necessary
	 */
	public async ensureFolderExists(path: string): Promise<void> {
		// Guard against undefined or empty paths
		if (!path || path.trim() === "") {
			this.noticeManager.error("Cannot create folder: path is empty or undefined");
			return;
		}

		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!folder) {
			try {
				await this.app.vault.createFolder(path);
				this.noticeManager.debug(`Created folder: ${path}`);
			} catch (error) {
				// If creation failed, try again to ensure folder exists
				await this.app.vault.createFolder(path);
			}
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
			(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
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
}
