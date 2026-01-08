import preact from "@preact/preset-vite";
import * as pathUtil from "path";
import checker from "vite-plugin-checker";

export default {
	plugins: [
		checker({
			typescript: true,
			eslint: {
				lintCommand: "eslint src/**/*.{ts,tsx}",
				useFlatConfig: true,
			},
		}),
		preact(),
	],
	resolve: {
		alias: {
			"@xmpp/sasl-scram-sha-1": pathUtil.resolve(__dirname, "node_modules/@xmpp/sasl-scram-sha-1/index.js"),
			"react": "preact/compat",
			"react-dom": "preact/compat",
		},
	},
	define: {
		global: "window",
	},
};
