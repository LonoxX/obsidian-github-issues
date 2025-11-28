/**
 * Utility functions for processing note title templates
 */

import { format } from "date-fns";
import { escapeBody , escapeYamlString} from "./escapeUtils";

/**
 * Represents the data available for template replacement
 */
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
	// PR specific fields
	mergedAt?: Date;
	mergeable?: boolean;
	merged?: boolean;
	baseBranch?: string;
	headBranch?: string;
	// Additional fields
	commentsCount: number;
	isLocked: boolean;
	lockReason?: string;
	comments?: string; // Formatted comments section
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
	escapeHashTags: boolean = false
): string {
	if (!comments || comments.length === 0) {
		return "";
	}

	comments.sort(
		(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
	);

	let commentSection = "\n## Comments\n\n";

	comments.forEach((comment) => {
		const createdAt = dateFormat !== ""
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

		// Use escapeBody function for proper text escaping
		commentSection += `${escapeBody(
			comment.body || "No content",
			escapeMode,
			escapeHashTags
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
	dateFormat: string = ""
): string {
	let result = template;

	// Process conditional blocks first (e.g., {closed:- **Closed:** {closed}})
	result = processConditionalBlocks(result, data);

	// Available template variables:
	const replacements: Record<string, string> = {
		"{title}": data.title || "Untitled",
		"{title_yaml}": data.title_yaml || "Untitled",
		"{number}": data.number.toString(),
		"{status}": data.status || "unknown",
		"{state}": data.state || data.status || "unknown",
		"{author}": data.author || "unknown",
		"{assignee}": data.assignee || "unassigned",
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
			? (dateFormat ? format(data.updated, dateFormat) : data.updated.toLocaleDateString())
			: "",
		"{closed}": data.closed
			? (dateFormat ? format(data.closed, dateFormat) : data.closed.toLocaleDateString())
			: "",
	};

	// PR specific fields
	if (data.type === "pr") {
		replacements["{mergedAt}"] = data.mergedAt
			? (dateFormat ? format(data.mergedAt, dateFormat) : data.mergedAt.toLocaleDateString())
			: "";
		replacements["{mergeable}"] = data.mergeable !== undefined ? (data.mergeable ? "true" : "false") : "unknown";
		replacements["{merged}"] = data.merged ? "true" : "false";
		replacements["{baseBranch}"] = data.baseBranch || "";
		replacements["{headBranch}"] = data.headBranch || "";
	}

	// Handle arrays with special formatting
	if (data.assignees && data.assignees.length > 0) {
		replacements["{assignees}"] = data.assignees.join(", ");
		replacements["{assignees_list}"] = data.assignees.map(a => `- ${a}`).join("\n");
		replacements["{assignees_yaml}"] = `[${data.assignees.map(a => `"${a}"`).join(", ")}]`;
	} else {
		replacements["{assignees}"] = "unassigned";
		replacements["{assignees_list}"] = "";
		replacements["{assignees_yaml}"] = "[]";
	}

	if (data.labels && data.labels.length > 0) {
		replacements["{labels}"] = data.labels.join(", ");
		replacements["{labels_list}"] = data.labels.map(l => `- ${l}`).join("\n");
		replacements["{labels_hash}"] = data.labels.map(l => `#${l.replace(/\s/g, "_")}`).join(" ");
		replacements["{labels_yaml}"] = `[${data.labels.map(l => `"${l}"`).join(", ")}]`;
	} else {
		replacements["{labels}"] = "";
		replacements["{labels_list}"] = "";
		replacements["{labels_hash}"] = "";
		replacements["{labels_yaml}"] = "[]";
	}

	// Add comments variable
	replacements["{comments}"] = data.comments || "";

	// Replace all variables
	for (const [placeholder, value] of Object.entries(replacements)) {
		result = result.replace(new RegExp(escapeRegExp(placeholder), "g"), value);
	}

	return result;
}/**
 * Process a template string for filename generation (with sanitization)
 * @param template The template string for filename
 * @param data The data to use for replacement
 * @param dateFormat Optional date format string
 * @returns Processed and sanitized filename
 */
export function processFilenameTemplate(
	template: string,
	data: TemplateData,
	dateFormat: string = ""
): string {
	const result = processTemplate(template, data, dateFormat);
	return sanitizeFilename(result);
}

/**
 * Process a content template from a template file
 * @param templateContent The content of the template file
 * @param data The data to use for replacement
 * @param dateFormat Optional date format string
 * @returns Processed template content
 */
export function processContentTemplate(
	templateContent: string,
	data: TemplateData,
	dateFormat: string = ""
): string {
	return processTemplate(templateContent, data, dateFormat);
}

/**
 * Escape special regex characters in a string
 */
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
function processConditionalBlocks(template: string, data: TemplateData): string {
	// Pattern: {variableName:content} - show content only if variableName has a value
	const conditionalPattern = /\{(\w+):(.*?)\}/g;

	return template.replace(conditionalPattern, (match, variableName, content) => {
		// Check if the variable exists and has a meaningful value
		const value = getVariableValue(variableName, data);

		if (value && value !== "" && value !== "0" && value !== "false" && value !== "unknown" && value !== "unassigned") {
			return content;
		}

		return ""; // Remove the block if condition is not met
	});
}

/**
 * Get variable value from template data
 */
function getVariableValue(variableName: string, data: TemplateData): string | undefined {
	switch (variableName) {
		case "closed": return data.closed ? "true" : undefined;
		case "updated": return data.updated ? "true" : undefined;
		case "mergedAt": return data.mergedAt ? "true" : undefined;
		case "milestone": return data.milestone;
		case "assignee": return data.assignee;
		case "assignees": return data.assignees && data.assignees.length > 0 ? "true" : undefined;
		case "labels": return data.labels && data.labels.length > 0 ? "true" : undefined;
		case "body": return data.body;
		case "lockReason": return data.lockReason;
		case "baseBranch": return data.baseBranch;
		case "headBranch": return data.headBranch;
		case "merged": return data.merged ? "true" : undefined;
		case "mergeable": return data.mergeable !== undefined ? "true" : undefined;
		default: return undefined;
	}
}

/**
 * Create template data from an issue object
 * @param issue The issue data from GitHub API
 * @param repository The repository string (owner/repo)
 * @returns TemplateData object
 */
export function createIssueTemplateData(
	issue: any,
	repository: string,
	comments: any[] = [],
	dateFormat: string = "",
	escapeMode: "disabled" | "normal" | "strict" | "veryStrict" = "normal",
	escapeHashTags: boolean = false
): TemplateData {
	const [owner, repoName] = repository.split("/");

	// Ensure milestone data is properly extracted
	const milestoneTitle = issue.milestone?.title || issue.milestone?.name || "";

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
		comments: formatComments(comments, dateFormat, escapeMode, escapeHashTags)
	};
}

/**
 * Create template data from a pull request object
 * @param pr The pull request data from GitHub API
 * @param repository The repository string (owner/repo)
 * @returns TemplateData object
 */
export function createPullRequestTemplateData(
	pr: any,
	repository: string,
	comments: any[] = [],
	dateFormat: string = "",
	escapeMode: "disabled" | "normal" | "strict" | "veryStrict" = "normal",
	escapeHashTags: boolean = false
): TemplateData {
	const [owner, repoName] = repository.split("/");

	// Ensure milestone data is properly extracted
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
		// PR specific fields
		mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
		mergeable: pr.mergeable,
		merged: pr.merged || false,
		baseBranch: pr.base?.ref,
		headBranch: pr.head?.ref,
		comments: formatComments(comments, dateFormat, escapeMode, escapeHashTags)
	};
}

