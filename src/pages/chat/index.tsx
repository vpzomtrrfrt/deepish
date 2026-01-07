import { css, cx } from "@emotion/css";
import { mdiAccountMultiple, mdiCheck, mdiClose, mdiHome, mdiPlus } from "@mdi/js";
import { JID, parse as parseJID } from "@xmpp/jid";
import { useCallback, useMemo, useState } from "preact/hooks";
import { Link, Route, Switch, useRoute } from "wouter-preact";

import { Account, useAppContext } from "../..";
import ChatRoomPage from "./rooms";
import ChatRoomAddPage from "./rooms/add";
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
import IconButton from "../../components/IconButton";
import * as commonStyles from "../../util/commonStyles";
import { PresenceShowTypeExtended } from "../../util/types";
import { getShowTypeForCounterpart } from "../../util/statusUtil";
import { getNickForCounterpart } from "../../util/profileUtil";
import Menu, { MenuItem } from "../../components/Menu";
import ConfirmDialog from "../../components/ConfirmDialog";
import Input from "../../components/Input";
import useLinkState from "linkstate/hook";
import Button from "../../components/Button";
import useSubmitting from "../../util/useSubmitting";

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
	friendEntry: cx(commonStyles.hoverOverlay, css({
		display: "flex",
		gap: ".5rem",
		alignItems: "center",

		padding: ".5rem",

		textDecoration: "none",
		color: "inherit",

		"&:hover": {
			".friendEntryJID": {
				visibility: "visible",
			},
		},
	})),
	friendButtons: css({
		display: "flex",
		gap: ".5rem",
		flexShrink: 0,
		pointerEvents: "none",

		"> *": {
			pointerEvents: "auto",
		}
	}),
	friendEntryNameRow: css({
		display: "flex",
		alignItems: "center",
		gap: ".5rem",
	}),
	friendEntryJID: cx("friendEntryJID", css({
		display: "inline-block",
		fontSize: "80%",
		visibility: "hidden",
	})),
	contactsPage: css({
		display: "flex",
		flexDirection: "column",
		flexGrow: 1,
	}),
	statusText: css({
		opacity: 0.65,
		fontSize: "80%",
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
			<Route path="/rooms:add" component={ChatRoomAddPage} />
			<Route path="/" component={ChatHomePage} nest />
		</Switch>
	</div>;
}

function ChatView(props: {account: Account}) {
	const roomMatch = useRoute("/rooms/:roomJID");
	const currentRoom = roomMatch[0] ? decodeURIComponent(roomMatch[1].roomJID) : null;

	const addMatch = useRoute("/rooms:add");

	return <div class={css({display: "flex", flexDirection: "column"})}>
		<div class={styles.roomList}>
			<div>
				<Link to="~/">
					<div class={cx(styles.roomLink, currentRoom === null && !addMatch[0] && styles.currentRoomLink, styles.homeAvatar)}>
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
			<div>
				<Link to="~/chat/rooms:add">
					<div class={cx(styles.roomLink, addMatch[0] && styles.currentRoomLink, styles.homeAvatar)}>
						<Icon path={mdiPlus} class={styles.roomLinkIcon} />
					</div>
				</Link>
			</div>
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
						<span>{getNickForCounterpart(account.counterparts.get(item)!)}</span>
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

	function acceptFriendRequest(target: JID) {
		appCtx.acceptFriendRequest(account.jid, target);
	}

	function rejectFriendRequest(target: JID) {
		appCtx.rejectFriendRequest(account.jid, target);
	}

	function removeFriend(target: JID) {
		appCtx.removeFriend(account.jid, target);
	}

	function removeFriendAfterConfirm(target: JID) {
		appCtx.showDialog(
			<ConfirmDialog onConfirm={removeFriend.bind(undefined, target)} confirmText="Remove Friend">
				<p>Are you sure you want to remove <em>{target.toString()}</em> as a friend?</p>
			</ConfirmDialog>,
		);
	}

	const onClickFriendButtons = useCallback((evt: Event) => {
		evt.stopPropagation();
		evt.preventDefault();
	}, []);

	const incomingRequestCounterparts = Array.from(account.counterparts.values())
		.filter(x => x.requestingMySubscription);

	const outgoingRequestCounterparts = Array.from(account.counterparts.values())
		.filter(info => {
			return info.rosterEntry !== null &&
				!info.rosterEntry.subscriptionTo &&
				info.rosterEntry.requestingSubscriptionTo;
		});

	return <div class={styles.contactsPage}>
		<ManualTabsContainer tab={tab} setTab={setTab}>
			<TabsList>
				<TabLink tab={FriendsTab.Online}>Online</TabLink>
				<TabLink tab={FriendsTab.All}>All</TabLink>
				<TabLink tab={FriendsTab.Requests}>Requests</TabLink>
			</TabsList>

			{
				(tab === FriendsTab.All || tab === FriendsTab.Online) && <div>
					{
						Array.from(account.counterparts.values(), info => {
							if(info.rosterEntry === null) return null;
							if(!info.rosterEntry.subscriptionTo) return null;

							if(tab === FriendsTab.Online) {
								if(info.presences === null || info.presences.size < 1) return null;
							}

							const showType = getShowTypeForCounterpart(info);

							return <Link
								to={"~/chat/direct/" + encodeURIComponent(info.jid.toString())}
								key={info.jid.toString()}
								class={styles.friendEntry}
							>
								<AvatarWithStatus size="md" jid={info.jid} />
								<div style={{flexGrow: 1}}>
									<div class={styles.friendEntryNameRow}>
										{getNickForCounterpart(info)}
										<span class={styles.friendEntryJID}>{info.jid.toString()}</span>
									</div>
									{showType !== null && <div class={styles.statusText}>
										{presenceShowTypeNames[showType]}
									</div>}
								</div>
								<div class={styles.friendButtons} onClick={onClickFriendButtons}>
									<Menu>
										<MenuItem onClick={removeFriendAfterConfirm.bind(undefined, info.jid)}>
											Remove Friend
										</MenuItem>
									</Menu>
								</div>
							</Link>;
						})
					}
				</div>
			}
			{
				tab === FriendsTab.Requests && <div>
					<Block>
						<h1>Add Friend</h1>
						<AddFriendForm />
					</Block>
					{outgoingRequestCounterparts.length > 0 &&
						<Block>
							<h1>Outgoing</h1>
							<div>
								{outgoingRequestCounterparts.map(info => {
									return <div class={styles.friendEntry} key={info.jid.toString()}>
										<div style={{flexGrow: 1}}>
											{info.jid.toString()}
										</div>
										<div class={styles.friendButtons}>
											<WithTooltip tooltip="Cancel Request">
												<IconButton onClick={removeFriend.bind(undefined, info.jid)}>
													<Icon path={mdiClose} />
												</IconButton>
											</WithTooltip>
										</div>
									</div>;
								})}
							</div>
						</Block>
					}
					{
						incomingRequestCounterparts.length > 0 &&
							<Block>
								<h1>Incoming</h1>
								<div>
									{incomingRequestCounterparts.map(info => {
										return <div class={styles.friendEntry} key={info.jid.toString()}>
											<div style={{flexGrow: 1}}>
												{info.jid.toString()}
											</div>
											<div class={styles.friendButtons}>
												<WithTooltip tooltip="Accept Request">
													<IconButton onClick={acceptFriendRequest.bind(undefined, info.jid)}>
														<Icon path={mdiCheck} />
													</IconButton>
												</WithTooltip>
												<WithTooltip tooltip="Reject Request">
													<IconButton onClick={rejectFriendRequest.bind(undefined, info.jid)}>
														<Icon path={mdiClose} />
													</IconButton>
												</WithTooltip>
											</div>
										</div>;
									})}
								</div>
							</Block>
					}
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

const presenceShowTypeNames: Record<PresenceShowTypeExtended, string> = {
	[PresenceShowTypeExtended.XA]: "Extended Away",
	[PresenceShowTypeExtended.DND]: "Do Not Disturb",
	[PresenceShowTypeExtended.Chat]: "Open to Chat",
	[PresenceShowTypeExtended.Away]: "Away",
	[PresenceShowTypeExtended.Available]: "Online",
	[PresenceShowTypeExtended.Unavailable]: "Offline",
};

function AddFriendForm() {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0];

	const [input, linkInput, setInput] = useLinkState("");

	const [submitting, submit] = useSubmitting((evt: Event) => {
		evt.preventDefault();

		appCtx.sendFriendRequest(account.jid, parseJID(input));

		setInput("");

		return Promise.resolve();
	});

	return <form onSubmit={submit}>
		<Input type="text" value={input} onChange={linkInput} placeholder="user@server.example" pattern=".*@.*" />
		{" "}
		<Button tier="primary" type="submit" disabled={submitting}>Add</Button>
	</form>
}
