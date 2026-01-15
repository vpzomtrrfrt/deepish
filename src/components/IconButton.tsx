import { css, cx } from "@emotion/css";
import { ButtonHTMLAttributes } from "preact";

import * as commonStyles from "../util/commonStyles";
import unsignal from "../util/unsignal";

const styles = {
	iconButton: cx(commonStyles.hoverOverlay, css({
		borderRadius: "50%",
		background: "none",
		border: "none",
		fontSize: "1.5rem",
		position: "relative",
		padding: ".5rem",

		cursor: "pointer",
		color: "inherit",

		"> .icon": {
			display: "block",
		},

		"&::after": {
			borderRadius: "50%",
		},
	})),
};

export default function IconButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
	return <button {...props} class={cx(styles.iconButton, unsignal(props.className), unsignal(props.class))} />;
}
