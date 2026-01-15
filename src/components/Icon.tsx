import { css, cx } from "@emotion/css";

const styles = {
	icon: cx("icon", css({width: "1em", height: "1em", fill: "currentColor"})),
};

export default function Icon(props: {path: string; class?: string}) {
	return <svg viewBox="0 0 24 24" class={cx(styles.icon, props.class)}>
		<path d={props.path} />
	</svg>;
}
