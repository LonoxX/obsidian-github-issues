import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "../src/types";
import { providerIcon, providerLabel } from "../src/util/provider-ui";

const base = {
	enabled: true,
	token: "",
	useSecretStorage: false,
	secretTokenName: "",
};
const gh: ProviderConfig = { ...base, id: "github", type: "github" };
const gh2: ProviderConfig = { ...base, id: "github-2", type: "github" };
const ghe: ProviderConfig = {
	...base,
	id: "github-3",
	type: "github",
	baseUrl: "https://ghe.example.com",
};
const gl: ProviderConfig = { ...base, id: "gitlab", type: "gitlab" };
const gl2: ProviderConfig = {
	...base,
	id: "gitlab-2",
	type: "gitlab",
	baseUrl: "https://git.example.com",
};
const fj: ProviderConfig = { ...base, id: "forgejo", type: "forgejo" };
const fj2: ProviderConfig = {
	...base,
	id: "forgejo-2",
	type: "forgejo",
	baseUrl: "https://forgejo.example.org/",
};

describe("providerLabel", () => {
	it("uses the custom label first", () => {
		expect(providerLabel({ ...gl, label: "Firma" }, [gl])).toBe("Firma");
	});

	it("shows plain names for single instances", () => {
		expect(providerLabel(gh, [gh])).toBe("GitHub");
		expect(providerLabel(gl, [gl])).toBe("GitLab");
	});

	it("always shows the host for Forgejo/Gitea, codeberg.org by default", () => {
		expect(providerLabel(fj, [fj])).toBe("Forgejo (codeberg.org)");
		expect(providerLabel(fj2, [fj, fj2])).toBe(
			"Forgejo (forgejo.example.org)",
		);
	});

	it("tells multiple instances of one type apart", () => {
		expect(providerLabel(gl2, [gl, gl2])).toBe("GitLab (git.example.com)");
		expect(providerLabel(gh, [gh, gh2])).toBe("GitHub");
		expect(providerLabel(gh2, [gh, gh2])).toBe("GitHub 2");
		expect(providerLabel(ghe, [gh, ghe])).toBe("GitHub (ghe.example.com)");
	});
});

describe("providerIcon", () => {
	it("maps types to the plugin's own brand icons", () => {
		expect(providerIcon("gitlab")).toBe("github-issues-provider-gitlab");
		expect(providerIcon("forgejo")).toBe("github-issues-provider-forgejo");
		expect(providerIcon(undefined)).toBe("github-issues-provider-github");
	});
});
