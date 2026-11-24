export class UIHelpers {
	static getContrastColor(hexColor: string): string {
		const r = parseInt(hexColor.substring(0, 2), 16);
		const g = parseInt(hexColor.substring(2, 4), 16);
		const b = parseInt(hexColor.substring(4, 6), 16);
		const brightness = (r * 299 + g * 587 + b * 114) / 1000;
		return brightness > 128 ? "#000000" : "#ffffff";
	}
}
