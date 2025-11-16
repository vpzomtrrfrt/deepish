import { css, cx } from "@emotion/css";
import { Link, Route, useRoute } from "wouter-preact";

import { Account, useAppContext } from "../..";
import ChatRoomPage from "./rooms";
import { LoadState } from "../../util/useData";
import Avatar from "../../components/Avatar";
import WithTooltip from "../../components/WithTooltip";
import { themeVars } from "../../util/theme";

const styles = {
	page: css({
		display: "flex",
		height: "100%",
		gap: ".5rem",
	}),
	roomList: css({
		padding: ".25rem",
		lineHeight: 0,
		display: "flex",
		flexDirection: "column",
		gap: ".125rem",
		borderRightStyle: "solid",
		borderRightWidth: "1px",
		borderRightColor: themeVars.outline1,
		backgroundColor: themeVars.bg1,
		flexGrow: 1,
	}),
	currentRoomLink: css({
		borderColor: themeVars.highlightOutline,
	}),
	roomLink: css({
		display: "block",
		borderWidth: "2px",
		borderStyle: "solid",
		borderColor: "transparent",
		transition: "border-color 300ms",

		"&:hover": {
			borderColor: "#7f7f7f",
		},
	}),
};

export default function ChatPage() {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0];
	if(typeof account === "undefined") throw new Error("Missing account");

	return <div class={styles.page}>
		{
			account.connected ?
				<ChatView account={account} /> :
				"Connecting…"
		}
		<Route path="/rooms/:roomJID" component={ChatRoomPage} />
	</div>;
}

function ChatView(props: {account: Account}) {
	const roomMatch = useRoute("/rooms/:roomJID");
	const currentRoom = roomMatch[0] ? decodeURIComponent(roomMatch[1].roomJID) : null;

	return <div class={css({display: "flex", flexDirection: "column"})}>
		<div class={styles.roomList}>
			{
				Array.from(
					props.account.rooms,
					([roomJID, info]) => {
						const name = LoadState.ifDone(info.infoState, disco => disco.name, () => null) ?? roomJID;

						return <div key={roomJID}>
							<WithTooltip tooltip={name} side="inline-end">
								<Link
									to={"~/chat/rooms/" + encodeURIComponent(roomJID)}
								>
									<Avatar size="md" id={roomJID} class={cx(styles.roomLink, currentRoom === roomJID && styles.currentRoomLink)} />
								</Link>
							</WithTooltip>
						</div>;
					},
				)
			}
		</div>
	</div>;
}
