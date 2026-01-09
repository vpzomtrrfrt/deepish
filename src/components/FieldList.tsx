import { css, cx } from "@emotion/css";
import { JSX } from "preact";

import unsignal from "../util/unsignal";

const styles = {
	fieldList: css({
		display: "flex",
		flexDirection: "column",
		gap: ".5rem",
	}),
};

export default function FieldList(props: JSX.HTMLAttributes<HTMLDivElement>) {
	return <div {...props} class={cx(styles.fieldList, unsignal(props.className), unsignal(props.class))} />;
}
