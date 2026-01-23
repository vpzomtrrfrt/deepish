import { css, cx } from "@emotion/css";
import { Ref, TextareaHTMLAttributes } from "preact";
import { forwardRef } from "preact/compat";
import { useCallback, useContext, useEffect, useRef } from "preact/hooks";

import { themeVars } from "../util/theme";
import unsignal from "../util/unsignal";
import { FieldContext } from "./Field";

const styles = {
	input: css({
		fontFamily: "inherit",
		fontSize: "1rem",
		paddingInline: "0.5rem",
		paddingBlock: "0.5rem",
		borderRadius: "0.25rem",
		borderStyle: "solid",
		borderWidth: "2px",
		borderColor: themeVars.outline1,
		backgroundColor: "transparent",
		color: themeVars.textOn1,

		outline: 0,

		"&:focus-within": {
			borderColor: themeVars.focusOutline,
		},
	}),
};

const Textarea = forwardRef(
	function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>, parentRef: Ref<HTMLTextAreaElement | null>) {
		const fieldCtx = useContext(FieldContext);

		const ref = useRef<HTMLTextAreaElement>(null);

		const autofocus = unsignal(props.autofocus);

		useEffect(() => {
			if(autofocus === true) {
				ref.current!.focus();
			}
		}, [autofocus]);

		const refCallback = useCallback((value: HTMLTextAreaElement | null) => {
			ref.current = value;

			if(parentRef !== null) {
				if(typeof parentRef === "function") parentRef(value);
				else parentRef.current = value;
			}
		}, [parentRef]);

		return <textarea
			id={fieldCtx?.id}
			{...props}
			class={cx(styles.input, unsignal(props.className), unsignal(props.class))}
			ref={refCallback}
		/>;
	},
);

export default Textarea;
