import { vi } from "vitest";

export interface MockResponse {
	status: number;
	json: unknown;
	text?: string;
	headers?: Record<string, string>;
}

export interface MockRequest {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
}

export const requestUrl = vi.fn(
	async (_req: MockRequest): Promise<MockResponse> => ({
		status: 404,
		json: null,
		headers: {},
	}),
);

export const addIcon = vi.fn();
export const setIcon = vi.fn();

export class Notice {
	constructor(public message: string) {}
}
