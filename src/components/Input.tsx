import { css, cx } from "@emotion/css";
import { InputHTMLAttributes } from "preact";
import unsignal from "../util/unsignal";
import { themeVars } from "../util/theme";
import { useContext, useEffect, useRef } from "preact/hooks";
import { FieldContext } from "./Field";

const styles = {
	input: css({
		fontSize: "1rem",
		paddingInline: "0.5rem",
		paddingBlock: "0.5rem",
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
	const fieldCtx = useContext(FieldContext);

	const ref = useRef<HTMLInputElement>(null);

	const autofocus = unsignal(props.autofocus);

	useEffect(() => {
		if(autofocus === true) {
			ref.current!.focus();
		}
	}, [autofocus]);

	return <input
		id={fieldCtx?.id}
		{...props}
		class={cx(styles.input, unsignal(props.className), unsignal(props.class))}
		ref={ref}
	/>;
}
