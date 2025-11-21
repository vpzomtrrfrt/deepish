import { css, cx } from "@emotion/css";
import { mdiAccountMultiple, mdiHome } from "@mdi/js";
import { Link, Route, Switch, useRoute } from "wouter-preact";

import { Account, useAppContext } from "../..";
import ChatRoomPage from "./rooms";
import { LoadState } from "../../util/useData";
import Avatar from "../../components/Avatar";
import WithTooltip from "../../components/WithTooltip";
import { themeVars } from "../../util/theme";
import Icon from "../../components/Icon";
import DirectChatPage from "./direct";

const styles = {
	page: css({
		display: "flex",
		height: "100%",
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
	roomLinkIcon: css({
		fontSize: "35px",
	}),
	homeAvatar: css({
		width: "50px",
		height: "50px",

		display: "flex",
		justifyContent: "center",
		alignItems: "center",

		borderRadius: "100%",
	}),
	spaceItemsList: css({
		width: "250px",

		display: "flex",
		flexDirection: "column",

		borderRightStyle: "solid",
		borderRightWidth: "1px",
		borderRightColor: themeVars.outline1,
		backgroundColor: themeVars.bg1,
	}),
	spaceItem: css({
		padding: ".5rem",
		textDecoration: "none",
		color: "inherit",

		display: "flex",
		alignItems: "center",

		"&.active": {
			backgroundColor: themeVars.active,
		},
	}),
	bigSpaceItemIcon: css({
		fontSize: "35px",
		marginInlineEnd: ".5rem",
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
		<Switch>
			<Route path="/rooms/:roomJID" component={ChatRoomPage} />
			<Route path="/" component={ChatHomePage} nest />
		</Switch>
	</div>;
}

function ChatView(props: {account: Account}) {
	const roomMatch = useRoute("/rooms/:roomJID");
	const currentRoom = roomMatch[0] ? decodeURIComponent(roomMatch[1].roomJID) : null;

	return <div class={css({display: "flex", flexDirection: "column"})}>
		<div class={styles.roomList}>
			<div>
				<Link to="~/">
					<div class={cx(styles.roomLink, currentRoom === null && styles.currentRoomLink, styles.homeAvatar)}>
						<Icon path={mdiHome} class={styles.roomLinkIcon} />
					</div>
				</Link>
			</div>
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
									<Avatar size="lg" jid={roomJID} class={cx(styles.roomLink, currentRoom === roomJID && styles.currentRoomLink)} />
								</Link>
							</WithTooltip>
						</div>;
					},
				)
			}
		</div>
	</div>;
}

function ChatHomePage() {
	return <div style={{display: "flex", flexGrow: 1}}>
		<div class={styles.spaceItemsList}>
			<Link to="/" className={active => cx(styles.spaceItem, active && "active")}>
				<Icon path={mdiAccountMultiple} class={styles.bigSpaceItemIcon} />
				Contacts
			</Link>
		</div>
		<Switch>
			<Route path="/direct/:counterpartJID" component={DirectChatPage} />
			<Route path="/" component={ContactsPage} />
		</Switch>
	</div>;
}

function ContactsPage() {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0];
	if(typeof account === "undefined") throw new Error("Missing account");

	return <div>
		<ul>
			{
				Array.from(account.counterparts.values(), info => {
					if(!info.inRoster) return null;

					return <li key={info.jid.toString()}>
						<Link to={"~/chat/direct/" + encodeURIComponent(info.jid.toString())}>
							{info.jid.toString()}
						</Link>
					</li>;
				})
			}
		</ul>
	</div>;
}
