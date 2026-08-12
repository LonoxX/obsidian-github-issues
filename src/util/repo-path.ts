/**
 * Helpers for parsing repository identifiers of the form `owner/repo`.
 *
 * GitLab projects can live under nested groups, so the identifier may contain
 * more than one slash (e.g. `intern/brotherhoodrp/polas`). A naive
 * `const [owner, repo] = id.split("/")` drops every segment after the second.
 * These helpers split on the *last* slash so nested namespaces are preserved
 * while still working for GitHub's plain `owner/repo`.
 */

/**
 * Split a repository identifier into its owner path and repo name.
 * The owner is everything before the last slash, the repo is the last segment.
 */
export function parseRepository(repository: string): {
	owner: string;
	repo: string;
} {
	const idx = repository.lastIndexOf("/");
	if (idx < 0) return { owner: "", repo: repository };
	return { owner: repository.slice(0, idx), repo: repository.slice(idx + 1) };
}

/**
 * Sanitize a single path segment by stripping filesystem-unsafe characters.
 */
export function sanitizeFolderSegment(seg: string): string {
	return seg
		.replace(/[<>:"|?*\\]/g, "-")
		.replace(/\.\./g, ".")
		.trim();
}

/**
 * Sanitize an owner path segment-by-segment, keeping "/" as a folder separator
 * so nested GitLab groups map onto nested folders.
 */
export function sanitizeOwnerPath(owner: string): string {
	return owner
		.split("/")
		.map(sanitizeFolderSegment)
		.filter(Boolean)
		.join("/");
}
