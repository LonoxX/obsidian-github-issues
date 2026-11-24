import { App, Modal, Notice, setIcon } from "obsidian";

export interface ConfirmModalOptions {
	title: string;
	/** Text before the highlighted name, e.g. "Remove". */
	message: string;
	/** Name shown highlighted after the message, followed by "?". */
	highlight?: string;
	/** Secondary explanation below the question. */
	details?: string;
	/** Affected items listed below the details. */
	items?: string[];
	confirmText: string;
	confirmIcon?: string;
	/** "danger" for irreversible removals, "warning" for risky changes. */
	tone?: "danger" | "warning";
	onConfirm: () => Promise<void> | void;
	/** Called when the modal closes without confirmation (button, Esc, X). */
	onCancel?: () => void;
}

const MAX_LISTED_ITEMS = 8;

/**
 * Shared confirmation dialog for destructive or risky actions. Cancel has the
 * initial focus so Enter on an untouched dialog never deletes by accident;
 * Enter confirms only once the confirm button has focus or via Mod+Enter.
 */
export class ConfirmModal extends Modal {
	private confirmed = false;
	private busy = false;

	constructor(
		app: App,
		private options: ConfirmModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { options } = this;
		const tone = options.tone ?? "danger";

		this.modalEl.addClass(
			"github-issues-modal",
			"github-issues-confirm-modal",
		);
		this.setTitle(options.title);

		const body = this.contentEl.createDiv("github-issues-confirm-body");

		const text = body.createDiv("github-issues-confirm-text");
		const question = text.createEl("p", {
			cls: "github-issues-confirm-question",
			text: options.highlight ? `${options.message} ` : options.message,
		});
		if (options.highlight) {
			question.createSpan({
				cls: `github-issues-confirm-highlight github-issues-confirm-highlight-${tone}`,
				text: options.highlight,
			});
			question.appendText("?");
		}

		if (options.details) {
			text.createEl("p", {
				cls: "github-issues-confirm-details",
				text: options.details,
			});
		}

		if (options.items?.length) {
			const list = text.createEl("ul", {
				cls: "github-issues-confirm-list",
			});
			for (const item of options.items.slice(0, MAX_LISTED_ITEMS)) {
				list.createEl("li", { text: item });
			}
			const rest = options.items.length - MAX_LISTED_ITEMS;
			if (rest > 0) {
				list.createEl("li", {
					cls: "github-issues-confirm-more",
					text: `and ${rest} more`,
				});
			}
		}

		const buttons = this.contentEl.createDiv("modal-button-container");
		const cancelButton = buttons.createEl("button", { text: "Cancel" });
		cancelButton.onclick = () => this.close();

		const confirmButton = buttons.createEl("button", {
			cls: tone === "danger" ? "mod-warning" : "mod-cta",
		});
		if (options.confirmIcon) {
			setIcon(
				confirmButton.createSpan({ cls: "github-issues-button-icon" }),
				options.confirmIcon,
			);
		}
		confirmButton.createSpan({ text: options.confirmText });

		const confirm = async () => {
			if (this.busy) return;
			this.busy = true;
			cancelButton.disabled = true;
			confirmButton.disabled = true;
			try {
				await options.onConfirm();
				this.confirmed = true;
				this.close();
			} catch (error) {
				new Notice(`Action failed: ${(error as Error).message}`);
				this.busy = false;
				cancelButton.disabled = false;
				confirmButton.disabled = false;
			}
		};
		confirmButton.onclick = () => void confirm();
		this.scope.register(["Mod"], "Enter", () => {
			void confirm();
			return false;
		});

		window.setTimeout(() => cancelButton.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.confirmed) this.options.onCancel?.();
	}
}
