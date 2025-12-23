import { css, cx } from "@emotion/css";
import { JID, parse as parseJID } from "@xmpp/jid";

import { useAppContext } from "..";
import Avatar, { AvatarSize } from "./Avatar";
import StatusIndicator from "./StatusIndicator";
import { TupleUnion } from "../util/typeUtil";
import { PresenceShowTypeExtended } from "../util/types";

const styles = {
	avatarWithStatus: css({
		display: "flex",
		position: "relative",
	}),
	statusIndicator: css({
		position: "absolute",
		right: 0,
		bottom: 0,
		width: "35%",
		height: "35%",
	}),
};

export default function AvatarWithStatus(props: {
	size: AvatarSize;
	jid: string | JID;
}) {
	const jid = typeof props.jid === "object" ? props.jid : parseJID(props.jid);

	const appCtx = useAppContext();
	const account = appCtx.accounts[0];

	let showType = null;
	const counterpart = account.counterparts.get(jid.toString());
	if(typeof counterpart !== "undefined" && counterpart.subscriptionTo) {
		if(counterpart.presences !== null) {
			let best: PresenceShowTypeExtended = PresenceShowTypeExtended.Unavailable;
			counterpart.presences.forEach(entry => {
				best = showTypeMax(best, entry.show ?? PresenceShowTypeExtended.Available);
			});

			showType = best;
		}
	}

	return <div class={cx("avatar", styles.avatarWithStatus)}>
		<Avatar size={props.size} jid={props.jid} />
		{showType !== null && <StatusIndicator showType={showType} class={styles.statusIndicator} />}
	</div>;
}

const showTypeOrder: TupleUnion<PresenceShowTypeExtended> = [
	PresenceShowTypeExtended.Unavailable,
	PresenceShowTypeExtended.DND,
	PresenceShowTypeExtended.XA,
	PresenceShowTypeExtended.Away,
	PresenceShowTypeExtended.Available,
	PresenceShowTypeExtended.Chat,
];

function showTypeMax(a: PresenceShowTypeExtended, b: PresenceShowTypeExtended) {
	const aIdx = showTypeOrder.indexOf(a);
	const bIdx = showTypeOrder.indexOf(b);

	if(aIdx < bIdx) return b;
	else return a;
}
