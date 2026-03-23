import { format } from "date-fns";
import { escapeBody, escapeYamlString } from "./escapeUtils";
import { ProjectData } from "../types";

interface SubIssueData {
	number: number;
	title: string;
	state: string;
	url: string;
	vaultPath?: string; // Path to the sub-issue file in the vault (if it exists)
}

interface ParentIssueData {
	number: number;
	title: string;
	state: string;
	url: string;
}

interface TemplateData {
	title: string;
	title_yaml: string;
	number: number;
	status: string;
	author: string;
	assignee?: string;
	assignees?: string[];
	labels?: string[];
	created: Date;
	updated?: Date;
	closed?: Date;
	repository: string;
	owner: string;
	repoName: string;
	type: "issue" | "pr";
	body: string;
	url: string;
	state: string;
	milestone?: string;
	mergedAt?: Date;
	mergeable?: boolean;
	merged?: boolean;
	baseBranch?: string;
	headBranch?: string;
	draft?: boolean;
	commentsCount: number;
	isLocked: boolean;
	lockReason?: string;
	comments?: string;
	projectData?: ProjectData[];
	subIssues?: SubIssueData[];
	parentIssue?: ParentIssueData;
}

/**
 * Sanitize a filename to remove invalid characters
 * @param filename The filename to sanitize
 * @returns A sanitized filename
 */
