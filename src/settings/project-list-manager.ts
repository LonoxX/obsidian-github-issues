import { App, Notice } from "obsidian";
import { TrackedProject, ProjectInfo } from "../types";
import IssueTrackerPlugin from "../main";

export class ProjectListManager {
	private selectedProjects: Set<string> = new Set();

	constructor(
		private app: App,
		private plugin: IssueTrackerPlugin,
	) {}

	async addMultipleProjects(projects: ProjectInfo[]): Promise<void> {
		const newProjects: ProjectInfo[] = [];
		const existingProjects: ProjectInfo[] = [];

		for (const project of projects) {
			if (
				this.plugin.settings.trackedProjects.some(
					(p) => p.id === project.id,
				)
			) {
				existingProjects.push(project);
			} else {
				newProjects.push(project);
			}
		}

		for (const project of newProjects) {
			const newProject: TrackedProject = {
				id: project.id,
				title: project.title,
				number: project.number,
				url: project.url,
				owner: project.owner || "",
				enabled: true,
				...(project.provider && project.provider !== "github"
					? { provider: project.provider }
					: {}),
			};
			this.plugin.settings.trackedProjects.push(newProject);
		}

		if (newProjects.length > 0) {
			await this.plugin.saveSettings();
		}

		if (newProjects.length > 0 && existingProjects.length > 0) {
			new Notice(
				`Added ${newProjects.length} projects. ${existingProjects.length} were already tracked.`,
			);
		} else if (newProjects.length > 0) {
			new Notice(`Added ${newProjects.length} projects successfully.`);
		} else if (existingProjects.length > 0) {
			new Notice(`All selected projects are already being tracked.`);
		}
	}
}
