import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";

export default defineConfig(
	eslint.configs.recommended,
	tseslint.configs.recommended,
	reactHooks.configs.flat.recommended,

	{
		plugins: {
			"simple-import-sort": simpleImportSort,
		},
		rules: {
			"react-hooks/immutability": "off", // triggers false positives with signals

			"@typescript-eslint/no-unused-vars": ["warn", {argsIgnorePattern: "^_", varsIgnorePattern: "^_"}],
			"simple-import-sort/imports": "warn",
			"simple-import-sort/exports": "warn",
		},
	},
);
