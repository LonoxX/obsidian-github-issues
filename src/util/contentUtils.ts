/**
 * Utility functions for comparing and validating content
 */

/**
 * Check if content has changed based on updated_at field
 * @param existingContent The existing file content
 * @param githubUpdatedAt The updated_at timestamp from GitHub API
 * @returns true if content should be updated
 */
export function shouldUpdateContent(
	existingContent: string,
	githubUpdatedAt: string
): boolean {
	// Extract updated field from frontmatter
	const updatedMatch = existingContent.match(/^updated:\s*["']?([^"'\n]+)["']?$/m);

	if (!updatedMatch) {
		// No updated field found, should update
		return true;
	}

	const existingUpdated = updatedMatch[1];
	const githubUpdated = new Date(githubUpdatedAt).toISOString();
	const existingUpdatedDate = new Date(existingUpdated);
	const githubUpdatedDate = new Date(githubUpdated);

	// Compare dates - update if GitHub version is newer
	return githubUpdatedDate > existingUpdatedDate;
}

/**
 * Check if status has changed (e.g., open -> closed or closed -> open)
 * @param existingContent The existing file content
 * @param githubStatus The current status from GitHub API
 * @returns true if status has changed
 */
export function hasStatusChanged(
	existingContent: string,
	githubStatus: string
): boolean {
	// Extract status field from frontmatter
	const statusMatch = existingContent.match(/^status:\s*["']?([^"'\n]+)["']?$/m);

	if (!statusMatch) {
		// No status field found, should update
		return true;
	}

	const existingStatus = statusMatch[1];

	// Status has changed if they don't match
	return existingStatus !== githubStatus;
}
