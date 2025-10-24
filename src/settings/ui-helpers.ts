import { setIcon } from "obsidian";

export class UIHelpers {
	static addTemplateVariablesHelp(container: HTMLElement, type: 'issue' | 'pr'): void {
		const helpContainer = container.createDiv("github-issues-template-help");

		const details = helpContainer.createEl("details");
		const summary = details.createEl("summary");
		summary.textContent = "Available template variables";
		summary.addClass("github-issues-template-help-summary");

		const variablesContainer = details.createDiv("github-issues-template-variables");

		// Basic Information section
		const basicTitle = variablesContainer.createEl("h4");
		basicTitle.textContent = "Basic Information";

		const basicList = variablesContainer.createEl("ul");
		basicList.innerHTML = `
			<li><code>{title}</code> - Issue/PR title</li>
			<li><code>{title_yaml}</code> - Issue/PR title (YAML-escaped for use in frontmatter)</li>
			<li><code>{number}</code> - Issue/PR number</li>
			<li><code>{status}</code> / <code>{state}</code> - Current status (open, closed, etc.)</li>
			<li><code>{author}</code> - Username who created the issue/PR</li>
			<li><code>{body}</code> - Issue/PR description/body</li>
			<li><code>{url}</code> - Web URL</li>
			<li><code>{repository}</code> - Full repository name (owner/repo)</li>
			<li><code>{owner}</code> - Repository owner</li>
			<li><code>{repoName}</code> - Repository name only</li>
			<li><code>{type}</code> - "issue" or "pr"</li>
		`;

		// Assignees section
		const assigneesTitle = variablesContainer.createEl("h4");
		assigneesTitle.textContent = "Assignees";

		const assigneesList = variablesContainer.createEl("ul");
		assigneesList.innerHTML = `
			<li><code>{assignee}</code> - Primary assignee (first one if multiple)</li>
			<li><code>{assignees}</code> - All assignees as comma-separated list</li>
			<li><code>{assignees_list}</code> - All assignees as bulleted list</li>
			<li><code>{assignees_yaml}</code> - All assignees as YAML inline array</li>
		`;

		// Labels section
		const labelsTitle = variablesContainer.createEl("h4");
		labelsTitle.textContent = "Labels";

		const labelsList = variablesContainer.createEl("ul");
		labelsList.innerHTML = `
			<li><code>{labels}</code> - All labels as comma-separated list</li>
			<li><code>{labels_list}</code> - All labels as bulleted list</li>
			<li><code>{labels_hash}</code> - All labels as hashtags (#label1 #label2)</li>
			<li><code>{labels_yaml}</code> - All labels as YAML inline array</li>
		`;

		// Dates section
		const datesTitle = variablesContainer.createEl("h4");
		datesTitle.textContent = "Dates";

		const datesList = variablesContainer.createEl("ul");
		datesList.innerHTML = `
			<li><code>{created}</code> - Creation date</li>
			<li><code>{updated}</code> - Last update date</li>
			<li><code>{closed}</code> - Closed date (if closed)</li>
		`;

		// Pull Request Specific section (only if type is 'pr')
		if (type === 'pr') {
			const prTitle = variablesContainer.createEl("h4");
			prTitle.textContent = "Pull Request Specific";

			const prList = variablesContainer.createEl("ul");
			prList.innerHTML = `
				<li><code>{mergedAt}</code> - Merge date (if merged)</li>
				<li><code>{mergeable}</code> - Whether PR can be merged</li>
				<li><code>{merged}</code> - Whether PR is merged</li>
				<li><code>{baseBranch}</code> - Target branch</li>
				<li><code>{headBranch}</code> - Source branch</li>
			`;
		}

		// Additional Info section
		const additionalTitle = variablesContainer.createEl("h4");
		additionalTitle.textContent = "Additional Info";

		const additionalList = variablesContainer.createEl("ul");
		additionalList.innerHTML = `
			<li><code>{milestone}</code> - Milestone title</li>
			<li><code>{commentsCount}</code> - Number of comments</li>
			<li><code>{isLocked}</code> - Whether issue/PR is locked</li>
			<li><code>{lockReason}</code> - Lock reason (if locked)</li>
			<li><code>{comments}</code> - Formatted comments section (available only in content templates)</li>
		`;

		// Conditional Blocks section
		const conditionalTitle = variablesContainer.createEl("h4");
		conditionalTitle.textContent = "Conditional Blocks";

		const conditionalDesc = variablesContainer.createEl("p");
		conditionalDesc.innerHTML = `Use <code>{variable:content}</code> to show content only if the variable has a value.`;

		const conditionalExamples = variablesContainer.createEl("ul");
		conditionalExamples.innerHTML = `
			<li><code>{closed:- **Closed:** {closed}}</code> - Shows "- <strong>Closed:</strong> [date]" only if closed</li>
			<li><code>{milestone: Milestone: {milestone}}</code> - Shows milestone info only if set</li>
		`;

		// Examples section
		const examplesTitle = variablesContainer.createEl("h4");
		examplesTitle.textContent = "Examples";

		const examplesList = variablesContainer.createEl("ul");
		examplesList.innerHTML = `
			<li><code>"{title} - Issue {number}"</code> → "Bug fix - Issue 123"</li>
			<li><code>"{type} {number} - {title}"</code> → "issue 123 - Bug fix"</li>
			<li><code>"[{status}] {title} ({assignee})"</code> → "[open] Bug fix (username)"</li>
			<li><code>"{repoName}-{number} {title}"</code> → "myproject-123 Bug fix"</li>
			<li><code>"{closed:Closed on {closed}}"</code> → "Closed on 2024-01-15" (only if closed)</li>
		`;
	}

