import { format } from "date-fns";
import { GitHubTrackerSettings, RepositoryTracking } from "./types";
import { escapeBody, escapeYamlString } from "./util/escapeUtils";
import {
	createIssueTemplateData,
	createPullRequestTemplateData,
	processContentTemplate
} from "./util/templateUtils";
import { FileHelpers } from "./util/file-helpers";

export class ContentGenerator {
	constructor(
		private fileHelpers: FileHelpers,
	) {}

	/**
	 * Create issue content using template or default format
	 */
	public async createIssueContent(
		issue: any,
		repo: RepositoryTracking,
		comments: any[],
		settings: GitHubTrackerSettings,
	): Promise<string> {
		// Check if custom template is enabled and load template content
		if (repo.useCustomIssueContentTemplate && repo.issueContentTemplate) {
			const templateContent = await this.fileHelpers.loadTemplateContent(repo.issueContentTemplate);
			if (templateContent) {
				const templateData = createIssueTemplateData(
					issue,
					repo.repository,
					comments,
					settings.dateFormat,
					settings.escapeMode
				);
				return processContentTemplate(templateContent, templateData, settings.dateFormat);
			}
		}

		// Fallback to default template
		return `---
title: "${escapeYamlString(issue.title)}"
number: ${issue.number}
status: "${issue.state}"
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
allowDelete: ${repo.allowDeleteIssue ? true : false}
---

# ${escapeBody(issue.title, settings.escapeMode)}
${
	issue.body
		? escapeBody(issue.body, settings.escapeMode)
		: "No description found"
}

${this.fileHelpers.formatComments(comments, settings.escapeMode, settings.dateFormat)}
`;
	}

	/**
	 * Create pull request content using template or default format
	 */
	public async createPullRequestContent(
		pr: any,
		repo: RepositoryTracking,
		comments: any[],
		settings: GitHubTrackerSettings,
	): Promise<string> {
		// Check if custom template is enabled and load template content
		if (repo.useCustomPullRequestContentTemplate && repo.pullRequestContentTemplate) {
			const templateContent = await this.fileHelpers.loadTemplateContent(repo.pullRequestContentTemplate);
			if (templateContent) {
				const templateData = createPullRequestTemplateData(
					pr,
					repo.repository,
					comments,
					settings.dateFormat,
					settings.escapeMode
				);
				return processContentTemplate(templateContent, templateData, settings.dateFormat);
			}
		}

		// Fallback to default template
		return `---
title: "${escapeYamlString(pr.title)}"
number: ${pr.number}
status: "${pr.state}"
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
		).join(", ")}]
updateMode: "${repo.pullRequestUpdateMode}"
allowDelete: ${repo.allowDeletePullRequest ? true : false}
---

# ${escapeBody(pr.title, settings.escapeMode)}
${
	pr.body
		? escapeBody(pr.body, settings.escapeMode)
		: "No description found"
}

${this.fileHelpers.formatComments(comments, settings.escapeMode, settings.dateFormat)}
`;
	}
}
