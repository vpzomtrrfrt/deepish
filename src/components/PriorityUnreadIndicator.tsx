import { css, cx } from "@emotion/css";

import { themeVars } from "../util/theme";

const styles = {
	indicator: cx("unreadIndicator", css({
		fontSize: ".8rem",
		width: "1.5em",
		height: "1.5em",
		borderRadius: "50%",
		backgroundColor: "#C62828",
		color: themeVars.textLight,
		fontWeight: "bold",

		display: "inline-flex",
		justifyContent: "center",
		alignItems: "center",
	})),
};

export default function PriorityUnreadIndicator(props: {count: number}) {
	return <div class={styles.indicator}>
		<span>{props.count}</span>
	</div>;
}
