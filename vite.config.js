import checker from "vite-plugin-checker";
import preact from "@preact/preset-vite";
import * as pathUtil from "path";

export default {
	plugins: [
		checker({typescript: true}),
		preact(),
	],
	resolve: {
		alias: {
			"@xmpp/sasl-scram-sha-1": pathUtil.resolve(__dirname, "node_modules/@xmpp/sasl-scram-sha-1/index.js"),
		},
	},
};
