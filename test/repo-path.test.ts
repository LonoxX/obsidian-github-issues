import { describe, expect, it } from "vitest";
import {
	parseRepository,
	sanitizeFolderSegment,
	sanitizeOwnerPath,
} from "../src/util/repo-path";

describe("parseRepository", () => {
	it("splits plain owner/repo", () => {
		expect(parseRepository("LonoxX/LonoxX-Testing")).toEqual({
			owner: "LonoxX",
			repo: "LonoxX-Testing",
		});
	});

	it("keeps nested GitLab groups in the owner", () => {
		expect(parseRepository("intern/brotherhoodrp/polas")).toEqual({
			owner: "intern/brotherhoodrp",
			repo: "polas",
		});
	});

	it("returns an empty owner without a slash", () => {
		expect(parseRepository("repo")).toEqual({ owner: "", repo: "repo" });
	});
});

describe("sanitize helpers", () => {
	it("replaces filesystem-unsafe characters and collapses ..", () => {
		expect(sanitizeFolderSegment(' a<b>c:"d|e?f*g\\h ')).toBe(
			"a-b-c--d-e-f-g-h",
		);
		expect(sanitizeFolderSegment("..")).toBe(".");
	});

	it("keeps / as folder separator and drops empty segments", () => {
		expect(sanitizeOwnerPath("group//sub:x")).toBe("group/sub-x");
	});
});
