export class UIHelpers {
	static setupTabSwitching(
		tab1: HTMLElement,
		tab2: HTMLElement,
		content1: HTMLElement,
		content2: HTMLElement,
	): void {
		tab1.onclick = () => {
			tab1.addClass("mod-cta");
			tab2.removeClass("mod-cta");
			content1.addClass("active");
			content2.removeClass("active");
		};
		tab2.onclick = () => {
			tab2.addClass("mod-cta");
			tab1.removeClass("mod-cta");
			content2.addClass("active");
			content1.removeClass("active");
		};
	}

	static getContrastColor(hexColor: string): string {
		const r = parseInt(hexColor.substr(0, 2), 16);
		const g = parseInt(hexColor.substr(2, 2), 16);
		const b = parseInt(hexColor.substr(4, 2), 16);
		const brightness = (r * 299 + g * 587 + b * 114) / 1000;
		return brightness > 128 ? "#000000" : "#ffffff";
	}
}
