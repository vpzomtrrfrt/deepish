import { css, cx } from "@emotion/css";
import { mdiAccountMultiple, mdiHome } from "@mdi/js";
import { useMemo, useState } from "preact/hooks";
import { Link, Route, Switch, useRoute } from "wouter-preact";

import { Account, useAppContext } from "../..";
import ChatRoomPage from "./rooms";
import { LoadState } from "../../util/useData";
import Avatar from "../../components/Avatar";
import WithTooltip from "../../components/WithTooltip";
import { themeVars } from "../../util/theme";
import Icon from "../../components/Icon";
import DirectChatPage from "./direct";
import AvatarWithStatus from "../../components/AvatarWithStatus";
import { ErrorAlert } from "../../components/DataView";
import { ManualTabsContainer, TabLink, TabsList } from "../../components/Tabs";
import Block from "../../components/Block";

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
		whiteSpace: "nowrap",

		"&.active": {
			backgroundColor: themeVars.active,
		},

		"> .avatar": {
			marginInlineEnd: ".5rem",
		},

		"> span": {
			overflow: "hidden",
			textOverflow: "ellipsis",
		},
	}),
	bigSpaceItemIcon: css({
		fontSize: "35px",
		marginInlineEnd: ".5rem",
	}),
	connectingView: css({
		display: "flex",
		height: "100%",
		flexDirection: "column",
		justifyContent: "center",
		alignItems: "center",
	}),
};

export default function ChatPage() {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0];
	if(typeof account === "undefined") throw new Error("Missing account");

	if(!account.connected) {
		return <ConnectingView />;
	}

	return <div class={styles.page}>
		<ChatView account={account} />
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
	const appCtx = useAppContext();
	const account = appCtx.accounts[0];

	// TODO this seems like a performance problem
	const conversations = useMemo(() => {
		const list = Array.from(account.counterparts.entries())
			.filter(x => {
				return !account.rooms.has(x[0]) &&
					(x[1].lastMessageTimestamp !== null || x[1].overrideVisibleTimestamp !== null);
			});
		list.sort((a, b) => {
			return (b[1].lastMessageTimestamp ?? b[1].overrideVisibleTimestamp)!.getTime() -
				(a[1].lastMessageTimestamp ?? a[1].overrideVisibleTimestamp)!.getTime();
		});
		return list.map(x => x[0]);
	}, [account.counterparts, account.rooms]);

	return <div style={{display: "flex", flexGrow: 1}}>
		<div class={styles.spaceItemsList}>
			<Link to="/" className={active => cx(styles.spaceItem, active && "active")}>
				<Icon path={mdiAccountMultiple} class={styles.bigSpaceItemIcon} />
				<span>Friends</span>
			</Link>
			{
				conversations.map(item => {
					return <Link to={"~/chat/direct/" + encodeURIComponent(item)} className={active => cx(styles.spaceItem, active && "active")}>
						<AvatarWithStatus size="md" jid={item} />
						<span>{item}</span>
					</Link>;
				})
			}
		</div>
		<Switch>
			<Route path="/direct/:counterpartJID" component={DirectChatPage} />
			<Route path="/" component={ContactsPage} />
		</Switch>
	</div>;
}

enum FriendsTab {
	Online,
	All,
	Requests,
}

function ContactsPage() {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0];
	if(typeof account === "undefined") throw new Error("Missing account");

	const [tab, setTab] = useState<FriendsTab>(FriendsTab.All);

	return <div>
		<ManualTabsContainer tab={tab} setTab={setTab}>
			<TabsList>
				<TabLink tab={FriendsTab.Online}>Online</TabLink>
				<TabLink tab={FriendsTab.All}>All</TabLink>
				<TabLink tab={FriendsTab.Requests}>Requests</TabLink>
			</TabsList>

			{
				(tab === FriendsTab.All || tab === FriendsTab.Online) && <ul>
					{
						Array.from(account.counterparts.values(), info => {
							if(info.rosterEntry === null) return null;
							if(!info.rosterEntry.subscriptionTo) return null;

							if(tab === FriendsTab.Online) {
								if(info.presences === null || info.presences.size < 1) return null;
							}

							return <li key={info.jid.toString()}>
								<Link to={"~/chat/direct/" + encodeURIComponent(info.jid.toString())}>
									{info.jid.toString()}
								</Link>
							</li>;
						})
					}
				</ul>
			}
			{
				tab === FriendsTab.Requests && <div>
					<Block>
						<h1>Outgoing</h1>
						<ul>
							{Array.from(account.counterparts.values(), info => {
								if(
									!(
										info.rosterEntry !== null &&
											!info.rosterEntry.subscriptionTo &&
											info.rosterEntry.requestingSubscriptionTo
									)
								) {
									return null;
								}

								return <li key={info.jid.toString()}>
									{info.jid.toString()}
								</li>;
							})}
						</ul>
					</Block>
					<Block>
						<h1>Incoming</h1>
						<ul>
							{Array.from(account.counterparts.values(), info => {
								if(!info.requestingMySubscription) {
									return null;
								}

								return <li key={info.jid.toString()}>
									{info.jid.toString()}
								</li>;
							})}
						</ul>
					</Block>
				</div>
			}
		</ManualTabsContainer>
	</div>;
}

function ConnectingView() {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0];
	if(typeof account === "undefined") throw new Error("Missing account");

	return <div class={styles.connectingView}>
		<div>
			Connecting…
		</div>
		{account.lastError !== null &&
			<ErrorAlert error={account.lastError} />
		}
	</div>;
}
