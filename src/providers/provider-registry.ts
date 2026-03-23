import { IssueProvider, ProviderId } from "./provider";
import { ProviderType } from "../types";

/**
 * Central registry that holds all configured provider instances.
 * Used by main.ts to look up the correct provider for a repository.
 */
export class ProviderRegistry {
	private providers = new Map<string, IssueProvider>();

	register(provider: IssueProvider): void {
		this.providers.set(provider.id, provider);
	}

	get(id: ProviderId): IssueProvider | undefined {
		return this.providers.get(id);
	}

	getAll(): IssueProvider[] {
		return Array.from(this.providers.values());
	}

	getEnabled(): IssueProvider[] {
		return this.getAll().filter((p) => p.isReady());
	}

	/** Get all providers of a specific type (e.g. all GitLab instances) */
	getByType(type: ProviderType): IssueProvider[] {
		return this.getAll().filter((p) => p.type === type);
	}

	has(id: ProviderId): boolean {
		return this.providers.has(id);
	}

	dispose(): void {
		for (const provider of this.providers.values()) {
			provider.dispose();
		}
		this.providers.clear();
	}
}
