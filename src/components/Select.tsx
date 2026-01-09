import { css, cx } from "@emotion/css";
import { JSX } from "preact";

import { themeVars } from "../util/theme";
import unsignal from "../util/unsignal";

const styles = {
	select: css({
		position: "relative",
		padding: ".5rem .75rem",
		fontSize: "1rem",

		borderStyle: "solid",
		backgroundColor: themeVars.bg1,
		color: themeVars.textOn1,
		borderColor: themeVars.outline1,
		borderRadius: ".25rem",
	}),
};

export default function Select(props: JSX.SelectHTMLAttributes<HTMLSelectElement>) {
	return <select {...props} class={cx(styles.select, unsignal(props.className), unsignal(props.class))} />;
}
