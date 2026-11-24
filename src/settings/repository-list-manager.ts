import { App, Notice } from "obsidian";
import {
	RepositoryTracking,
	DEFAULT_REPOSITORY_TRACKING,
	ProviderId,
} from "../types";
import IssueTrackerPlugin from "../main";

export class RepositoryListManager {
	private selectedRepositories: Set<string> = new Set();

	constructor(
		private app: App,
		private plugin: IssueTrackerPlugin,
	) {}

	async addRepository(
		repoName: string,
		profileId?: string,
		provider?: ProviderId,
		gitlabProjectId?: number,
	): Promise<void> {
		if (
			this.plugin.settings.repositories.some(
				(r) =>
					r.repository === repoName &&
					r.provider === (provider || "github"),
			)
		) {
			new Notice("This repository is already being tracked");
			return;
		}

		const newRepo: RepositoryTracking = {
			...DEFAULT_REPOSITORY_TRACKING,
			repository: repoName,
			profileId: profileId || "default",
			provider: provider || "github",
		};
		if (gitlabProjectId !== undefined) {
			newRepo.gitlabProjectId = gitlabProjectId;
		}
		this.plugin.settings.repositories.push(newRepo);
		await this.plugin.saveSettings();
		new Notice(`Added repository: ${repoName}`);
	}

	async addMultipleRepositories(
		repoNames: string[],
		profileIds?: Map<string, string>,
		provider?: ProviderId,
		gitlabProjectIds?: Map<string, number>,
	): Promise<void> {
		const pid = provider || "github";
		const newRepos: string[] = [];
		const existingRepos: string[] = [];
		for (const repoName of repoNames) {
			if (
				this.plugin.settings.repositories.some(
					(r) => r.repository === repoName && r.provider === pid,
				)
			) {
				existingRepos.push(repoName);
			} else {
				newRepos.push(repoName);
			}
		}

		for (const repoName of newRepos) {
			const newRepo: RepositoryTracking = {
				...DEFAULT_REPOSITORY_TRACKING,
				repository: repoName,
				profileId: profileIds?.get(repoName) || "default",
				provider: pid,
			};
			const glId = gitlabProjectIds?.get(repoName);
			if (glId !== undefined) {
				newRepo.gitlabProjectId = glId;
			}
			this.plugin.settings.repositories.push(newRepo);
		}

		if (newRepos.length > 0) {
			await this.plugin.saveSettings();
		}

		if (newRepos.length > 0 && existingRepos.length > 0) {
			new Notice(
				`Added ${newRepos.length} repositories. ${existingRepos.length} were already tracked.`,
			);
		} else if (newRepos.length > 0) {
			new Notice(`Added ${newRepos.length} repositories successfully.`);
		} else if (existingRepos.length > 0) {
			new Notice(`All selected repositories are already being tracked.`);
		}
	}
}
