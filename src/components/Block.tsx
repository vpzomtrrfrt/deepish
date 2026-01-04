import { css, cx } from "@emotion/css";
import { JSX } from "preact";
import unsignal from "../util/unsignal";

const styles = {
	block: css({
		padding: "1rem",
	}),
};

export default function Block(props: JSX.HTMLAttributes<HTMLDivElement>) {
	return <div {...props} class={cx(styles.block, unsignal(props.class))} />;
}
