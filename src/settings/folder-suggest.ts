import { App, TFolder, AbstractInputSuggest, TAbstractFile } from "obsidian";

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private inputElement: HTMLInputElement;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
	) {
		super(app, inputEl);
		this.inputElement = inputEl;
	}

	getSuggestions(inputStr: string): TFolder[] {
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		const folders: TFolder[] = [];
		const lowerCaseInputStr = inputStr.toLowerCase();

		abstractFiles.forEach((folder: TAbstractFile) => {
			if (
				folder instanceof TFolder &&
				folder.path.toLowerCase().contains(lowerCaseInputStr)
			) {
				folders.push(folder);
			}
		});

		return folders;
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		try {
			if (this.inputElement) {
				this.inputElement.value = folder.path;
				// Trigger input event to notify onChange handlers
				const event = new Event('input', { bubbles: true });
				this.inputElement.dispatchEvent(event);
				this.close();
			} else {
				console.error('FolderSuggest: Input element is not available');
			}
		} catch (error) {
			console.error('FolderSuggest: Error setting folder value:', error);
		}
	}
}