	static addPersistBlocksHelp(container: HTMLElement): void {
		const helpContainer = container.createDiv("github-issues-template-help");

		const details = helpContainer.createEl("details");
		const summary = details.createEl("summary");
		summary.textContent = "Protect your custom notes with Persist Blocks";
		summary.addClass("github-issues-template-help-summary");

		const contentContainer = details.createDiv("github-issues-template-variables");

		// Introduction
		const intro = contentContainer.createEl("p");
		intro.innerHTML = `<strong>Persist blocks</strong> allow you to add your own custom notes to GitHub issue and PR files without them being overwritten during sync.`;

		// Basic usage
		const usageTitle = contentContainer.createEl("h4");
		usageTitle.textContent = "Basic Usage";

		const usageExample = contentContainer.createEl("pre");
		usageExample.textContent = `{% persist "notes" %}
## My Notes
- Your custom content here
- Will never be overwritten!
{% endpersist %}`;

		// How it works
		const howTitle = contentContainer.createEl("h4");
		howTitle.textContent = "How It Works";

		const howList = contentContainer.createEl("ul");
		howList.innerHTML = `
			<li><strong>Smart Updates:</strong> Files are only updated if GitHub data has changed (checks the <code>updated</code> field)</li>
			<li><strong>Content Protection:</strong> Everything inside persist blocks is preserved during sync</li>
			<li><strong>Position Preservation:</strong> Blocks stay exactly where you placed them using surrounding text as anchors</li>
		`;

		// Multiple blocks
		const multipleTitle = contentContainer.createEl("h4");
		multipleTitle.textContent = "Multiple Blocks";

		const multipleDesc = contentContainer.createEl("p");
		multipleDesc.textContent = "You can have multiple persist blocks in one file. Each needs a unique name:";

		const multipleExample = contentContainer.createEl("pre");
		multipleExample.textContent = `{% persist "notes" %}
Your notes here...
{% endpersist %}

{% persist "todos" %}
- [ ] Task 1
- [ ] Task 2
{% endpersist %}`;
	}

	static getContrastColor(hexColor: string): string {
		const r = parseInt(hexColor.substr(0, 2), 16);
		const g = parseInt(hexColor.substr(2, 2), 16);
		const b = parseInt(hexColor.substr(4, 2), 16);
		const brightness = (r * 299 + g * 587 + b * 114) / 1000;
		return brightness > 128 ? "#000000" : "#ffffff";
	}

	static createSettingsHeader(container: HTMLElement): void {
		const headerEl = container.createEl("div", { cls: "github-issues-settings-header" });
		headerEl.createEl("h2", { text: "GitHub Issues & Pull Requests" });

		const subtitleContainer = headerEl.createDiv({ cls: "github-issues-settings-subtitle" });
		subtitleContainer.createSpan({ text: "Sync your GitHub issues and pull requests in Obsidian" });

		const linksContainer = subtitleContainer.createDiv({ cls: "github-issues-subtitle-links" });

		const bugLink = linksContainer.createEl("a", {
			href: "https://github.com/LonoxX/obsidian-github-issues/issues/new",
			cls: "github-issues-bug-link",
		});
		bugLink.setAttribute("target", "_blank");
		const bugIcon = bugLink.createSpan({ cls: "github-issues-link-icon" });
		setIcon(bugIcon, "bug");
		bugLink.createSpan({ text: "Report Bug" });

		linksContainer.createSpan({ text: " • " });

		const sponsorLink = linksContainer.createEl("a", {
			href: "https://github.com/sponsors/LonoxX",
			cls: "github-issues-sponsor-link",
		});
		sponsorLink.setAttribute("target", "_blank");
		const sponsorIcon = sponsorLink.createSpan({ cls: "github-issues-link-icon" });
		setIcon(sponsorIcon, "heart");
		sponsorLink.createSpan({ text: "Support me" });

		linksContainer.createSpan({ text: " • " });

		const kofiLink = linksContainer.createEl("a", {
			href: "https://ko-fi.com/lonoxx",
			cls: "github-issues-kofi-link",
		});
		kofiLink.setAttribute("target", "_blank");
		const kofiIcon = kofiLink.createSpan({ cls: "github-issues-link-icon" });
		setIcon(kofiIcon, "coffee");
		kofiLink.createSpan({ text: "Ko-fi" });

		linksContainer.createSpan({ text: " • " });

		const bmcLink = linksContainer.createEl("a", {
			href: "https://buymeacoffee.com/lonoxx",
			cls: "github-issues-bmc-link",
		});
		bmcLink.setAttribute("target", "_blank");
		const bmcIcon = bmcLink.createSpan({ cls: "github-issues-link-icon" });
		setIcon(bmcIcon, "pizza");
		bmcLink.createSpan({ text: "Buy me a Pizza" });
	}
}
