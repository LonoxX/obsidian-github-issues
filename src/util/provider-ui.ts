import { ProviderConfig, ProviderType } from "../types";
import { FORGEJO_DEFAULT_URL } from "../providers/forgejo/forgejo-provider";
import { PROVIDER_ICON_PREFIX } from "./provider-icons";

const TYPE_NAMES: Record<ProviderType, string> = {
	github: "GitHub",
	gitlab: "GitLab",
	forgejo: "Forgejo",
};

/** Icon id for a provider type (registered by registerProviderIcons). */
export function providerIcon(type?: ProviderType): string {
	return `${PROVIDER_ICON_PREFIX}${type ?? "github"}`;
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

/**
 * Display label for a provider instance. Self-hosted types show the host when
 * it is needed to tell instances apart; Forgejo/Gitea always shows it, since
 * the same type covers Codeberg, Forgejo and Gitea servers.
 */
export function providerLabel(
	config: ProviderConfig,
	providers: ProviderConfig[],
): string {
	if (config.label) return config.label;
	const name = TYPE_NAMES[config.type] ?? config.id;
	if (config.type === "forgejo") {
		return `${name} (${hostOf(config.baseUrl || FORGEJO_DEFAULT_URL)})`;
	}
	const count = providers.filter((p) => p.type === config.type).length;
	if (count > 1 && config.baseUrl)
		return `${name} (${hostOf(config.baseUrl)})`;
	if (count > 1 && config.type === "github" && config.id !== "github") {
		return `${name} ${config.id.replace(/^github-/, "")}`;
	}
	return name;
}

export interface ProviderTemplateInfo {
	/** Display label of the instance, safe for folder and file names. */
	name: string;
	/** Instance id, e.g. "github" or "forgejo-2". */
	id: string;
}

/** Values for the {provider} and {providerId} placeholders of a repository. */
export function providerTemplateInfo(
	providers: ProviderConfig[] | undefined,
	providerId?: string,
): ProviderTemplateInfo {
	const id = providerId ?? "github";
	const config = providers?.find((p) => p.id === id);
	const label = config ? providerLabel(config, providers ?? []) : "GitHub";
	return { name: label.replace(/[<>:"|?*\\/]/g, "-").trim(), id };
}