export function sanitizeFilename(filename: string): string {
	// Remove or replace invalid filename characters
	// Windows: < > : " | ? * \
	// Unix: /
	// Also remove leading/trailing spaces and dots
	return filename
		.replace(/[<>:"|?*\\\/]/g, "-")
		.replace(/\n/g, " ")
		.replace(/\r/g, "")
		.replace(/\t/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^\.+|\.+$/g, "")
		.substring(0, 255); // Limit to 255 characters for most filesystems
}

/**
 * Format comments for display in templates
 * @param comments Array of comment objects from GitHub API
 * @param dateFormat Date format string for comment timestamps
 * @param escapeMode Escape mode for comment body text
 * @param escapeHashTags Whether to escape # characters
 * @returns Formatted comments string
 */
export function formatComments(
	comments: any[],
	dateFormat: string = "",
	escapeMode: "disabled" | "normal" | "strict" | "veryStrict" = "normal",
	escapeHashTags: boolean = false,
): string {
	if (!comments || comments.length === 0) {
		return "";
	}

	comments.sort(
		(a, b) =>
			new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
	);

	let commentSection = "\n## Comments\n\n";

	comments.forEach((comment) => {
		const createdAt =
			dateFormat !== ""
				? format(new Date(comment.created_at), dateFormat)
				: new Date(comment.created_at).toLocaleString();

		const username = comment.user?.login || "Unknown User";

		if (comment.is_review_comment) {
			commentSection += `### ${username} commented on line ${
				comment.line || "N/A"
			} of file \`${comment.path || "unknown"}\` (${createdAt}):\n\n`;
		} else {
			commentSection += `### ${username} commented (${createdAt}):\n\n`;
		}

		commentSection += `${escapeBody(
			comment.body || "No content",
			escapeMode,
			escapeHashTags,
		)}\n\n`;
	});

	return commentSection;
}

/**
 * Process a template string and replace variables with actual data
 * @param template The template string (e.g., "{title} - Issue {number}")
 * @param data The data to use for replacement
 * @param dateFormat Optional date format string
 * @returns Processed template string
 */
export function processTemplate(
	template: string,
	data: TemplateData,
	dateFormat: string = "",
): string {
	let result = template;

	// 1. Process conditional blocks first (e.g., {closed:- **Closed:** {closed}})
	result = processConditionalBlocks(result, data);
	// 2. Build replacements map
	const replacements = buildReplacements(data, dateFormat);
	// 3. Process {% if %} blocks
	result = processIfBlocks(result, replacements);
	// 4. Process value mappings (e.g., {status|open:todo|closed:done})
	result = processValueMappings(result, replacements);
	// 5. Replace all simple variables (using replaceAll to avoid ReDoS vulnerabilities)
	for (const [placeholder, value] of Object.entries(replacements)) {
		result = result.replaceAll(placeholder, value);
	}
	// 6. Process dynamic project field access: {project_field:FieldName}
	result = processProjectFieldAccess(result, data.projectData);

	return result;
}

function buildReplacements(
	data: TemplateData,
	dateFormat: string,
): Record<string, string> {
	const replacements: Record<string, string> = {
		"{title}": data.title || "Untitled",
		"{title_yaml}": data.title_yaml || "Untitled",
		"{number}": data.number.toString(),
		"{status}": data.status || "unknown",
		"{state}": data.state || data.status || "unknown",
		"{author}": data.author || "unknown",
		"{assignee}": data.assignee || "",
		"{repository}": data.repository,
		"{owner}": data.owner,
		"{repoName}": data.repoName,
		"{type}": data.type,
		"{body}": data.body || "",
		"{url}": data.url || "",
		"{milestone}": data.milestone || "",
		"{commentsCount}": data.commentsCount?.toString() || "0",
		"{isLocked}": data.isLocked ? "true" : "false",
		"{lockReason}": data.lockReason || "",
		"{created}": dateFormat
			? format(data.created, dateFormat)
			: data.created.toLocaleDateString(),
		"{updated}": data.updated
			? dateFormat
				? format(data.updated, dateFormat)
				: data.updated.toLocaleDateString()
			: "",
		"{closed}": data.closed
			? dateFormat
				? format(data.closed, dateFormat)
				: data.closed.toLocaleDateString()
			: "",
	};

	if (data.type === "pr") {
		replacements["{mergedAt}"] = data.mergedAt
			? dateFormat
				? format(data.mergedAt, dateFormat)
				: data.mergedAt.toLocaleDateString()
			: "";
		replacements["{mergeable}"] =
			data.mergeable !== undefined
				? data.mergeable
					? "true"
					: "false"
				: "unknown";
		replacements["{merged}"] = data.merged ? "true" : "false";
		replacements["{baseBranch}"] = data.baseBranch || "";
		replacements["{headBranch}"] = data.headBranch || "";
		replacements["{draft}"] = data.draft ? "true" : "false";
	}

	if (data.assignees && data.assignees.length > 0) {
		replacements["{assignees}"] = data.assignees.join(", ");
		replacements["{assignees_list}"] = data.assignees
			.map((a) => `- ${a}`)
			.join("\n");
		replacements["{assignees_yaml}"] =
			`[${data.assignees.map((a) => `'${a}'`).join(", ")}]`;
	} else {
		replacements["{assignees}"] = "";
		replacements["{assignees_list}"] = "";
		replacements["{assignees_yaml}"] = "[]";
	}

	if (data.labels && data.labels.length > 0) {
		replacements["{labels}"] = data.labels.join(", ");
		replacements["{labels_list}"] = data.labels
			.map((l) => `- ${l}`)
			.join("\n");
		replacements["{labels_hash}"] = data.labels
			.map((l) => `#${l.replace(/\s/g, "_")}`)
			.join(" ");
		replacements["{labels_yaml}"] =
			`[${data.labels.map((l) => `'${l}'`).join(", ")}]`;
	} else {
		replacements["{labels}"] = "";
		replacements["{labels_list}"] = "";
		replacements["{labels_hash}"] = "";
		replacements["{labels_yaml}"] = "[]";
	}

	replacements["{comments}"] = data.comments || "";

	if (data.projectData && data.projectData.length > 0) {
		const firstProject = data.projectData[0];
		replacements["{project}"] = firstProject.projectTitle || "";
		replacements["{project_url}"] = firstProject.projectUrl || "";
		replacements["{project_number}"] =
			firstProject.projectNumber?.toString() || "";
		replacements["{project_status}"] = firstProject.status || "";
		replacements["{project_priority}"] = firstProject.priority || "";

		if (firstProject.iteration) {
			replacements["{project_iteration}"] =
				firstProject.iteration.title || "";
			replacements["{project_iteration_start}"] =
				firstProject.iteration.startDate || "";
			replacements["{project_iteration_duration}"] =
				firstProject.iteration.duration?.toString() || "";
		} else {
			replacements["{project_iteration}"] = "";
			replacements["{project_iteration_start}"] = "";
			replacements["{project_iteration_duration}"] = "";
		}

		replacements["{projects}"] = data.projectData
			.map((p) => p.projectTitle)
			.join(", ");
		replacements["{projects_yaml}"] =
			`[${data.projectData.map((p) => `'${p.projectTitle}'`).join(", ")}]`;

		const customFieldsYaml = Object.entries(firstProject.customFields)
			.map(([name, field]) => `  ${name}: "${field.value}"`)
			.join("\n");
		replacements["{project_fields}"] = customFieldsYaml
			? `\n${customFieldsYaml}`
			: "";
	} else {
		replacements["{project}"] = "";
		replacements["{project_url}"] = "";
		replacements["{project_number}"] = "";
		replacements["{project_status}"] = "";
		replacements["{project_priority}"] = "";
		replacements["{project_iteration}"] = "";
		replacements["{project_iteration_start}"] = "";
		replacements["{project_iteration_duration}"] = "";
		replacements["{projects}"] = "";
		replacements["{projects_yaml}"] = "[]";
		replacements["{project_fields}"] = "";
	}

	if (data.subIssues && data.subIssues.length > 0) {
		const closedCount = data.subIssues.filter(
			(si) => si.state === "closed",
		).length;
		const openCount = data.subIssues.length - closedCount;
		const totalCount = data.subIssues.length;

		replacements["{sub_issues_count}"] = totalCount.toString();
		replacements["{sub_issues_open}"] = openCount.toString();
		replacements["{sub_issues_closed}"] = closedCount.toString();
		replacements["{sub_issues_progress}"] =
			`${closedCount} of ${totalCount}`;

		replacements["{sub_issues}"] = data.subIssues
			.map((si) => `[#${si.number}](${si.url})`)
			.join(", ");

		replacements["{sub_issues_list}"] = data.subIssues
			.map((si) => {
				const isClosed = si.state === "closed";
				const cssClass = isClosed
					? "github-issues-sub-issue-closed"
					: "github-issues-sub-issue-open";
				const statusIcon = `<span class="${cssClass}">●</span>`;
				const link = si.vaultPath
					? `[[${si.vaultPath}|#${si.number} ${si.title}]]`
					: `[#${si.number} ${si.title}](${si.url})`;
				return `- ${statusIcon} ${link}`;
			})
			.join("\n");

		replacements["{sub_issues_simple_list}"] = data.subIssues
			.map((si) => {
				const link = si.vaultPath
					? `[[${si.vaultPath}|#${si.number} ${si.title}]]`
					: `[#${si.number} ${si.title}](${si.url})`;
				return `- ${link}`;
			})
			.join("\n");

		replacements["{sub_issues_yaml}"] = `[${data.subIssues
			.map((si) => si.number)
			.join(", ")}]`;

		replacements["{sub_issues_numbers}"] = data.subIssues
			.map((si) => `#${si.number}`)
			.join(", ");
	} else {
		replacements["{sub_issues_count}"] = "0";
		replacements["{sub_issues_open}"] = "0";
		replacements["{sub_issues_closed}"] = "0";
		replacements["{sub_issues_progress}"] = "0 of 0";
		replacements["{sub_issues}"] = "";
		replacements["{sub_issues_list}"] = "";
		replacements["{sub_issues_simple_list}"] = "";
		replacements["{sub_issues_yaml}"] = "[]";
		replacements["{sub_issues_numbers}"] = "";
	}

	if (data.parentIssue) {
		replacements["{parent_issue}"] = data.parentIssue.title;
		replacements["{parent_issue_number}"] =
			data.parentIssue.number.toString();
		replacements["{parent_issue_url}"] = data.parentIssue.url;
		replacements["{parent_issue_link}"] =
			`[#${data.parentIssue.number} ${data.parentIssue.title}](${data.parentIssue.url})`;
		replacements["{parent_issue_state}"] = data.parentIssue.state;
	} else {
		replacements["{parent_issue}"] = "";
		replacements["{parent_issue_number}"] = "";
		replacements["{parent_issue_url}"] = "";
		replacements["{parent_issue_link}"] = "";
		replacements["{parent_issue_state}"] = "";
	}

	return replacements;
}

/**
 * Resolve a variable name to its value from the replacements map.
 * Strips surrounding braces if needed, looks up "{varName}" in replacements.
 */
function resolveVariable(
	varName: string,
	replacements: Record<string, string>,
): string {
	const key = varName.startsWith("{") ? varName : `{${varName}}`;
	return replacements[key] ?? "";
}

/**
 * Process value mapping expressions like {status|open:todo|closed:done}
 * The variable name is before the first |, rules follow separated by |.
 * Each rule is key:value where only the first : splits (value can contain :).
 * A * key acts as wildcard/default.
 */
function processValueMappings(
	template: string,
	replacements: Record<string, string>,
): string {
	return template.replace(
		/\{([^|{}]+)\|([^{}]+)\}/g,
		(_match, varName: string, rulesStr: string) => {
			const value = resolveVariable(varName.trim(), replacements);
			const rules = rulesStr.split("|");
			let wildcardOutput: string | undefined;

			for (const rule of rules) {
				const colonIdx = rule.indexOf(":");
				if (colonIdx === -1) continue;
				const matchKey = rule.substring(0, colonIdx).trim();
				const output = rule.substring(colonIdx + 1);

				if (matchKey === "*") {
					wildcardOutput = output;
				} else if (matchKey === value) {
					return output;
				}
			}

			return wildcardOutput ?? value;
		},
	);
}

/**
 * Evaluate a simple condition like: variable operator "value"
 * Supported operators: ==, !=, contains, not contains
 */
function evaluateSimpleCondition(
	expression: string,
	replacements: Record<string, string>,
): boolean {
	// Try "not contains" first (two-word operator)
	// Supports both "double" and 'single' quoted values
	let match = expression.match(
		/^\s*(\w+)\s+not\s+contains\s+(?:"([^"]*)"|'([^']*)')\s*$/,
	);
	if (match) {
		const value = resolveVariable(match[1], replacements);
		return !value.includes(match[2] ?? match[3]);
	}

	match = expression.match(
		/^\s*(\w+)\s+contains\s+(?:"([^"]*)"|'([^']*)')\s*$/,
	);
	if (match) {
		const value = resolveVariable(match[1], replacements);
		return value.includes(match[2] ?? match[3]);
	}

	match = expression.match(
		/^\s*(\w+)\s*(==|!=)\s*(?:"([^"]*)"|'([^']*)')\s*$/,
	);
	if (match) {
		const value = resolveVariable(match[1], replacements);
		const op = match[2];
		const expected = match[3] ?? match[4];
		return op === "==" ? value === expected : value !== expected;
	}

	return false;
}

