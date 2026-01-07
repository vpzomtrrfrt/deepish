import { css, cx } from "@emotion/css";
import { ComponentChildren, createContext, JSX } from "preact";
import { useContext, useId, useMemo } from "preact/hooks";
import unsignal from "../util/unsignal";

export interface FieldContext {
	id: string;
}

export const FieldContext = createContext<FieldContext | undefined>(undefined);

const styles = {
	field: css({
		display: "flex",
		flexDirection: "column",
	}),
	fieldLabel: css({
		display: "block",
		fontWeight: "bold",
	}),
};

export default function Field(props: {children: ComponentChildren}) {
	const id = useId();

	const ctx = useMemo(() => ({id}), [id]);

	return <FieldContext.Provider value={ctx}>
		<div class={styles.field}>
			{props.children}
		</div>
	</FieldContext.Provider>;
}

export function FieldLabel(props: JSX.LabelHTMLAttributes<HTMLLabelElement>) {
	const ctx = useContext(FieldContext);

	return <label
		for={ctx?.id}
		{...props}
		className={cx(styles.fieldLabel, unsignal(props.className), unsignal(props.class))}
	/>;
}
