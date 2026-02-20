import { css, cx } from "@emotion/css";
import { Show, useLiveSignal } from "@preact/signals/utils";
import { JID, parse as parseJID } from "@xmpp/jid";
import { Signalish } from "preact";
import { useMemo } from "preact/hooks";

import { useConnectionContext } from "../util/connection";
import { getShowTypeForCounterpart } from "../util/statusUtil";
import { PresenceShowTypeExtended } from "../util/types";
import unsignal from "../util/unsignal";
import Avatar, { AvatarSize } from "./Avatar";
import StatusIndicator from "./StatusIndicator";

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
	inRoom?: boolean;
}) {
	const jid = useMemo(() => typeof props.jid === "object" ? props.jid : parseJID(props.jid), [props.jid]);
	const jidSig = useLiveSignal(jid);

	const conn = useConnectionContext();

	const counterpart = conn.counterparts.get(jidSig.value.toString());
	const showType = typeof counterpart === "undefined" ? null : getShowTypeForCounterpart(counterpart, props.inRoom);

	return <AvatarWithStatusRaw size={props.size} jid={jid} showType={showType} />;
}

export function AvatarWithStatusRaw(props: {
	size: AvatarSize;
	jid: JID;
	showType: Signalish<PresenceShowTypeExtended | null>;
}) {
	return <div class={cx("avatar", styles.avatarWithStatus)}>
		<Avatar size={props.size} jid={props.jid} />
		<Show when={() => unsignal(props.showType)}>
			{(showType: PresenceShowTypeExtended) => {
				return <StatusIndicator showType={showType} class={styles.statusIndicator} />;
			}}
		</Show>
	</div>;
}
