import { css, cx } from "@emotion/css";
import { JID } from "@xmpp/jid";
import { Signalish } from "preact";
import { useIntl } from "react-intl";

import { useAccountSig } from "../util/connection";
import { maybeGetNickForCounterpart } from "../util/profileUtil";
import { themeVars } from "../util/theme";
import unsignal from "../util/unsignal";

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

export default function TypingIndicator(props: {usersTyping: Signalish<JID[]>; inRoom: boolean}) {
	const intl = useIntl();
	const { $t } = intl;

	const accountSig = useAccountSig();

	const usersTyping = unsignal(props.usersTyping);

	const nameList = usersTyping.map(jid => {
		if(props.inRoom) return jid.resource;
		else {
			const counterpart = accountSig.value.counterparts.get(jid.toString());
			return maybeGetNickForCounterpart(jid, counterpart);
		}
	});

	// TODO show multiple users
	return <div class={styles.typingIndicatorWrapper}>
		<div class={cx(styles.typingIndicator, usersTyping.length > 0 && "active")}>
			{usersTyping.length > 0 &&
				$t(
					{
						defaultMessage: "{count, plural,\
							one {{list} is typing…}\
							other {{list} are typing…}\
						}"
					},
					{
						list: intl.formatList(nameList, {type: "conjunction"}),
						count: nameList.length,
					},
				)
			}
		</div>
	</div>;
}
