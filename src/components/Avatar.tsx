import { css, cx } from "@emotion/css";
import { JID, parse as parseJID } from "@xmpp/jid";
import { useMemo } from "preact/hooks";

import { useAccount } from "../util/connection";
import { generateColorForID } from "../util/xmpp/colorGeneration";

const styles = {
	avatar: css({
		display: "inline-block",
		width: "var(--avatar-size)",
		height: "var(--avatar-size)",
		borderRadius: "100%",
		overflow: "hidden",
		position: "relative",
		flexShrink: 0,

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

export type AvatarSize = "lg" | "md";

export default function Avatar(props: {size: AvatarSize; jid: string | JID; class?: string}) {
	const account = useAccount();

	const parsedJID = useMemo(() => typeof props.jid === "string" ? parseJID(props.jid) : props.jid, [props.jid]);

	const image = useMemo((): string | null => {
		if(typeof account === "undefined") return null;

		const roomEntry = account.rooms.get(parsedJID.toString());
		if(typeof roomEntry !== "undefined") {
			if(roomEntry.infoState.state === "done") {
				for(const hash of roomEntry.infoState.value.avatarHashes) {
					const state = account.avatarStates.get(hash);
					if(typeof state !== "undefined" && state.state === "done") return state.value;
				}
			}
		}

		let counterpart = account.counterparts.get(parsedJID.toString());
		if(typeof counterpart === "undefined" && parsedJID.resource !== "") {
			counterpart = account.counterparts.get(parsedJID.bare().toString());

			if(typeof counterpart === "undefined") {
				// Maybe it's me?

				const containerRoomEntry = account.rooms.get(parsedJID.bare().toString());
				if(typeof containerRoomEntry !== "undefined") {
					if(containerRoomEntry.connected && containerRoomEntry.nick === parsedJID.resource) {
						counterpart = account.counterparts.get(account.jid.toString());
					}
				}
			}
		}

		if(typeof counterpart !== "undefined") {
			for(const hash of counterpart.avatarHashes) {
				const state = account.avatarStates.get(hash);
				if(typeof state !== "undefined" && state.state === "done") return state.value;
			}
		}

		return null;
	}, [account, parsedJID]);

	const color = useMemo(() => {
		return generateColorForID(parsedJID.toString());
	}, [parsedJID]);

	return <div class={cx("avatar", styles.avatar, props.class)} style={{"--avatar-size": props.size === "lg" ? "50px": "35px"}}>
		{image === null ?
			<svg class={styles.fallbackAvatar} style={{backgroundColor: color}} viewBox="0 0 30 30">
				<text x="50%" y="50%">
					{
						(
							parsedJID.resource === "" ?
								(parsedJID.local === "" ? parsedJID.domain : parsedJID.local) :
								parsedJID.resource
						)[0].toUpperCase()
					}
				</text>
			</svg> :
			<img src={image} />
		}
	</div>;
}
