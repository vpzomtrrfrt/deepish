import { css, cx } from "@emotion/css";
import { InputHTMLAttributes, Ref } from "preact";
import { forwardRef } from "preact/compat";
import { useCallback, useContext, useEffect, useId, useRef } from "preact/hooks";

import { themeVars } from "../util/theme";
import unsignal from "../util/unsignal";
import { FieldContext } from "./Field";

const styles = {
	input: css({
		fontSize: "1rem",
		paddingInline: "0.5rem",
		paddingBlock: "0.5rem",
		borderRadius: "0.25rem",
		borderStyle: "solid",
		borderWidth: "2px",
		borderColor: themeVars.outline1,

		outline: 0,

		"&:focus-within": {
			borderColor: themeVars.focusOutline,
		},
	}),
	inputSuffixWrapperInput: css({
		outline: 0,
		border: "none",
		padding: 0,
	}),
	inputSuffixWrapper: css({
		display: "inline-flex",
		cursor: "text",
	}),
	inputSuffix: css({
		opacity: 0.65,
	}),
};

const Input = forwardRef(
	function Input(props: InputHTMLAttributes<HTMLInputElement>, parentRef: Ref<HTMLInputElement | null>) {
		const fieldCtx = useContext(FieldContext);

		const ref = useRef<HTMLInputElement>(null);

		const autofocus = unsignal(props.autofocus);

		useEffect(() => {
			if(autofocus === true) {
				ref.current!.focus();
			}
		}, [autofocus]);

		const refCallback = useCallback((value: HTMLInputElement | null) => {
			ref.current = value;

			if(parentRef !== null) {
				if(typeof parentRef === "function") parentRef(value);
				else parentRef.current = value;
			}
		}, [parentRef]);

		return <input
			id={fieldCtx?.id}
			{...props}
			class={cx(styles.input, unsignal(props.className), unsignal(props.class))}
			ref={refCallback}
		/>;
	},
);

export default Input;

export function InputSuffixWrapper(props: {suffix: string; inputProps: InputHTMLAttributes<HTMLInputElement>}) {
	const innerID = useId();
	const fieldCtx = useContext(FieldContext);

	const id = props.inputProps.id ?? fieldCtx?.id ?? innerID;

	return <div class={cx(styles.input, styles.inputSuffixWrapper)}>
		<Input
			id={id}
			{...props.inputProps}
			class={cx(
				styles.inputSuffixWrapperInput, unsignal(props.inputProps.className), unsignal(props.inputProps.class)
			)}
		/>
		<label for={id} class={styles.inputSuffix}>{props.suffix}</label>
	</div>;
}
