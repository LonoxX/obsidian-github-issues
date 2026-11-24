import { vi } from "vitest";
import { requestUrl, type MockResponse } from "./obsidian.mock";

/**
 * Route requestUrl calls by URL substring. The first matching route wins;
 * unmatched URLs fail the test so no request ever leaves the process.
 */
export function routeRequests(
	routes: Array<[match: string | RegExp, response: MockResponse]>,
): string[] {
	const seen: string[] = [];
	requestUrl.mockImplementation(async ({ url }) => {
		seen.push(url);
		const hit = routes.find(([m]) =>
			typeof m === "string" ? url.includes(m) : m.test(url),
		);
		if (!hit) throw new Error(`Unexpected request: ${url}`);
		return { headers: {}, ...hit[1] };
	});
	return seen;
}

export function json(data: unknown, headers: Record<string, string> = {}) {
	return { status: 200, json: data, headers };
}

export const noticeManager = {
	error: vi.fn(),
	warning: vi.fn(),
	info: vi.fn(),
	debug: vi.fn(),
};

export function daysAgo(days: number): string {
	return new Date(Date.now() - days * 86_400_000).toISOString();
}
