import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["dist/**", "node_modules/**", "main.js", "*.mjs"],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// Type-aware rules the Obsidian plugin review reports
			// (obsidianmd recommended turns these off via disable-type-checked).
			// Detect `any` but never auto-fix to `unknown` (obsidianmd enables
			// fixToUnknown, which silently breaks the build); type these by hand.
			"@typescript-eslint/no-explicit-any": [
				"warn",
				{ fixToUnknown: false },
			],
			"@typescript-eslint/no-floating-promises": "warn",
			"@typescript-eslint/no-misused-promises": "warn",
			"@typescript-eslint/no-unnecessary-type-assertion": "warn",
			"@typescript-eslint/no-redundant-type-constituents": "warn",
			// Match the review's allowed "_"-prefix escape hatch.
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
			// Not part of the Obsidian review report: silence to keep signal
			// focused on the reported items (the unsafe-* family is a
			// downstream symptom of `any` and clears once typing lands).
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/restrict-template-expressions": "off",
			"@typescript-eslint/require-await": "off",
			"@typescript-eslint/no-base-to-string": "off",
			"@typescript-eslint/only-throw-error": "off",
			"@typescript-eslint/no-confusing-void-expression": "off",
			"obsidianmd/ui/sentence-case": "off",
		},
	},
);
