import { format } from "date-fns";
import {
	IssueTrackerSettings,
	RepositoryTracking,
	ProjectData,
	ProviderConfig,
} from "./types";
import { escapeBody, escapeYamlString } from "./util/escapeUtils";
import {
	createIssueTemplateData,
	createPullRequestTemplateData,
	processContentTemplate,
} from "./util/templateUtils";
import { FileHelpers } from "./util/file-helpers";

export class ContentGenerator {
	constructor(private fileHelpers: FileHelpers) {}

	/**
	 * Create issue content using template or default format
	 */
	public async createIssueContent(
		issue: any,
		repo: RepositoryTracking,
		comments: any[],
		settings: IssueTrackerSettings,
		projectData?: ProjectData[],
		subIssues?: any[],
		parentIssue?: any,
	): Promise<string> {
		// Determine whether to escape hash tags (repo setting takes precedence if using a custom profile)
		const shouldEscapeHashTags =
			repo.profileId !== "default"
				? repo.escapeHashTags
				: settings.escapeHashTags;

		// Check if custom template is enabled and load template content
		if (repo.useCustomIssueContentTemplate && repo.issueContentTemplate) {
			const templateContent = await this.fileHelpers.loadTemplateContent(
				repo.issueContentTemplate,
			);
			if (templateContent) {
				const templateData = createIssueTemplateData(
					issue,
					repo.repository,
					comments,
					settings.dateFormat,
					settings.escapeMode,
					shouldEscapeHashTags,
					projectData,
					subIssues,
					parentIssue,
				);
				return processContentTemplate(
					templateContent,
					templateData,
					settings.dateFormat,
				);
			}
		}

		// Fallback to default template
		let frontmatter = `---
title: "${escapeYamlString(issue.title)}"
number: ${issue.number}
state: "${issue.state}"
type: "issue"
created: "${
			settings.dateFormat !== ""
				? format(new Date(issue.created_at), settings.dateFormat)
				: new Date(issue.created_at).toLocaleString()
		}"
updated: "${
			settings.dateFormat !== ""
				? format(new Date(issue.updated_at), settings.dateFormat)
				: new Date(issue.updated_at).toLocaleString()
		}"
url: "${issue.html_url}"
opened_by: "${issue.user?.login}"
assignees: [${(
			issue.assignees?.map(
				(assignee: { login: string }) => '"' + assignee.login + '"',
			) || []
		).join(", ")}]
labels: [${(
			issue.labels?.map(
				(label: { name: string }) => '"' + label.name + '"',
			) || []
		).join(", ")}]
updateMode: "${repo.issueUpdateMode}"
allowDelete: ${repo.allowDeleteIssue ? true : false}`;

		// Add parent issue if available
		if (parentIssue) {
			frontmatter += `
parent_issue: ${parentIssue.number}
parent_issue_url: "${parentIssue.url}"`;
		}

		// Add sub-issues metadata if available
		if (subIssues && subIssues.length > 0) {
			const closedCount = subIssues.filter(
				(si: any) => si.state === "closed",
			).length;
			const openCount = subIssues.length - closedCount;
			frontmatter += `
sub_issues: [${subIssues.map((si: any) => si.number).join(", ")}]
sub_issues_count: ${subIssues.length}
sub_issues_open: ${openCount}
sub_issues_closed: ${closedCount}`;
		}

		// Add projectData if available
		if (projectData && projectData.length > 0) {
			frontmatter += `
projectData:`;
			for (const project of projectData) {
				frontmatter += `
  - projectId: "${project.projectId}"`;
			}
		}

		frontmatter += `
---

# ${escapeBody(issue.title, settings.escapeMode, false)}
${
	issue.body
		? escapeBody(issue.body, settings.escapeMode, shouldEscapeHashTags)
		: "No description found"
}

${this.fileHelpers.formatComments(comments, settings.escapeMode, settings.dateFormat, shouldEscapeHashTags)}`;

		// Add sub-issues section if available
		if (subIssues && subIssues.length > 0) {
			frontmatter += `

## Sub-Issues
${subIssues
	.map((si: any) => {
		const statusIcon =
			si.state === "closed"
				? '<span class="github-issues-sub-issue-closed">●</span>'
				: '<span class="github-issues-sub-issue-open">●</span>';
		return `- ${statusIcon} [#${si.number} ${si.title}](${si.url})`;
	})
	.join("\n")}`;
		}

		// Add parent issue link if available
		if (parentIssue) {
			frontmatter += `

## Parent Issue
- [#${parentIssue.number} ${parentIssue.title}](${parentIssue.url})`;
		}

