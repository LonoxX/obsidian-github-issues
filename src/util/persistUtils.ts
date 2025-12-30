/**
 * Utility functions for handling persist blocks in notes.
 *
 * Inspired by the persist block feature from:
 * https://github.com/mgmeyers/obsidian-zotero-integration
 *
 * The persist block concept allows users to protect sections of their notes
 * from being overwritten during sync operations, similar to how the Zotero
 * Integration plugin preserves user annotations and comments.
 */


/**
 * Information about a persist block including its content and position
 */
interface PersistBlockInfo {
	content: string;
	position: number;
	fullMatch: string;
}

/**
 * Extract all persist blocks from content with position information
 * Format: {% persist "blockName" %}...{% endpersist %}
 * @param content The content to extract persist blocks from
 * @returns Map of block names to their content and position info
 */
export function extractPersistBlocks(content: string): Map<string, PersistBlockInfo> {
	const persistBlocks = new Map<string, PersistBlockInfo>();

	// Match {% persist "name" %} ... {% endpersist %}
	const persistPattern = /\{%\s*persist\s+["']([^"']+)["']\s*%\}([\s\S]*?)\{%\s*endpersist\s*%\}/g;

	let match;
	while ((match = persistPattern.exec(content)) !== null) {
		const blockName = match[1];
		const blockContent = match[2];
		const position = match.index;
		const fullMatch = match[0];

		persistBlocks.set(blockName, {
			content: blockContent,
			position: position,
			fullMatch: fullMatch
		});
	}

	return persistBlocks;
}

/**
 * Merge persist blocks back into new content
 * Replaces persist block placeholders in new content with saved blocks.
 * If the new content doesn't have persist blocks, they are inserted at their original positions.
 * @param newContent The new content with persist block placeholders
 * @param oldContent The old content (to calculate relative positions)
 * @param persistBlocks Map of block names to their saved content and position info
 * @returns Content with persist blocks restored
 */
export function mergePersistBlocks(
	newContent: string,
	oldContent: string,
	persistBlocks: Map<string, PersistBlockInfo>
): string {
	let result = newContent;
	const processedBlocks = new Set<string>();

	// First pass: Replace persist blocks that exist in the new content
	const persistPattern = /\{%\s*persist\s+["']([^"']+)["']\s*%\}[\s\S]*?\{%\s*endpersist\s*%\}/g;

	result = result.replace(persistPattern, (match, blockName) => {
		processedBlocks.add(blockName);
		if (persistBlocks.has(blockName)) {
			// Restore the saved content
			const blockInfo = persistBlocks.get(blockName)!;
			return `{% persist "${blockName}" %}${blockInfo.content}{% endpersist %}`;
		}
		// If no saved content, keep the new content
		return match;
	});

	// Second pass: Insert persist blocks that weren't in the new content
	// at their approximate original positions
	const blocksToInsert: Array<{ name: string; info: PersistBlockInfo }> = [];

	for (const [blockName, blockInfo] of persistBlocks.entries()) {
		if (!processedBlocks.has(blockName)) {
			blocksToInsert.push({ name: blockName, info: blockInfo });
		}
	}

	// Insert blocks based on their context/position in old content
	if (blocksToInsert.length > 0) {
		result = insertPersistBlocksIntelligently(oldContent, result, blocksToInsert);
	}

	return result;
}

/**
 * Insert persist blocks intelligently into new content based on context from old content
 * Tries to preserve the exact position where the user placed them
 * @param oldContent The old content
 * @param newContent The new content
 * @param blocksToInsert Array of blocks to insert
 * @returns Content with blocks inserted
 */
function insertPersistBlocksIntelligently(
	oldContent: string,
	newContent: string,
	blocksToInsert: Array<{ name: string; info: PersistBlockInfo }>
): string {
	// Split both contents into lines for easier manipulation
	const oldLines = oldContent.split('\n');
	const newLines = newContent.split('\n');

	for (const { name, info } of blocksToInsert) {
		const blockText = `\n{% persist "${name}" %}${info.content}{% endpersist %}`;

		// Find the line number where the block was in the old content
		let oldLineNumber = 0;
		let charCount = 0;
		for (let i = 0; i < oldLines.length; i++) {
			if (charCount >= info.position) {
				oldLineNumber = i;
				break;
			}
			charCount += oldLines[i].length + 1; // +1 for newline
		}

		// Strategy 1: Look for unique text anchors around the block position
		// Get 2 lines before and 2 lines after the block (if they exist)
		const contextBefore: string[] = [];
		const contextAfter: string[] = [];

		for (let i = Math.max(0, oldLineNumber - 2); i < oldLineNumber; i++) {
			const line = oldLines[i];
			// Skip frontmatter, empty lines, and the persist block itself
			if (line && line.trim() !== '---' && !line.includes('{% persist')) {
				contextBefore.push(line.trim());
			}
		}

		// Find the end of the persist block
		let blockEndLine = oldLineNumber;
		for (let i = oldLineNumber; i < oldLines.length; i++) {
			if (oldLines[i].includes('{% endpersist %}')) {
				blockEndLine = i;
				break;
			}
		}

		for (let i = blockEndLine + 1; i < Math.min(oldLines.length, blockEndLine + 3); i++) {
			const line = oldLines[i];
			if (line && line.trim() !== '' && !line.includes('{% persist')) {
				contextAfter.push(line.trim());
			}
		}

		// Try to find these context lines in the new content
		let insertIndex = -1;

		// First, find where the frontmatter ends in the new content
		let frontmatterEnd = 0;
		if (newLines[0]?.trim() === '---') {
			for (let i = 1; i < newLines.length; i++) {
				if (newLines[i]?.trim() === '---') {
					frontmatterEnd = i + 1;
					break;
				}
			}
		}

		// Look for the last context line before the block (but only outside frontmatter)
		if (contextBefore.length > 0) {
			const lastContextLine = contextBefore[contextBefore.length - 1];
			for (let i = frontmatterEnd; i < newLines.length; i++) {
				if (newLines[i].trim() === lastContextLine) {
					insertIndex = i + 1;
					break;
				}
			}
		}

		// If we couldn't find context before, look for context after (but only outside frontmatter)
		if (insertIndex === -1 && contextAfter.length > 0) {
			const firstContextAfter = contextAfter[0];
			for (let i = frontmatterEnd; i < newLines.length; i++) {
				if (newLines[i].trim() === firstContextAfter) {
					insertIndex = i;
					break;
				}
			}
		}

		// Strategy 2: If no context found, use relative position
		if (insertIndex === -1 || insertIndex < frontmatterEnd) {
			// Calculate relative position (percentage through the document)
			const relativePosition = oldLineNumber / oldLines.length;
			insertIndex = Math.floor(newLines.length * relativePosition);

			// Make sure we're not in the frontmatter
			if (insertIndex < frontmatterEnd) {
				insertIndex = frontmatterEnd;
			}
		}

		// Insert the block at the calculated position
		newLines.splice(insertIndex, 0, blockText);
	}

	return newLines.join('\n');
}
