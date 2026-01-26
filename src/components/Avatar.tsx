import { css, cx } from "@emotion/css";
import { useComputed } from "@preact/signals";
import { useLiveSignal } from "@preact/signals/utils";
import { JID, parse as parseJID } from "@xmpp/jid";
import { Signalish } from "preact";
import { useMemo } from "preact/hooks";

import { useAccountSig } from "../util/connection";
import unsignal from "../util/unsignal";
import { generateColorForID } from "../util/xmpp/colorGeneration";

const styles = {
	avatar: cx("avatar", css({
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
	})),
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

export default function Avatar(props: {size: AvatarSize; jid: Signalish<string | JID>; class?: string}) {
	const accountSig = useAccountSig();

	const jid = unsignal(props.jid);
	const parsedJID = useMemo(() => {
		return typeof jid === "string" ? parseJID(jid) : jid;
	}, [jid]);
	const parsedJIDSig = useLiveSignal(parsedJID);

	const hashesSig = useComputed(() => {
		const parsedJID = parsedJIDSig.value;

		const account = accountSig.value;

		if(typeof account === "undefined") return [];

		const roomEntry = account.rooms.get(parsedJID.toString());
		if(typeof roomEntry !== "undefined") {
			if(roomEntry.infoState.state === "done") {
				return roomEntry.infoState.value.avatarHashes;
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
			return counterpart.avatars.map(ref => typeof ref === "string" ? ref : ref.hash);
		}

		return [];
	});

	const image = useComputed(() => {
		for(const hash of hashesSig.value) {
			const state = accountSig.value.avatarStates.get(hash);
			if(typeof state !== "undefined" && state.state === "done") return state.value;
		}

		return null;
	}).value;

	const color = useMemo(() => {
		return generateColorForID(parsedJID.toString());
	}, [parsedJID]);

	return <div class={cx(styles.avatar, props.class)} style={{"--avatar-size": props.size === "lg" ? "50px": "35px"}}>
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
			<img src={image} draggable={false} />
		}
	</div>;
}

export function RawAvatar(props: {size: AvatarSize; src: string; class?: string}) {
	return <div class={cx(styles.avatar, props.class)} style={{"--avatar-size": props.size === "lg" ? "50px": "35px"}}>
		<img src={props.src} />
	</div>;
}