		return frontmatter;
	}

	/**
	 * Create pull request content using template or default format
	 */
	public async createPullRequestContent(
		pr: any,
		repo: RepositoryTracking,
		comments: any[],
		settings: IssueTrackerSettings,
		projectData?: ProjectData[],
	): Promise<string> {
		// Determine whether to escape hash tags (repo setting takes precedence if using a custom profile)
		const shouldEscapeHashTags =
			repo.profileId !== "default"
				? repo.escapeHashTags
				: settings.escapeHashTags;

		// Check if custom template is enabled and load template content
		if (
			repo.useCustomPullRequestContentTemplate &&
			repo.pullRequestContentTemplate
		) {
			const templateContent = await this.fileHelpers.loadTemplateContent(
				repo.pullRequestContentTemplate,
			);
			if (templateContent) {
				const templateData = createPullRequestTemplateData(
					pr,
					repo.repository,
					comments,
					settings.dateFormat,
					settings.escapeMode,
					shouldEscapeHashTags,
					projectData,
				);
				return processContentTemplate(
					templateContent,
					templateData,
					settings.dateFormat,
				);
			}
		}

		// Fallback to default template
		const providerConfig = settings.providers?.find(
			(p: ProviderConfig) => p.id === repo.provider,
		);
		const prType = providerConfig?.type === "gitlab" ? "mr" : "pr";
		let frontmatter = `---
title: "${escapeYamlString(pr.title)}"
number: ${pr.number}
state: "${pr.state}"
type: "${prType}"
created: "${
			settings.dateFormat !== ""
				? format(new Date(pr.created_at), settings.dateFormat)
				: new Date(pr.created_at).toLocaleString()
		}"
updated: "${
			settings.dateFormat !== ""
				? format(new Date(pr.updated_at), settings.dateFormat)
				: new Date(pr.updated_at).toLocaleString()
		}"
url: "${pr.html_url}"
opened_by: "${pr.user?.login}"
assignees: [${(
			pr.assignees?.map(
				(assignee: { login: string }) => '"' + assignee.login + '"',
			) || []
		).join(", ")}]
requested_reviewers: [${(
			pr.requested_reviewers?.map(
				(reviewer: { login: string }) => '"' + reviewer.login + '"',
			) || []
		).join(", ")}]
labels: [${(
			pr.labels?.map(
				(label: { name: string }) => '"' + label.name + '"',
			) || []
		).join(", ")}]`;

		// Add branch info if available
		if (pr.head?.ref) {
			frontmatter += `\nsource_branch: "${pr.head.ref}"`;
		}
		if (pr.base?.ref) {
			frontmatter += `\ntarget_branch: "${pr.base.ref}"`;
		}
		if (pr.draft !== undefined) {
			frontmatter += `\ndraft: ${pr.draft}`;
		}

		frontmatter += `
updateMode: "${repo.pullRequestUpdateMode}"
allowDelete: ${repo.allowDeletePullRequest ? true : false}`;

		// Add projectData if available
		if (projectData && projectData.length > 0) {
			frontmatter += `
projectData:`;
			for (const project of projectData) {
				frontmatter += `
  - projectId: "${project.projectId}"`;
			}
		}

		frontmatter += `
---

# ${escapeBody(pr.title, settings.escapeMode, false)}
${
	pr.body
		? escapeBody(pr.body, settings.escapeMode, shouldEscapeHashTags)
		: "No description found"
}

${this.fileHelpers.formatComments(comments, settings.escapeMode, settings.dateFormat, shouldEscapeHashTags)}`;

		return frontmatter;
	}
}
