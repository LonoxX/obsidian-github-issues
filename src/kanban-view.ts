import { ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { GitHubTrackerSettings, ProjectData } from "./types";

export const KANBAN_VIEW_TYPE = "github-kanban-view";

export class GitHubKanbanView extends ItemView {
	private settings: GitHubTrackerSettings;
	private refreshInterval: NodeJS.Timeout | null = null;
	private projectDataCache: Map<string, any[]> = new Map();

	private normalizeUrl(url?: string): string | null {
		if (!url) return null;
		try {
			const u = new URL(url);
			let p = u.origin + u.pathname;
			// Remove trailing slash
			if (p.endsWith('/')) p = p.slice(0, -1);
			return p.toLowerCase();
		} catch {
			// Fallback: simple trim and toLower
			return url.replace(/\/$/, '').toLowerCase();
		}
	}

	/**
	 * Parse a frontmatter number value into a numeric ID (robust to strings and quoted values)
	 */
	private parseNumber(val: any): number | null {
		if (val === undefined || val === null) return null;
		if (typeof val === 'number') return val;
		const s = String(val).trim().replace(/^"|"$/g, '').replace(/[^0-9-]/g, '');
		if (s === '') return null;
		const n = Number(s);
		return isNaN(n) ? null : n;
	}
	private gitHubClient: any = null;

	constructor(leaf: WorkspaceLeaf, settings: GitHubTrackerSettings, gitHubClient: any) {
		super(leaf);
		this.settings = settings;
		this.gitHubClient = gitHubClient;
	}

	getViewType(): string {
		return KANBAN_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "GitHub Projects Kanban";
	}

	getIcon(): string {
		return "kanban";
	}

	async onOpen(): Promise<void> {
		await this.loadProjectDataCache();
		await this.render();
		this.startAutoRefresh();
	}

	async onClose(): Promise<void> {
		this.stopAutoRefresh();
	}

	private startAutoRefresh(): void {
		// Refresh every 5 minutes
		this.refreshInterval = setInterval(() => {
			this.render();
		}, 5 * 60 * 1000);
	}

	private stopAutoRefresh(): void {
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
			this.refreshInterval = null;
		}
	}

	async render(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();

		// Reload project data cache
		await this.loadProjectDataCache();

		// Header
		const header = container.createDiv("github-kanban-header");
		header.createEl("h2", { text: "GitHub Projects Kanban" });

		const refreshButton = header.createEl("button", {
			text: "🔄 Refresh",
			cls: "github-kanban-refresh-btn"
		});
		refreshButton.onclick = () => this.render();

		// Use all cached projects (including those not explicitly tracked)
		const cachedProjectIds = Array.from(this.projectDataCache.keys());
		if (cachedProjectIds.length === 0) {
			container.createEl("p", {
				text: "No project items found. Try refreshing or enable projects in settings.",
				cls: "github-kanban-empty"
			});
			return;
		}

		// Build project info objects from cache (use first item to get projectTitle/number/url)
		const projectsToRender: any[] = [];
		for (const projectId of cachedProjectIds) {
			const projectItems = this.projectDataCache.get(projectId) || [];
			if (projectItems.length === 0) continue;
			const sample = projectItems[0];
			projectsToRender.push({ id: projectId, title: sample.projectTitle || projectId, number: sample.projectNumber || 0, url: sample.projectUrl || '' });
		}

		// Create Kanban board for each discovered project
		for (const project of projectsToRender) {
			await this.renderProjectBoard(container, project);
		}
	}

	private async renderProjectBoard(container: Element, project: any): Promise<void> {
		const projectContainer = container.createDiv("github-kanban-project");
		projectContainer.createEl("h3", { text: `${project.title} (#${project.number})` });

		const boardContainer = projectContainer.createDiv("github-kanban-board");

		// Get issues/PRs for this project
		const items = await this.getProjectItems(project);

		// Group by status
		const statusColumns = this.groupItemsByStatus(items);

		// Create columns dynamically based on found statuses
		const allStatuses = Array.from(statusColumns.keys());
		// Sort statuses, put "No Status" at the end
		const sortedStatuses = allStatuses
			.filter(status => status !== "No Status")
			.sort()
			.concat(allStatuses.includes("No Status") ? ["No Status"] : []);

		for (const status of sortedStatuses) {
			const columnItems = statusColumns.get(status) || [];
			this.renderColumn(boardContainer, status, columnItems);
		}
	}

	private async loadProjectDataCache(): Promise<void> {
		this.projectDataCache.clear();

		// Build a deduplicated list of projects to fetch: include all tracked projects and all projects found in configured repositories
		const projectsToFetch = new Map<string, any>();

		// Include tracked projects (if any)
		for (const p of (this.settings.trackedProjects || [])) {
			projectsToFetch.set(p.id, { id: p.id, title: p.title, number: p.number, url: p.url });
		}

		// Also fetch projects directly from each configured repository (so we show ALL projects)
		for (const repoCfg of (this.settings.repositories || [])) {
			const [owner, repoName] = (repoCfg.repository || '').split('/');
			if (!owner || !repoName) continue;
			try {
				const repoProjects = await this.gitHubClient.fetchProjectsForRepository(owner, repoName);
				for (const rp of repoProjects) {
					if (!projectsToFetch.has(rp.id)) {
						projectsToFetch.set(rp.id, { id: rp.id, title: rp.title, number: rp.number, url: rp.url });
					}
				}
			} catch (err) {
				console.error(`Error fetching projects for ${repoCfg.repository}:`, err);
			}
		}

		// Now fetch items for each discovered project
		for (const [projectId, projInfo] of projectsToFetch.entries()) {
			try {
				const projectItems = await this.gitHubClient.fetchProjectItems(projectId);
				const itemsArray: any[] = [];
				for (const item of projectItems) {
					if (!item.content) continue;
					const contentUrl: string | undefined = item.content.url;
					const normalizedUrl = this.normalizeUrl(contentUrl) as string | null;

					// Parse custom fields
					const customFields: any = {};
					for (const fieldValue of item.fieldValues?.nodes || []) {
						if (!fieldValue.field?.name) continue;
						const fieldName = fieldValue.field.name;
						if (fieldValue.text !== undefined) {
							customFields[fieldName] = { fieldName, type: 'text', value: fieldValue.text };
						} else if (fieldValue.name !== undefined) {
							customFields[fieldName] = { fieldName, type: 'single_select', value: fieldValue.name };
						} else if (fieldValue.date !== undefined) {
							customFields[fieldName] = { fieldName, type: 'date', value: fieldValue.date };
						} else if (fieldValue.users?.nodes) {
							customFields[fieldName] = { fieldName, type: 'user', value: fieldValue.users.nodes.map((u: any) => u.login).join(', '), users: fieldValue.users.nodes.map((u: any) => u.login) };
						}
					}

					const projectData = {
						projectId: projectId,
						projectTitle: projInfo.title,
						projectNumber: projInfo.number,
						projectUrl: projInfo.url,
						itemId: item.id,
						number: item.content.number,
					title: item.content.title,
					url: contentUrl,
					normalizedUrl,
					customFields,
					status: customFields?.Status?.value ?? null
				};
				itemsArray.push(projectData);
				}

				this.projectDataCache.set(projectId, itemsArray);
				console.log(`Project ${projectId} cached ${itemsArray.length} items, sample:`, itemsArray.slice(0, 6).map(i => ({ number: i.number, url: i.url, normalizedUrl: i.normalizedUrl, status: i.status })));
			} catch (error) {
				console.error(`Error loading project data for ${projectId}:`, error);
			}
		}

		console.log(`Loaded project data cache for ${Array.from(this.projectDataCache.keys()).length} projects`);
	}

	private async getProjectItems(project: any): Promise<any[]> {
		const items: any[] = [];

		// Get all markdown files
		const files = this.app.vault.getMarkdownFiles();
		const matchedNumbers = new Set<number>();
		const matchedUrls = new Set<string>();

		for (const file of files) {
			try {
				// Read file content
				const content = await this.app.vault.read(file);

				// Parse frontmatter to get project data
				const frontmatter = this.parseFrontmatter(content);
				if (!frontmatter) continue;

				// Check if this is an issue or PR by looking at frontmatter
				const isIssue = frontmatter.number && frontmatter.title && frontmatter.state;
				if (!isIssue) continue;

				// Check project cache entries for this project
				const cachedItemsForProject = this.projectDataCache.get(project.id) || [];
				const itemUrl = frontmatter.url;
				const normalizedItemUrl = this.normalizeUrl(itemUrl);

				// Debug log
				if (itemUrl) console.log(`Checking item ${frontmatter.title} (${itemUrl}) in project ${project.id} (normalized: ${normalizedItemUrl})`);

// Try to find a match by number first (robust), then by normalized URL
			let fullProjectData: any = null;
			const fmNum = this.parseNumber(frontmatter.number);
			console.log(`Parsed frontmatter number for '${frontmatter.title}':`, frontmatter.number, '->', fmNum);
			if (fmNum !== null) {
				fullProjectData = cachedItemsForProject.find((ci: any) => Number(ci.number) === fmNum) || null;
					if (fullProjectData) matchedNumbers.add(fmNum);
				}
				if (!fullProjectData && normalizedItemUrl) {
					fullProjectData = cachedItemsForProject.find((ci: any) => ci.normalizedUrl === normalizedItemUrl) || null;
					if (fullProjectData && fullProjectData.normalizedUrl) matchedUrls.add(fullProjectData.normalizedUrl);
				}
				if (fullProjectData) {
					// Debug: print the matched project data for this item
					console.log(`Matched project data for ${frontmatter.title}:`, fullProjectData);
					// Extract status from top-level status or customFields.Status.value
					let projectStatus = fullProjectData?.status || fullProjectData?.customFields?.Status?.value || "No Status";

					// Extract item info with project details
					const item = {
						...frontmatter,
						file: file,
						title: frontmatter.title,
						number: frontmatter.number,
						state: frontmatter.state,
						labels: frontmatter.labels || [],
						pull_request: frontmatter.type === "pr",
						projectStatus: projectStatus,
						projectTitle: project.title,
						projectNumber: project.number,
						projectUrl: project.url,
						fullProjectData: fullProjectData
					};
					items.push(item);
				}
			} catch (error) {
				console.error(`Error processing file ${file.path}:`, error);
			}
		}


		// Add remote-only project items (those that are in the project but have no local file)
		const cachedItemsForProject = this.projectDataCache.get(project.id) || [];
		for (const ci of cachedItemsForProject) {
			const ciNum = Number(ci.number);
			const ciNorm = ci.normalizedUrl;
			if ((ciNum && matchedNumbers.has(ciNum)) || (ciNorm && matchedUrls.has(ciNorm))) continue;

			// Synthesize an item for display
			const synthetic: any = {
				title: ci.title || `#${ci.number}`,
				number: ci.number,
				state: ci.status || 'unknown',
				labels: [],
				pull_request: false,
				projectStatus: ci.status || 'No Status',
				projectTitle: project.title,
				projectNumber: project.number,
				projectUrl: project.url,
				fullProjectData: ci,
				remoteOnly: true,
				url: ci.url
			};
			items.push(synthetic);
		}

		return items;
	}

	private parseFrontmatter(content: string): any | null {
		const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
		const match = content.match(frontmatterRegex);
		if (!match) return null;

		try {
			const frontmatter = match[1];
			const lines = frontmatter.split('\n');
			const result: any = {};

			for (const line of lines) {
				const colonIndex = line.indexOf(':');
				if (colonIndex > 0) {
					const key = line.substring(0, colonIndex).trim();
					let value = line.substring(colonIndex + 1).trim();

					// Try to parse as JSON if it looks like an array/object
					if (value.startsWith('[') || value.startsWith('{')) {
						try {
							result[key] = JSON.parse(value);
						} catch {
							result[key] = value;
						}
					} else {
						result[key] = value;
					}
				}
			}

			return result;
		} catch (error) {
			console.error('Error parsing frontmatter:', error);
			return null;
		}
	}

	private groupItemsByStatus(items: any[]): Map<string, any[]> {
		const groups = new Map<string, any[]>();

		for (const item of items) {
			const status = item.projectStatus || "No Status";
			if (!groups.has(status)) {
				groups.set(status, []);
			}
			groups.get(status)!.push(item);
		}

		return groups;
	}

	private renderColumn(container: Element, status: string, items: any[]): void {
		const column = container.createDiv("github-kanban-column");
		column.createEl("h4", { text: `${status} (${items.length})` });

		const itemsContainer = column.createDiv("github-kanban-items");

		for (const item of items) {
			this.renderKanbanItem(itemsContainer, item);
		}
	}

	private renderKanbanItem(container: Element, item: any): void {
		const itemEl = container.createDiv("github-kanban-item");

		// Title
		const titleEl = itemEl.createEl("div", "github-kanban-item-title");
		titleEl.setText(item.title || "Untitled");

		// Number and type
		const metaEl = itemEl.createEl("div", "github-kanban-item-meta");
		const type = item.pull_request ? "PR" : "Issue";
		const number = item.number;
		metaEl.setText(`#${number} (${type})`);

		// Labels
		if (item.labels && item.labels.length > 0) {
			const labelsEl = itemEl.createEl("div", "github-kanban-item-labels");
			for (const label of item.labels.slice(0, 3)) { // Show max 3 labels
				const labelEl = labelsEl.createEl("span", "github-kanban-label");
				labelEl.setText(label.name);
				labelEl.style.backgroundColor = `#${label.color}`;
			}
		}

		// Show project status and custom fields
		if (item.projectStatus) {
			const statusBadge = itemEl.createEl('div', { cls: 'github-kanban-item-meta' });
			statusBadge.setText(`Project status: ${item.projectStatus}`);
		}

		if (item.fullProjectData?.customFields) {
			const cfEl = itemEl.createDiv('github-kanban-item-labels');
			for (const [key, val] of Object.entries(item.fullProjectData.customFields)) {
				const entry = cfEl.createEl('div', { cls: 'github-kanban-item-meta' });
				let vdisp = '';
				if (val && typeof val === 'object') {
					const fieldObj = val as any;
					vdisp = fieldObj.value ?? '';
				}
				entry.setText(`${key}: ${vdisp}`);
			}
		}

		// Show raw project item data (collapsible)
		if (item.fullProjectData) {
			const details = itemEl.createEl('details', { cls: 'github-kanban-item-meta' });
			details.createEl('summary', { text: 'Show raw project data' });
			const pre = details.createEl('pre');
			pre.setText(JSON.stringify(item.fullProjectData, null, 2));
		}

		// Make clickable to open the file
		itemEl.onclick = () => this.openItemFile(item);
	}

	private async openItemFile(item: any): Promise<void> {
		// Try to find the file by matching frontmatter number and repo
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			try {
				const content = await this.app.vault.read(file);
				const fm = this.parseFrontmatter(content);
				if (!fm) continue;
				// Match by number and (optionally) repo derived from URL
				if (fm.number && item.number && fm.number.toString() === item.number.toString()) {
					await this.app.workspace.getLeaf().openFile(file);
					return;
				}
			} catch (e) {
				// ignore
			}
		}

		new Notice(`File for #${item.number} not found in vault`);
	}
}