/**
 * Evaluate a compound condition with and/or operators.
 * Splits on " and " / " or " and evaluates each simple condition.
 * "and" binds tighter than "or" (standard precedence).
 */
function evaluateCondition(
	condition: string,
	replacements: Record<string, string>,
): boolean {
	// Split by " or " first (lower precedence)
	const orParts = condition.split(/\s+or\s+/);
	return orParts.some((orPart) => {
		// Split each or-part by " and " (higher precedence)
		const andParts = orPart.split(/\s+and\s+/);
		return andParts.every((part) =>
			evaluateSimpleCondition(part, replacements),
		);
	});
}

/**
 * Process {% if %} / {% elif %} / {% else %} / {% endif %} blocks.
 * Supports arbitrary elif chains. Whitespace in output is trimmed.
 * Explicitly skips {% persist %} / {% endpersist %} blocks.
 */
function processIfBlocks(
	template: string,
	replacements: Record<string, string>,
): string {
	// Match {% if ... %}...{% endif %} blocks (non-greedy, non-nested)
	const blockRegex = /\{%\s*if\s+(.*?)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;

	return template.replace(
		blockRegex,
		(_match, firstCondition: string, body: string) => {
			// Parse branches by scanning for {% elif ... %} and {% else %} markers
			const branches: { condition: string | null; content: string }[] =
				[];
			const markerRegex = /\{%\s*(?:(elif)\s+(.*?)\s*|(else)\s*)%\}/g;

			let lastIdx = 0;
			let currentCondition: string | null = firstCondition;
			let markerMatch;

			while ((markerMatch = markerRegex.exec(body)) !== null) {
				branches.push({
					condition: currentCondition,
					content: body.substring(lastIdx, markerMatch.index),
				});
				lastIdx = markerMatch.index + markerMatch[0].length;

				if (markerMatch[1] === "elif") {
					currentCondition = markerMatch[2];
				} else {
					currentCondition = null;
				}
			}

			// Remaining content after last marker (or all content if no markers)
			branches.push({
				condition: currentCondition,
				content: body.substring(lastIdx),
			});

			for (const branch of branches) {
				if (branch.condition === null) {
					return branch.content.trim();
				}
				if (evaluateCondition(branch.condition, replacements)) {
					return branch.content.trim();
				}
			}

			return "";
		},
	);
}

/**
 * Process dynamic project field access patterns like {project_field:FieldName}
 */
function processProjectFieldAccess(
	template: string,
	projectData?: ProjectData[],
): string {
	if (!projectData || projectData.length === 0) {
		return template.replace(/\{project_field:([^}]+)\}/g, "");
	}

	const firstProject = projectData[0];

	return template.replace(
		/\{project_field:([^}]+)\}/g,
		(match, fieldName) => {
			const field = firstProject.customFields[fieldName];
			if (field) {
				return String(field.value || "");
			}
			return "";
		},
	);
}

