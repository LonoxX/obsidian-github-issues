import { App, TFile } from "obsidian";

export function extractProperties(app: App, file: TFile): Record<string, unknown> {
	const cache = app.metadataCache.getFileCache(file);
	return cache?.frontmatter || {};
}

export async function updateProperties(
	app: App,
	file: TFile,
	updater: (frontmatter: Record<string, unknown>) => void,
): Promise<void> {
	await app.fileManager.processFrontMatter(file, updater);
}
