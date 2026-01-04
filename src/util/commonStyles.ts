import { css } from "@emotion/css";

import { themeVars } from "./theme";

export const hoverOverlay = css({
	position: "relative",

	"&::after": {
		content: "\"\"",
		display: "block",
		position: "absolute",
		left: 0,
		top: 0,
		width: "100%",
		height: "100%",
		transition: "opacity 300ms",
		pointerEvents: "none",
		opacity: 0,
		backgroundColor: themeVars.hoverOverlay,
	},

	"&:hover": {
		"&::after": {
			opacity: 1,
		},
	},
});