/**
 * Extract the number from a filename based on the template that was used to create it
 * @param filename The filename to extract the number from
 * @param template The template that was used to create the filename
 * @returns The extracted number or null if not found
 */
export function extractNumberFromFilename(filename: string, template: string): string | null {
	// Remove .md extension if present
	const baseFilename = filename.replace(/\.md$/, '');

	// First, try a simple approach: if the template is just "{number}", extract any number
	if (template === "{number}") {
		const match = baseFilename.match(/^(\d+)$/);
		return match ? match[1] : null;
	}

	// Create a regex pattern from the template by replacing variables BEFORE escaping
	let pattern = template;

	// Replace template variables with regex patterns (before escaping special chars)
	// {number} is the only one we want to capture
	pattern = pattern.replace(/\{number\}/g, '<<<NUMBER>>>');

	// Replace other variables with patterns that match their likely content
	// {title} and {title_yaml} can contain almost anything except file-system forbidden chars
	pattern = pattern.replace(/\{title\}/g, '<<<TITLE>>>');
	pattern = pattern.replace(/\{title_yaml\}/g, '<<<TITLE>>>');

	// Simple word-based patterns
	pattern = pattern.replace(/\{status\}/g, '<<<WORD>>>');
	pattern = pattern.replace(/\{type\}/g, '<<<WORD>>>');
	pattern = pattern.replace(/\{state\}/g, '<<<WORD>>>');

	// Username/repo patterns (no spaces)
	pattern = pattern.replace(/\{author\}/g, '<<<NOSPACE>>>');
	pattern = pattern.replace(/\{assignee\}/g, '<<<OPTIONAL_NOSPACE>>>');
	pattern = pattern.replace(/\{repository\}/g, '<<<NOSPACE>>>');
	pattern = pattern.replace(/\{owner\}/g, '<<<NOSPACE>>>');
	pattern = pattern.replace(/\{repoName\}/g, '<<<NOSPACE>>>');
	pattern = pattern.replace(/\{milestone\}/g, '<<<OPTIONAL_NOSPACE>>>');

	// Date patterns
	pattern = pattern.replace(/\{created(?::[^}]+)?\}/g, '<<<DATE>>>');
	pattern = pattern.replace(/\{updated(?::[^}]+)?\}/g, '<<<DATE>>>');
	pattern = pattern.replace(/\{closed(?::[^}]+)?\}/g, '<<<OPTIONAL_DATE>>>');

	// Array patterns (can be comma-separated, etc)
	pattern = pattern.replace(/\{labels(?::[^}]+)?\}/g, '<<<ANY>>>');
	pattern = pattern.replace(/\{assignees(?::[^}]+)?\}/g, '<<<ANY>>>');

	// Handle conditional blocks and any remaining variables
	pattern = pattern.replace(/\{\w+:[^}]*\}/g, '<<<ANY>>>');
	pattern = pattern.replace(/\{[^}]+\}/g, '<<<ANY>>>');

	// Now escape special regex characters in the remaining static parts
	pattern = escapeRegExp(pattern);

	// Replace our placeholders with actual regex patterns
	pattern = pattern.replace(/<<<NUMBER>>>/g, '(\\d+)');
	pattern = pattern.replace(/<<<TITLE>>>/g, '(.+?)'); // More permissive for titles
	pattern = pattern.replace(/<<<WORD>>>/g, '[A-Za-z0-9_-]+');
	pattern = pattern.replace(/<<<NOSPACE>>>/g, '[A-Za-z0-9_-]+');
	pattern = pattern.replace(/<<<OPTIONAL_NOSPACE>>>/g, '[A-Za-z0-9_-]*');
	pattern = pattern.replace(/<<<DATE>>>/g, '[\\d\\-T:Z\\s]+');
	pattern = pattern.replace(/<<<OPTIONAL_DATE>>>/g, '[\\d\\-T:Z\\s]*');
	pattern = pattern.replace(/<<<ANY>>>/g, '.*?');

	// Create the regex and try to match
	try {
		const regex = new RegExp(`^${pattern}$`);
		const match = baseFilename.match(regex);

		if (match && match[1]) {
			return match[1]; // Return the captured number
		}
	} catch (error) {
		console.warn(`Failed to parse filename "${filename}" with template "${template}":`, error);
		console.warn(`Generated regex pattern: ${pattern}`);
	}

	return null;
}
