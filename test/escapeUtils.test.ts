import { describe, expect, it } from "vitest";
import { escapeBody, escapeYamlString } from "../src/util/escapeUtils";

describe("escapeBody", () => {
	const sample = "Text {{var}} <% tpl %> `code` --- <script>$x</script>";

	it("leaves text untouched when disabled", () => {
		expect(escapeBody(sample, "disabled")).toBe(sample);
	});

	it("neutralises Templater and Dataview syntax in normal mode", () => {
		const out = escapeBody(sample, "normal");
		expect(out).not.toContain("{{");
		expect(out).not.toContain("<%");
		expect(out).not.toContain("`");
		expect(out).not.toContain("---");
	});

	it("removes HTML and template characters in strict mode", () => {
		const out = escapeBody(sample, "strict");
		expect(out).not.toMatch(/[<>{}$`\\]/);
		expect(out).toContain("script");
	});

	it("removes quotes and more in veryStrict mode", () => {
		expect(escapeBody(`a "b" 'c' |&*~^`, "veryStrict")).toBe("a b c ");
	});

	it("keeps Unicode in strict modes", () => {
		expect(escapeBody("Grüße 你好", "veryStrict")).toBe("Grüße 你好");
	});

	it("escapes hashtags but not Markdown headers", () => {
		expect(escapeBody("# Title\n#tag and #1337", "normal", true)).toBe(
			"# Title\n\\#tag and \\#1337",
		);
	});

	it("rejects null input", () => {
		expect(() => escapeBody(null as unknown as string)).toThrow();
	});
});

describe("escapeYamlString", () => {
	it("escapes backslashes before quotes", () => {
		expect(escapeYamlString('a\\b"c')).toBe('a\\\\b\\"c');
	});
});
