import { ItemView, WorkspaceLeaf, TFile, Notice, setIcon } from "obsidian";
import { GitHubTrackerSettings, ProjectData, TrackedProject } from "./types";

export const KANBAN_VIEW_TYPE = "github-kanban-view";

export class GitHubKanbanView extends ItemView {
	private settings: GitHubTrackerSettings;
	private refreshInterval: NodeJS.Timeout | null = null;
	private projectDataCache: Map<string, any[]> = new Map();
	private activeProjectId: string | null = null;
	private loadedProjects: Set<string> = new Set(); // Track which projects have been loaded

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
		return "square-kanban";
	}

	async onOpen(): Promise<void> {
		// Don't load all projects at startup - just render the UI
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

		// Get tracked projects
		const trackedProjects = this.settings.trackedProjects || [];

		if (trackedProjects.length === 0) {
			container.createEl("p", {
				text: "No projects tracked. Go to Settings → GitHub Projects to add projects.",
				cls: "github-kanban-empty"
			});
			return;
		}

		// Tab bar
		const tabBar = container.createDiv("github-kanban-tabs github-kanban-tabs-inline");

		// Content container for the active project
		const contentContainer = container.createDiv("github-kanban-content");

		// Set first project as active if none selected
		if (!this.activeProjectId || !trackedProjects.find(p => p.id === this.activeProjectId)) {
			this.activeProjectId = trackedProjects[0].id;
		}

		// Create tabs
		for (const project of trackedProjects) {
			const tab = tabBar.createEl("button", {
				text: `${project.title}`,
				cls: `github-kanban-tab github-kanban-tab-styled${project.id === this.activeProjectId ? " active" : ""}`
			});

			// Show loading indicator if not yet loaded
			if (!this.loadedProjects.has(project.id)) {
				tab.textContent += " ○";
			}

			tab.onclick = async () => {
				this.activeProjectId = project.id;
				// Update tab styles
				tabBar.querySelectorAll(".github-kanban-tab").forEach((t: HTMLElement) => {
					t.removeClass("active");
				});
				tab.addClass("active");

				// Load and render the project
				await this.renderActiveProject(contentContainer);

				// Update tab to remove loading indicator
				if (this.loadedProjects.has(project.id)) {
					tab.textContent = `${project.title}`;
				}
			};
		}

		// Spacer to push refresh button to the right
		const spacer = tabBar.createDiv("github-kanban-spacer");

		// Refresh button (at the right of tab bar)
		const refreshButton = tabBar.createEl("button", {
			cls: "github-kanban-refresh-btn github-kanban-refresh-styled"
		});
		setIcon(refreshButton, "refresh-cw");
		refreshButton.onclick = async () => {
			// Clear cache for active project and reload
			if (this.activeProjectId) {
				this.projectDataCache.delete(this.activeProjectId);
				this.loadedProjects.delete(this.activeProjectId);
			}
			await this.renderActiveProject(contentContainer);
		};

		// Render the active project
		await this.renderActiveProject(contentContainer);
	}

	private async renderActiveProject(container: Element): Promise<void> {
		container.empty();

		if (!this.activeProjectId) {
			container.createEl("p", { text: "Select a project tab to view its board." });
			return;
		}

		const project = this.settings.trackedProjects?.find(p => p.id === this.activeProjectId);
		if (!project) {
			container.createEl("p", { text: "Project not found." });
			return;
		}

		// Show loading state if not cached
		if (!this.loadedProjects.has(this.activeProjectId)) {
			const loadingEl = container.createDiv("github-kanban-loading github-kanban-loading-styled");
			loadingEl.createEl("p", { text: `Loading ${project.title}...` });

			// Load the project data
			await this.loadSingleProject(this.activeProjectId, project);
			this.loadedProjects.add(this.activeProjectId);

			container.empty();
		}

		// Render the project board
		await this.renderProjectBoard(container, {
			id: project.id,
			title: project.title,
			number: project.number,
			url: project.url
		});
	}

	private async loadSingleProject(projectId: string, project: TrackedProject): Promise<void> {
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

				// Extract labels from content
				const labels = item.content.labels?.nodes?.map((l: any) => ({
					name: l.name,
					color: l.color
				})) || [];

				const projectData = {
					projectId: projectId,
					projectTitle: project.title,
					projectNumber: project.number,
					projectUrl: project.url,
					itemId: item.id,
					number: item.content.number,
					title: item.content.title,
					body: item.content.body || '',
					author: item.content.author?.login || 'unknown',
					labels: labels,
					url: contentUrl,
					normalizedUrl,
					customFields,
					status: customFields?.Status?.value ?? null
				};
				itemsArray.push(projectData);
			}

			this.projectDataCache.set(projectId, itemsArray);
		} catch (error) {
			console.error(`Error loading project data for ${projectId}:`, error);
		}
	}

	private async renderProjectBoard(container: Element, project: any): Promise<void> {
		const projectContainer = container.createDiv("github-kanban-project");

		const boardContainer = projectContainer.createDiv("github-kanban-board");

		// Get issues/PRs for this project
		const items = await this.getProjectItems(project);

		// Group by status
		const statusColumns = this.groupItemsByStatus(items);

		// Get sorted statuses based on settings
		const sortedStatuses = this.getSortedStatuses(project.id, statusColumns);

		for (const status of sortedStatuses) {
			const columnItems = statusColumns.get(status) || [];
			this.renderColumn(boardContainer, status, columnItems);
		}
	}

	private getSortedStatuses(projectId: string, statusColumns: Map<string, any[]>): string[] {
		const statusesWithItems = Array.from(statusColumns.keys());

		// Find the tracked project settings
		const trackedProject = this.settings.trackedProjects?.find(p => p.id === projectId);

		if (!trackedProject) {
			// Fallback: alphabetical with "No Status" at end
			return this.defaultStatusSort(statusesWithItems);
		}

		// Determine the order to use (includes ALL statuses, even empty ones)
		let statusOrder: string[] = [];

		if (trackedProject.useCustomStatusOrder && trackedProject.customStatusOrder?.length) {
			// Use custom order
			statusOrder = trackedProject.customStatusOrder;
		} else if (trackedProject.statusOptions?.length) {
			// Use GitHub API order
			statusOrder = trackedProject.statusOptions.map(opt => opt.name);
		}

		if (statusOrder.length === 0) {
			// No order defined, use default
			return this.defaultStatusSort(statusesWithItems);
		}

		// Check settings
		const showEmptyColumns = trackedProject.showEmptyColumns ?? true;
		const hiddenStatuses = new Set(trackedProject.hiddenStatuses || []);

		const orderedStatuses: string[] = [];
		const remainingStatuses = new Set(statusesWithItems);

		// Add statuses from the defined order
		for (const status of statusOrder) {
			// Skip hidden statuses
			if (hiddenStatuses.has(status)) {
				remainingStatuses.delete(status);
				continue;
			}
			// Only add if it has items OR showEmptyColumns is true
			if (showEmptyColumns || remainingStatuses.has(status)) {
				orderedStatuses.push(status);
			}
			remainingStatuses.delete(status);
		}

		// Add any remaining statuses that have items but aren't in the order (except "No Status" and hidden ones)
		const remaining = Array.from(remainingStatuses)
			.filter(s => s !== "No Status" && !hiddenStatuses.has(s))
			.sort();
		orderedStatuses.push(...remaining);

		// Always put "No Status" at the end if it has items and is not hidden
		if (remainingStatuses.has("No Status") && !hiddenStatuses.has("No Status")) {
			orderedStatuses.push("No Status");
		}

		return orderedStatuses;
	}

	private defaultStatusSort(statuses: string[]): string[] {
		return statuses
			.filter(status => status !== "No Status")
			.sort()
			.concat(statuses.includes("No Status") ? ["No Status"] : []);
	}

	private async getProjectItems(project: any): Promise<any[]> {
		const items: any[] = [];

		const trackedProject = this.settings.trackedProjects?.find(p => p.id === project.id);

		const processFolder = (folder: string | undefined): string | undefined => {
			if (!folder) return undefined;
			const sanitize = (str: string) => str.replace(/[<>:"|?*\\]/g, "-").replace(/\.\./g, ".").trim();
			return folder
				.replace(/\{project\}/g, sanitize(project.title || ""))
				.replace(/\{owner\}/g, sanitize(project.owner || ""))
				.replace(/\{project_number\}/g, (project.number || "").toString());
		};

		const issueFolder = processFolder(
			trackedProject?.useCustomIssueFolder
				? trackedProject?.customIssueFolder
				: trackedProject?.issueFolder
		);
		const prFolder = processFolder(
			trackedProject?.useCustomPullRequestFolder
				? trackedProject?.customPullRequestFolder
				: trackedProject?.pullRequestFolder
		);

		const files = this.app.vault.getMarkdownFiles();
		const matchedNumbers = new Set<number>();
		const matchedUrls = new Set<string>();
		const cachedItemsForProject = this.projectDataCache.get(project.id) || [];

		const isFileInProjectFolder = (filePath: string): boolean => {
			if (issueFolder && filePath.startsWith(issueFolder + "/")) return true;
			if (prFolder && filePath.startsWith(prFolder + "/")) return true;
			return false;
		};

		const hasAnyProjectFolder = !!(issueFolder || prFolder);

		for (const file of files) {
			try {
				if (hasAnyProjectFolder && !isFileInProjectFolder(file.path)) {
					continue;
				}

				const content = await this.app.vault.read(file);
				const frontmatter = this.parseFrontmatter(content);
				if (!frontmatter) continue;

				const isIssue = frontmatter.number && frontmatter.title && frontmatter.state;
				if (!isIssue) continue;

				const isInProjectFolder = hasAnyProjectFolder;
				const fileMatchesProject = frontmatter.project === project.title;
				const itemUrl = frontmatter.url;
				const normalizedItemUrl = this.normalizeUrl(itemUrl);

				let fullProjectData: any = null;
				const fmNum = this.parseNumber(frontmatter.number);
				if (fmNum !== null) {
					fullProjectData = cachedItemsForProject.find((ci: any) => Number(ci.number) === fmNum) || null;
					if (fullProjectData) matchedNumbers.add(fmNum);
				}
				if (!fullProjectData && normalizedItemUrl) {
					fullProjectData = cachedItemsForProject.find((ci: any) => ci.normalizedUrl === normalizedItemUrl) || null;
					if (fullProjectData && fullProjectData.normalizedUrl) matchedUrls.add(fullProjectData.normalizedUrl);
				}

				if (isInProjectFolder || fullProjectData || fileMatchesProject) {
					let projectStatus = frontmatter.project_status
						|| fullProjectData?.status
						|| fullProjectData?.customFields?.Status?.value
						|| "No Status";

					const item = {
						...frontmatter,
						file: file,
						title: frontmatter.title,
						number: frontmatter.number,
						state: frontmatter.state,
						labels: fullProjectData?.labels || frontmatter.labels || [],
						body: fullProjectData?.body || '',
						author: fullProjectData?.author || frontmatter.opened_by || frontmatter.author || 'unknown',
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
						// Strip surrounding quotes from string values
						if ((value.startsWith('"') && value.endsWith('"')) ||
							(value.startsWith("'") && value.endsWith("'"))) {
							value = value.slice(1, -1);
						}
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

		// Header: Number and type
		const headerEl = itemEl.createEl("div", { cls: "github-kanban-item-header" });

		const type = item.pull_request ? "PR" : "Issue";
		const number = item.number;
		headerEl.createEl("span", {
			text: `#${number} · ${type}`,
			cls: "github-kanban-item-type"
		});

		// Title
		const titleEl = itemEl.createEl("div", { cls: "github-kanban-item-title" });
		titleEl.setText(item.title || "Untitled");

		// Labels
		if (item.labels && item.labels.length > 0) {
			const labelsEl = itemEl.createEl("div", { cls: "github-kanban-item-labels" });

			for (const label of item.labels.slice(0, 5)) {
				const labelEl = labelsEl.createEl("span", { cls: "github-kanban-label" });
				labelEl.setText(label.name);

				// Set background color and calculate text color (dynamic, must stay inline)
				const bgColor = label.color || 'cccccc';
				labelEl.style.backgroundColor = `#${bgColor}`;
				const r = parseInt(bgColor.slice(0, 2), 16);
				const g = parseInt(bgColor.slice(2, 4), 16);
				const b = parseInt(bgColor.slice(4, 6), 16);
				const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
				labelEl.style.color = luminance > 0.5 ? '#000000' : '#ffffff';
			}

			if (item.labels.length > 5) {
				labelsEl.createEl("span", {
					text: `+${item.labels.length - 5}`,
					cls: "github-kanban-label-more"
				});
			}
		}

		// Creator
		if (item.author) {
			const creatorEl = itemEl.createEl("div", { cls: "github-kanban-item-creator" });
			const userIcon = creatorEl.createEl("span", { cls: "github-kanban-user-icon" });
			setIcon(userIcon, "user");
			creatorEl.createEl("span", { text: item.author });
		}

		// Description preview (first 150 chars)
		if (item.body && item.body.trim()) {
			const descEl = itemEl.createEl("div", { cls: "github-kanban-item-description" });

			// Clean up the body text (remove markdown syntax, extra whitespace)
			let bodyPreview = item.body
				.replace(/```[\s\S]*?```/g, '') // Remove code blocks
				.replace(/`[^`]*`/g, '') // Remove inline code
				.replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
				.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Convert links to text
				.replace(/#{1,6}\s*/g, '') // Remove headings
				.replace(/[*_~]+/g, '') // Remove bold/italic/strikethrough
				.replace(/\n+/g, ' ') // Convert newlines to spaces
				.replace(/\s+/g, ' ') // Normalize whitespace
				.trim();

			if (bodyPreview.length > 150) {
				bodyPreview = bodyPreview.substring(0, 150) + '...';
			}

			descEl.setText(bodyPreview);
		}

		// Make clickable to open the file or GitHub URL
		itemEl.onclick = () => this.openItemFile(item);
	}

	private async openItemFile(item: any): Promise<void> {
		const files = this.app.vault.getMarkdownFiles();

		// First try: match by URL (most accurate)
		if (item.url) {
			for (const file of files) {
				try {
					const content = await this.app.vault.read(file);
					const fm = this.parseFrontmatter(content);
					if (!fm) continue;
					if (fm.url && fm.url === item.url) {
						await this.app.workspace.getLeaf().openFile(file);
						return;
					}
				} catch (e) {
					// ignore
				}
			}
		}

		// Fallback: open GitHub URL if available
		if (item.url) {
			window.open(item.url, '_blank');
		} else {
			new Notice(`File for #${item.number} not found in vault`);
		}
	}
}
