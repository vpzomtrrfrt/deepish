import { css, cx } from "@emotion/css";
import { JID, parse as parseJID } from "@xmpp/jid";
import { useMemo } from "preact/hooks";

import { generateColorForID } from "../util/xmpp/colorGeneration";
import { useAppContext } from "..";

const styles = {
	avatar: css({
		display: "inline-block",
		width: "var(--avatar-size)",
		height: "var(--avatar-size)",
		borderRadius: "100%",
		overflow: "hidden",
		position: "relative",

		"> img": {
			position: "absolute",
			left: 0,
			top: 0,

			width: "100%",
			height: "100%",
		},
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
	const appCtx = useAppContext();
	const account = appCtx.accounts[0];

	const parsedJID = useMemo(() => typeof props.jid === "string" ? parseJID(props.jid) : props.jid, [props.jid]);

	const image = useMemo((): string | null => {
		if(typeof account === "undefined") return null;

		const roomEntry = account.rooms.get(props.jid.toString());
		if(typeof roomEntry !== "undefined") {
			if(roomEntry.infoState.state === "done") {
				for(const hash of roomEntry.infoState.value.avatarHashes) {
					const state = account.avatarStates.get(hash);
					if(typeof state !== "undefined" && state.state === "done") return state.value;
				}
			}
		}

		return null;
	}, [account, props.jid]);

	const color = useMemo(() => {
		return generateColorForID(parsedJID.toString());
	}, [parsedJID]);

	return <div class={cx(styles.avatar, props.class)} style={{"--avatar-size": props.size === "lg" ? "50px": "35px"}}>
		{image === null ?
			<svg class={styles.fallbackAvatar} style={{backgroundColor: color}} viewBox="0 0 30 30">
				<text x="50%" y="50%">
					{(parsedJID.resource === "" ? parsedJID.local : parsedJID.resource)[0].toUpperCase()}
				</text>
			</svg> :
			<img src={image} />
		}
	</div>;
}
