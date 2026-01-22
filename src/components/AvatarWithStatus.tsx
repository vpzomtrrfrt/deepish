import { css, cx } from "@emotion/css";
import { useComputed } from "@preact/signals";
import { useLiveSignal } from "@preact/signals/utils";
import { JID, parse as parseJID } from "@xmpp/jid";
import { useMemo } from "preact/hooks";

import { useAccountSig } from "../util/connection";
import { getShowTypeForCounterpart } from "../util/statusUtil";
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

	const accountSig = useAccountSig();

	const counterpart = useComputed(() => accountSig.value.counterparts.getSignal(jidSig.value.toString())).value.value;
	const showType = typeof counterpart === "undefined" ? null : getShowTypeForCounterpart(counterpart, props.inRoom);

	return <div class={cx("avatar", styles.avatarWithStatus)}>
		<Avatar size={props.size} jid={props.jid} />
		{showType !== null && <StatusIndicator showType={showType} class={styles.statusIndicator} />}
	</div>;
}
