import { Notice } from "obsidian";
import { IssueTrackerSettings } from "./types";

export type NoticeLevel = "error" | "warning" | "info" | "success" | "debug";

export class NoticeManager {
	private providerPrefix = "GitHub";

	constructor(private settings: IssueTrackerSettings) {}

	/**
	 * Set the provider prefix used in debug console output (e.g. "GitHub" or "GitLab")
	 */
	public setProviderPrefix(prefix: string): void {
		this.providerPrefix = prefix;
	}

	/**
	 * Show a notice based on the current notification mode and provided level
	 *
	 * @param message The message to show
	 * @param level The notice level
	 * @param forceShow Force showing the notice regardless of mode
	 */
	public showNotice(
		message: string,
		level: NoticeLevel = "info",
		forceShow = false,
	): void {
		if (this.settings.syncNoticeMode === "debug") {
			const prefix = `[${this.providerPrefix}] ${level.toUpperCase()}:`;
			if (level === "error") {
				console.error(prefix, message);
			} else if (level === "warning") {
				console.warn(prefix, message);
			} else {
				console.log(prefix, message);
			}
		}

		let shouldShow = forceShow;

		if (!shouldShow) {
			switch (this.settings.syncNoticeMode) {
				case "minimal":
					shouldShow = level === "error";
					break;
				case "normal":
					shouldShow =
						level === "error" ||
						level === "warning" ||
						level === "success";
					break;
				case "extensive":
					shouldShow = level !== "debug";
					break;
				case "debug":
					shouldShow = true;
					break;
			}
		}

		if (shouldShow) {
			new Notice(message);
		}
	}

	/**
	 * Log a debug message - only appears in console with debug mode
	 */
	public debug(message: string): void {
		if (this.settings.syncNoticeMode === "debug") {
			this.showNotice(message, "debug");
		}
	}

	/**
	 * Show an error notice
	 */
	public error(message: string, error?: Error | unknown): void {
		let fullMessage = message;

		if (error instanceof Error) {
			fullMessage += `: ${error.message}`;

			if (this.settings.syncNoticeMode === "debug") {
				console.error(`[${this.providerPrefix}] ERROR:`, error);
			}
		}

		this.showNotice(fullMessage, "error");
	}

	/**
	 * Show a warning notice
	 */
	public warning(message: string): void {
		this.showNotice(message, "warning");
	}

	/**
	 * Show an info notice
	 */
	public info(message: string): void {
		this.showNotice(message, "info");
	}

	/**
	 * Show a success notice
	 */
	public success(message: string): void {
		this.showNotice(message, "success");
	}
}
