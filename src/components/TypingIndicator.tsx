import { css, cx } from "@emotion/css";
import { JID } from "@xmpp/jid";

import { useAccount } from "../util/connection";
import { maybeGetNickForCounterpart } from "../util/profileUtil";
import { themeVars } from "../util/theme";

const styles = {
	typingIndicatorWrapper: css({
		position: "relative",
	}),
	typingIndicator: css({
		position: "absolute",
		bottom: 0,
		width: "100%",
		height: "1.5rem",
		visibility: "hidden",
		backgroundColor: themeVars.bg1,

		"&.active": {
			visibility: "visible",
		},
	}),
};

export default function TypingIndicator(props: {usersTyping: JID[]; inRoom: boolean}) {
	const account = useAccount();

	const nameList = props.usersTyping.map(jid => {
		if(props.inRoom) return jid.resource;
		else {
			const counterpart = account.counterparts.get(jid.toString());
			return maybeGetNickForCounterpart(jid, counterpart);
		}
	});

	// TODO show multiple users
	return <div class={styles.typingIndicatorWrapper}>
		<div class={cx(styles.typingIndicator, props.usersTyping.length > 0 && "active")}>
			{props.usersTyping.length > 0 && nameList[0].toString() + " is typing…"}
		</div>
	</div>;
}
