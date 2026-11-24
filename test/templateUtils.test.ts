import { describe, expect, it } from "vitest";
import {
	extractNumberFromFilename,
	sanitizeFilename,
} from "../src/util/templateUtils";

describe("sanitizeFilename", () => {
	it("replaces invalid characters and whitespace", () => {
		expect(sanitizeFilename('a/b:c*d?"e\n\tf  g')).toBe("a-b-c-d--e f g");
	});

	it("trims leading and trailing dots", () => {
		expect(sanitizeFilename("..hidden..")).toBe("hidden");
	});

	it("limits the length to 255 characters", () => {
		expect(sanitizeFilename("x".repeat(300))).toHaveLength(255);
	});
});

describe("extractNumberFromFilename", () => {
	it("reads plain number filenames", () => {
		expect(extractNumberFromFilename("42.md", "{number}")).toBe("42");
		expect(extractNumberFromFilename("abc.md", "{number}")).toBeNull();
	});

	it("reads numbers from templated filenames", () => {
		expect(
			extractNumberFromFilename(
				"Issue 17 - Title.md",
				"Issue {number} - {title}",
			),
		).toBe("17");
	});
});

describe("provider placeholders", () => {
	it("fills {provider} and {providerId} in filename templates", async () => {
		const { createIssueTemplateData, processFilenameTemplate } =
			await import("../src/util/templateUtils");
		const data = createIssueTemplateData(
			{ number: 7, title: "Test", created_at: "2026-01-01T00:00:00Z" },
			"LonoxX/LonoxX-Testing",
			[],
			"",
			"normal",
			false,
			undefined,
			undefined,
			undefined,
			{ name: "GitLab", id: "gitlab" },
		);
		expect(
			processFilenameTemplate(
				"{provider} {providerId} {number}",
				data,
				"",
			),
		).toBe("GitLab gitlab 7");
	});

	it("still finds the issue number in names with {provider}", () => {
		expect(
			extractNumberFromFilename(
				"Forgejo (codeberg.org) - 12.md",
				"{provider} - {number}",
			),
		).toBe("12");
	});
});
