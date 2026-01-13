import { css, cx } from "@emotion/css";
import { JID } from "@xmpp/jid";

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

export default function TypingIndicator(props: {usersTyping: JID[]}) {
	return <div class={styles.typingIndicatorWrapper}>
		<div class={cx(styles.typingIndicator, props.usersTyping.length > 0 && "active")}>
			{props.usersTyping.length > 0 && props.usersTyping[0].toString() + " is typing…"}
		</div>
	</div>;
}
