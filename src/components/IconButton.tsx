import { ButtonHTMLAttributes } from "preact";
import { css, cx } from "@emotion/css";

import unsignal from "../util/unsignal";
import { themeVars } from "../util/theme";

const styles = {
	iconButton: css({
		borderRadius: "50%",
		background: "none",
		border: "none",
		fontSize: "1.5rem",
		position: "relative",
		padding: ".5rem",

		"> .icon": {
			display: "block",
		},

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
			borderRadius: "50%",
			opacity: 0,
			backgroundColor: themeVars.hoverOverlay,
		},

		"&:hover": {
			"&::after": {
				opacity: 1,
			},
		},
	}),
};

export default function IconButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
	return <button {...props} class={cx(styles.iconButton, unsignal(props.className), unsignal(props.class))} />;
}
