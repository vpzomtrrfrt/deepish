import { css, cx } from "@emotion/css";
import { JID, parse as parseJID } from "@xmpp/jid";

import { useAccount } from "../util/connection";
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
	const jid = typeof props.jid === "object" ? props.jid : parseJID(props.jid);

	const account = useAccount();

	const counterpart = account.counterparts.get(jid.toString());
	const showType = typeof counterpart === "undefined" ? null : getShowTypeForCounterpart(counterpart, props.inRoom);

	return <div class={cx("avatar", styles.avatarWithStatus)}>
		<Avatar size={props.size} jid={props.jid} />
		{showType !== null && <StatusIndicator showType={showType} class={styles.statusIndicator} />}
	</div>;
}
