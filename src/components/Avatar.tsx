import { css, cx } from "@emotion/css";
import { useMemo } from "preact/hooks";

import { generateColorForID } from "../util/xmpp/colorGeneration";

const styles = {
	avatar: css({
		display: "inline-block",
		width: "var(--avatar-size)",
		height: "var(--avatar-size)",
		borderRadius: "100%",
		overflow: "hidden",
	}),
	fallbackAvatar: css({
		width: "100%",
		height: "100%",

		"> text": {
			textAnchor: "middle",
			dominantBaseline: "central",
			fontFamily: "sans-serif",
			fill: "white",
		},
	}),
};

export default function Avatar(props: {size: "md"; id: string; class?: string}) {
	const color = useMemo(() => {
		return generateColorForID(props.id);
	}, [props.id]);

	return <div class={cx(styles.avatar, props.class)} style={{"--avatar-size": "50px"}}>
		<svg class={styles.fallbackAvatar} style={{backgroundColor: color}} viewBox="0 0 30 30">
			<text x="50%" y="50%">{props.id[0].toUpperCase()}</text>
		</svg>
	</div>;
}
