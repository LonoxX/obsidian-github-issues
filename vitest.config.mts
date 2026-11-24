import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: fileURLToPath(
				new URL("./test/obsidian.mock.ts", import.meta.url),
			),
		},
	},
	test: {
		include: ["test/**/*.test.ts"],
		environment: "node",
	},
});
