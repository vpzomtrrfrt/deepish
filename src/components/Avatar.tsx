import { css, cx } from "@emotion/css";
import { JID, parse as parseJID } from "@xmpp/jid";
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

export default function Avatar(props: {size: "lg" | "md"; jid: string | JID; class?: string}) {
	const parsedJID = useMemo(() => typeof props.jid === "string" ? parseJID(props.jid) : props.jid, [props.jid]);

	const color = useMemo(() => {
		return generateColorForID(parsedJID.toString());
	}, [parsedJID]);

	return <div class={cx(styles.avatar, props.class)} style={{"--avatar-size": props.size === "lg" ? "50px": "35px"}}>
		<svg class={styles.fallbackAvatar} style={{backgroundColor: color}} viewBox="0 0 30 30">
			<text x="50%" y="50%">
				{(parsedJID.resource === "" ? parsedJID.local : parsedJID.resource)[0].toUpperCase()}
			</text>
		</svg>
	</div>;
}
