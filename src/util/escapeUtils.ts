/**
 * Escapes # characters that are not valid Markdown headers to prevent
 * unintended Obsidian tags (e.g., #1337-YesSr becomes \#1337-YesSr)
 * while preserving valid Markdown headers (# followed by space)
 * @param text The text to process
 * @returns The text with escaped # characters
 */
function escapeHashTags(text: string): string {
	const lines = text.split('\n');

	return lines.map(line => {
		const trimmed = line.trim();

		// Check if this is a valid Markdown header (one or more # followed by a space)
		// Valid: "# Header", "## Header", "### Header", etc.
		// Invalid: "#1337", "#tag", "###NoSpace"
		if (/^#{1,6}\s/.test(trimmed)) {
			// This is a valid Markdown header, don't escape
			return line;
		}

		// Escape all # characters in this line
		return line.replace(/#/g, '\\#');
	}).join('\n');
}

/**
 * Utility function for escaping content in different modes
 * @param unsafe The string to escape
 * @param mode The escaping mode: "disabled", "normal", "strict", or "veryStrict"
 * @param shouldEscapeHashTags Whether to apply context-sensitive # escaping
 * @returns The escaped string
 * @throws Error if input is null or undefined
 *
 * Modes:
 * - disabled: No escaping applied
 * - normal: Basic escaping for Templater and Dataview compatibility
 * - strict: Remove potentially dangerous HTML/JS characters (preserves Unicode)
 * - veryStrict: Remove more special characters (preserves Unicode but more restrictive)
 */
export function escapeBody(
	unsafe: string,
	mode: "disabled" | "normal" | "strict" | "veryStrict" = "normal",
	shouldEscapeHashTags: boolean = false,
): string {
	// Validate input
	if (unsafe === null || unsafe === undefined) {
		throw new Error("Input cannot be null or undefined");
	}

	// No escaping in disabled mode
	if (mode === "disabled") {
		return unsafe;
	}

	// Apply mode-specific escaping
	let escaped: string;

	switch (mode) {
		case "strict":
			// Allow Unicode characters, whitespace, common punctuation, and URL/Markdown specific characters
			// Remove potentially dangerous characters while preserving Chinese and other Unicode characters
			escaped = unsafe
				.replace(/[<>{}$`\\]/g, "")  // Remove potentially dangerous HTML/JS/template characters
				.replace(/---/g, "- - -");  // Escape YAML frontmatter separators
			break;

		case "veryStrict":
			// Allow Unicode characters, whitespace, basic punctuation, and essential URL/Markdown characters
			// More restrictive than strict mode but still preserves Chinese and other Unicode characters
			escaped = unsafe
				.replace(/[<>{}$`\\"'|&*~^]/g, "")  // Remove more potentially dangerous characters
				.replace(/---/g, "- - -");  // Escape YAML frontmatter separators
			break;

		case "normal":
		default:
			// Basic escaping for Templater and Dataview compatibility
			escaped = unsafe
				.replace(/<%/g, "'<<'")    // Templater tags
				.replace(/%>/g, "'>>'")    // Templater tags
				.replace(/`/g, '"')        // Backticks (can interfere with Dataview)
				.replace(/---/g, "- - -")  // YAML frontmatter separators
				.replace(/{{/g, "((")      // Templater/Dataview variables
				.replace(/}}/g, "))");     // Templater/Dataview variables
			break;
	}

	// Apply context-sensitive # escaping if enabled
	return shouldEscapeHashTags ? escapeHashTags(escaped) : escaped;
}

/**
 * Escape a string for use in YAML double-quoted strings
 * @param str The string to escape
 * @returns The escaped string
 */
export function escapeYamlString(str: string): string {
	// In YAML double-quoted strings, we need to escape backslashes and double quotes
	return str
		.replace(/\\/g, '\\\\')  // Escape backslashes first
		.replace(/"/g, '\\"');   // Then escape double quotes
}
