import { css, cx } from "@emotion/css";
import { InputHTMLAttributes } from "preact";
import unsignal from "../util/unsignal";
import { themeVars } from "../util/theme";

const styles = {
	input: css({
		height: "2.5rem",
		paddingInline: "0.75rem",
		borderRadius: "0.25rem",
		borderStyle: "solid",
		borderColor: themeVars.outline1,

		outline: 0,

		"&:focus": {
			borderColor: themeVars.focusOutline,
		},
	}),
};

export default function Input(props: InputHTMLAttributes<HTMLInputElement>) {
	return <input {...props} class={cx(styles.input, unsignal(props.className), unsignal(props.class))} />;
}
