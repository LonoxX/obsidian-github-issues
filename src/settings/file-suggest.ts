import { App, AbstractInputSuggest, TAbstractFile } from "obsidian";

export class FileSuggest extends AbstractInputSuggest<TAbstractFile> {
	private inputElement: HTMLInputElement;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
	) {
		super(app, inputEl);
		this.inputElement = inputEl;
	}

	getSuggestions(inputStr: string): TAbstractFile[] {
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		const files: TAbstractFile[] = [];
		const lowerCaseInputStr = inputStr.toLowerCase();

		abstractFiles.forEach((file: TAbstractFile) => {
			if (
				file.path.endsWith('.md') &&
				file.path.toLowerCase().contains(lowerCaseInputStr)
			) {
				files.push(file);
			}
		});

		return files;
	}

	renderSuggestion(file: TAbstractFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TAbstractFile): void {
		try {
			if (this.inputElement) {
				this.inputElement.value = file.path;
				// Trigger input event to notify onChange handlers
				const event = new Event('input', { bubbles: true });
				this.inputElement.dispatchEvent(event);
				this.close();
			} else {
				console.error('FileSuggest: Input element is not available');
			}
		} catch (error) {
			console.error('FileSuggest: Error setting file value:', error);
		}
	}
}