export function processFilenameTemplate(
	template: string,
	data: TemplateData,
	dateFormat: string = "",
): string {
	const result = processTemplate(template, data, dateFormat);
	return sanitizeFilename(result);
}

export function processContentTemplate(
	templateContent: string,
	data: TemplateData,
	dateFormat: string = "",
): string {
	return processTemplate(templateContent, data, dateFormat);
}

function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Process conditional blocks in template (e.g., {closed:- **Closed:** {closed}})
 * Format: {condition:content} - shows content only if condition variable has a value
 * @param template Template string
 * @param data Template data
 * @returns Processed template string
 */
function processConditionalBlocks(
	template: string,
	data: TemplateData,
): string {
	const conditionalPattern = /\{(\w+):([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;

	return template.replace(
		conditionalPattern,
		(match, variableName, content) => {
			const value = getVariableValue(variableName, data);

			if (
				value &&
				value !== "" &&
				value !== "0" &&
				value !== "false" &&
				value !== "unknown" &&
				value !== "unassigned"
			) {
				return content;
			}

			return "";
		},
	);
}

function getVariableValue(
	variableName: string,
	data: TemplateData,
): string | undefined {
	switch (variableName) {
		case "closed":
			return data.closed ? "true" : undefined;
		case "updated":
			return data.updated ? "true" : undefined;
		case "mergedAt":
			return data.mergedAt ? "true" : undefined;
		case "milestone":
			return data.milestone;
		case "assignee":
			return data.assignee;
		case "assignees":
			return data.assignees && data.assignees.length > 0
				? "true"
				: undefined;
		case "labels":
			return data.labels && data.labels.length > 0 ? "true" : undefined;
		case "body":
			return data.body;
		case "lockReason":
			return data.lockReason;
		case "baseBranch":
			return data.baseBranch;
		case "headBranch":
			return data.headBranch;
		case "merged":
			return data.merged ? "true" : undefined;
		case "mergeable":
			return data.mergeable !== undefined ? "true" : undefined;
		// Project-related conditionals
		case "project":
			return data.projectData && data.projectData.length > 0
				? data.projectData[0].projectTitle
				: undefined;
		case "project_status":
			return data.projectData && data.projectData.length > 0
				? data.projectData[0].status
				: undefined;
		case "project_priority":
			return data.projectData && data.projectData.length > 0
				? data.projectData[0].priority
				: undefined;
		case "project_iteration":
			return data.projectData &&
				data.projectData.length > 0 &&
				data.projectData[0].iteration
				? data.projectData[0].iteration.title
				: undefined;
		case "projects":
			return data.projectData && data.projectData.length > 0
				? "true"
				: undefined;
		// Sub-issues conditionals
		case "sub_issues":
			return data.subIssues && data.subIssues.length > 0
				? "true"
				: undefined;
		case "sub_issues_count":
			return data.subIssues && data.subIssues.length > 0
				? data.subIssues.length.toString()
				: undefined;
		case "parent_issue":
			return data.parentIssue ? data.parentIssue.title : undefined;
		case "parent_issue_number":
			return data.parentIssue
				? data.parentIssue.number.toString()
				: undefined;
		default:
			return undefined;
	}
}

/**
 * Create template data from an issue object
 * @param issue The issue data from GitHub API
 * @param repository The repository string (owner/repo)
 * @param comments Array of comments
 * @param dateFormat Date format string
 * @param escapeMode Escape mode for text
 * @param escapeHashTags Whether to escape hash tags
 * @param projectData Optional project data from GitHub Projects
 * @param subIssues Optional array of sub-issues
 * @param parentIssue Optional parent issue data
 * @returns TemplateData object
 */
export function createIssueTemplateData(
	issue: any,
	repository: string,
	comments: any[] = [],
	dateFormat: string = "",
	escapeMode: "disabled" | "normal" | "strict" | "veryStrict" = "normal",
	escapeHashTags: boolean = false,
	projectData?: ProjectData[],
	subIssues?: any[],
	parentIssue?: any,
): TemplateData {
	const [owner, repoName] = repository.split("/");

	const milestoneTitle =
		issue.milestone?.title || issue.milestone?.name || "";

	const subIssueData: SubIssueData[] | undefined = subIssues?.map((si) => ({
		number: si.number,
		title: si.title,
		state: si.state || "open",
		url: si.html_url || si.url || "",
		vaultPath: si.vaultPath,
	}));

	const parentIssueData: ParentIssueData | undefined = parentIssue
		? {
				number: parentIssue.number,
				title: parentIssue.title,
				state: parentIssue.state || "open",
				url: parentIssue.html_url || parentIssue.url || "",
			}
		: undefined;

	return {
		title: issue.title || "Untitled",
		title_yaml: escapeYamlString(issue.title || "Untitled"),
		number: issue.number,
		status: issue.state || "unknown",
		state: issue.state || "unknown",
		author: issue.user?.login || "unknown",
		assignee: issue.assignee?.login,
		assignees: issue.assignees?.map((a: any) => a.login) || [],
		labels: issue.labels?.map((l: any) => l.name) || [],
		created: new Date(issue.created_at),
		updated: issue.updated_at ? new Date(issue.updated_at) : undefined,
		closed: issue.closed_at ? new Date(issue.closed_at) : undefined,
		repository,
		owner: owner || "unknown",
		repoName: repoName || "unknown",
		type: "issue",
		body: issue.body || "",
		url: issue.html_url || "",
		milestone: milestoneTitle,
		commentsCount: issue.comments || 0,
		isLocked: issue.locked || false,
		lockReason: issue.active_lock_reason || "",
		comments: formatComments(
			comments,
			dateFormat,
			escapeMode,
			escapeHashTags,
		),
		projectData: projectData,
		subIssues: subIssueData,
		parentIssue: parentIssueData,
	};
}

/**
 * Create template data from a pull request object
 * @param pr The pull request data from GitHub API
 * @param repository The repository string (owner/repo)
 * @param comments Array of comments
 * @param dateFormat Date format string
 * @param escapeMode Escape mode for text
 * @param escapeHashTags Whether to escape hash tags
 * @param projectData Optional project data from GitHub Projects
 * @returns TemplateData object
 */
export function createPullRequestTemplateData(
	pr: any,
	repository: string,
	comments: any[] = [],
	dateFormat: string = "",
	escapeMode: "disabled" | "normal" | "strict" | "veryStrict" = "normal",
	escapeHashTags: boolean = false,
	projectData?: ProjectData[],
): TemplateData {
	const [owner, repoName] = repository.split("/");

	const milestoneTitle = pr.milestone?.title || pr.milestone?.name || "";

	return {
		title: pr.title || "Untitled",
		title_yaml: escapeYamlString(pr.title || "Untitled"),
		number: pr.number,
		status: pr.state || "unknown",
		state: pr.state || "unknown",
		author: pr.user?.login || "unknown",
		assignee: pr.assignee?.login,
		assignees: pr.assignees?.map((a: any) => a.login) || [],
		labels: pr.labels?.map((l: any) => l.name) || [],
		created: new Date(pr.created_at),
		updated: pr.updated_at ? new Date(pr.updated_at) : undefined,
		closed: pr.closed_at ? new Date(pr.closed_at) : undefined,
		repository,
		owner: owner || "unknown",
		repoName: repoName || "unknown",
		type: "pr",
		body: pr.body || "",
		url: pr.html_url || "",
		milestone: milestoneTitle,
		commentsCount: pr.comments || 0,
		isLocked: pr.locked || false,
		lockReason: pr.active_lock_reason || "",
		mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
		mergeable: pr.mergeable,
		merged: pr.merged || false,
		baseBranch: pr.base?.ref,
		headBranch: pr.head?.ref,
		draft: pr.draft,
		comments: formatComments(
			comments,
			dateFormat,
			escapeMode,
			escapeHashTags,
		),
		projectData: projectData,
	};
}

/**
 * Extract the number from a filename based on the template that was used to create it
 * @param filename The filename to extract the number from
 * @param template The template that was used to create the filename
 * @returns The extracted number or null if not found
 */
export function extractNumberFromFilename(
	filename: string,
	template: string,
): string | null {
	const baseFilename = filename.replace(/\.md$/, "");

	// First, try a simple approach: if the template is just "{number}", extract any number
	if (template === "{number}") {
		const match = baseFilename.match(/^(\d+)$/);
		return match ? match[1] : null;
	}

	// Create a regex pattern from the template by replacing variables BEFORE escaping
	let pattern = template;

	// Replace value mapping expressions and if-blocks with wildcards (before other replacements)
	pattern = pattern.replace(/\{[^{}]*\|[^{}]+\}/g, "<<<ANY>>>");
	pattern = pattern.replace(/\{%[\s\S]*?%\}/g, "<<<ANY>>>");

	// Replace template variables with regex patterns (before escaping special chars)
	// {number} is the only one we want to capture
	pattern = pattern.replace(/\{number\}/g, "<<<NUMBER>>>");

	// Replace other variables with patterns that match their likely content
	// {title} and {title_yaml} can contain almost anything except file-system forbidden chars
	pattern = pattern.replace(/\{title\}/g, "<<<TITLE>>>");
	pattern = pattern.replace(/\{title_yaml\}/g, "<<<TITLE>>>");

	// Simple word-based patterns
	pattern = pattern.replace(/\{status\}/g, "<<<WORD>>>");
	pattern = pattern.replace(/\{type\}/g, "<<<WORD>>>");
	pattern = pattern.replace(/\{state\}/g, "<<<WORD>>>");

	// Username/repo patterns (no spaces)
	pattern = pattern.replace(/\{author\}/g, "<<<NOSPACE>>>");
	pattern = pattern.replace(/\{assignee\}/g, "<<<OPTIONAL_NOSPACE>>>");
	pattern = pattern.replace(/\{repository\}/g, "<<<NOSPACE>>>");
	pattern = pattern.replace(/\{owner\}/g, "<<<NOSPACE>>>");
	pattern = pattern.replace(/\{repoName\}/g, "<<<NOSPACE>>>");
	pattern = pattern.replace(/\{milestone\}/g, "<<<OPTIONAL_NOSPACE>>>");

	// Date patterns
	pattern = pattern.replace(/\{created(?::[^}]+)?\}/g, "<<<DATE>>>");
	pattern = pattern.replace(/\{updated(?::[^}]+)?\}/g, "<<<DATE>>>");
	pattern = pattern.replace(/\{closed(?::[^}]+)?\}/g, "<<<OPTIONAL_DATE>>>");

	// Array patterns (can be comma-separated, etc)
	pattern = pattern.replace(/\{labels(?::[^}]+)?\}/g, "<<<ANY>>>");
	pattern = pattern.replace(/\{assignees(?::[^}]+)?\}/g, "<<<ANY>>>");

	// Handle conditional blocks and any remaining variables
	pattern = pattern.replace(/\{\w+:[^}]*\}/g, "<<<ANY>>>");
	pattern = pattern.replace(/\{[^}]+\}/g, "<<<ANY>>>");

	// Now escape special regex characters in the remaining static parts
	pattern = escapeRegExp(pattern);

	// Replace our placeholders with actual regex patterns
	pattern = pattern.replace(/<<<NUMBER>>>/g, "(\\d+)");
	pattern = pattern.replace(/<<<TITLE>>>/g, "(.+?)"); // More permissive for titles
	pattern = pattern.replace(/<<<WORD>>>/g, "[A-Za-z0-9_-]+");
	pattern = pattern.replace(/<<<NOSPACE>>>/g, "[A-Za-z0-9_-]+");
	pattern = pattern.replace(/<<<OPTIONAL_NOSPACE>>>/g, "[A-Za-z0-9_-]*");
	pattern = pattern.replace(/<<<DATE>>>/g, "[\\d\\-T:Z\\s]+");
	pattern = pattern.replace(/<<<OPTIONAL_DATE>>>/g, "[\\d\\-T:Z\\s]*");
	pattern = pattern.replace(/<<<ANY>>>/g, ".*?");

	try {
		const regex = new RegExp(`^${pattern}$`);
		const match = baseFilename.match(regex);

		if (match && match[1]) {
			return match[1];
		}
	} catch (error) {
		console.warn(
			`Failed to parse filename "${filename}" with template "${template}":`,
			error,
		);
		console.warn(`Generated regex pattern: ${pattern}`);
	}

	return null;
}
