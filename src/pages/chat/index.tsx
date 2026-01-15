import { css, cx } from "@emotion/css";
import { mdiAccountMultiple, mdiCheck, mdiClose, mdiHome, mdiPlus } from "@mdi/js";
import { JID, parse as parseJID } from "@xmpp/jid";
import useLinkState from "linkstate/hook";
import { JSX } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { defineMessage, MessageDescriptor, useIntl } from "react-intl";
import useLatestCallback from "use-latest-callback";
import { Link, Route, Switch, useLocation, useRoute } from "wouter-preact";

import { useAppContext } from "../..";
import Avatar from "../../components/Avatar";
import AvatarWithStatus from "../../components/AvatarWithStatus";
import Block from "../../components/Block";
import Button from "../../components/Button";
import ConfirmDialog from "../../components/ConfirmDialog";
import { ErrorAlert } from "../../components/DataView";
import Icon from "../../components/Icon";
import IconButton from "../../components/IconButton";
import Input from "../../components/Input";
import Menu, { MenuItem } from "../../components/Menu";
import PriorityUnreadIndicator from "../../components/PriorityUnreadIndicator";
import { ManualTabsContainer, TabLink, TabsList } from "../../components/Tabs";
import WithTooltip from "../../components/WithTooltip";
import * as commonStyles from "../../util/commonStyles";
import { useAccount, useConnectionContext } from "../../util/connection";
import { msgActionAdd } from "../../util/langCommon";
import { getNickForCounterpart } from "../../util/profileUtil";
import { getShowTypeForCounterpart } from "../../util/statusUtil";
import { themeVars } from "../../util/theme";
import { Counterpart, PresenceShowTypeExtended } from "../../util/types";
import unsignal from "../../util/unsignal";
import { LoadState } from "../../util/useData";
import useSubmitting from "../../util/useSubmitting";
import DirectChatPage from "./direct";
import ChatRoomPage from "./rooms";
import ChatRoomAddPage from "./rooms/add";

const styles = {
	page: css({
		display: "flex",
		height: "100%",
	}),
	roomList: css({
		boxSizing: "border-box",
		padding: ".25rem",
		lineHeight: 0,
		display: "flex",
		flexDirection: "column",
		gap: ".125rem",
		borderRightStyle: "solid",
		borderRightWidth: "1px",
		borderRightColor: themeVars.outline1,
		backgroundColor: themeVars.bg1,
		overflowY: "auto",

		a: {
			color: "inherit",
		},
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
		borderRadius: "100%",

		position: "relative",

		"&:hover": {
			borderColor: "#7f7f7f",
		},

		"> .unreadIndicator": {
			position: "absolute",
			bottom: 0,
			right: 0,
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
	}),
	selfBox: css({
		position: "absolute",
		left: 0,
		bottom: 0,
		width: "calc(250px + 50px + 4px + .5rem + 2px)",
		height: "calc(35px + 1rem)",

		borderStyle: "solid",
		borderWidth: "1px",
		borderColor: themeVars.outline1,
		backgroundColor: themeVars.bg1,

		display: "flex",
		alignItems: "center",
		padding: ".5rem",
		gap: ".5rem",
		boxSizing: "border-box",

		"&:hover": {
			".friendEntryJID": {
				visibility: "visible",
			},
		},
	}),
	selfBoxNameSegment: css({
		flexGrow: 1,

		display: "flex",
		flexDirection: "column",
		minWidth: 0,
	}),
	sidebarSegment: css({
		height: "calc(100% - 35px - 1rem)",
		flexShrink: 0,
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
		overflowX: "hidden",
		textOverflow: "ellipsis",
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
	counterpartUnreadIndicator: css({
		display: "inline-block",
		width: "1rem",
		height: "1rem",
		borderRadius: "50%",
		backgroundColor: themeVars.textOn1,
	}),
	roomUnreadIndicator: cx("unreadIndicator", css({
		fontSize: ".8rem",
		width: "1.5em",
		height: "1.5em",
		borderRadius: "50%",
		backgroundColor: themeVars.textOn1,

		display: "inline-flex",
		justifyContent: "center",
		alignItems: "center",
	})),
};

export default function ChatPage() {
	const account = useAccount();

	if(!account.connected) {
		return <ConnectingView />;
	}

	return <div class={styles.page}>
		<SelfBox />
		<ChatView />
		<Switch>
			<Route path="/rooms/:roomJID" component={ChatRoomPage} />
			<Route path="/rooms:add" component={ChatRoomAddPage} />
			<Route path="/" component={ChatHomePage} nest />
		</Switch>
	</div>;
}

export function SpaceItemsList(props: JSX.HTMLAttributes<HTMLDivElement>) {
	return <div
		{...props}
		className={cx(styles.sidebarSegment, styles.spaceItemsList, unsignal(props.class), unsignal(props.className))}
	/>;
}

function ChatView() {
	const account = useAccount();

	const roomMatch = useRoute("/rooms/:roomJID");
	const currentRoom = roomMatch[0] ? decodeURIComponent(roomMatch[1].roomJID) : null;

	const addMatch = useRoute("/rooms:add");

	const incomingRequestCounterparts = Array.from(account.counterparts.values())
		.filter(counterpartIsIncomingRequest);

	return <div class={cx(styles.sidebarSegment, styles.roomList)}>
		<div>
			<Link to="~/">
				<div class={cx(styles.roomLink, currentRoom === null && !addMatch[0] && styles.currentRoomLink, styles.homeAvatar)}>
					<Icon path={mdiHome} class={styles.roomLinkIcon} />
					{
						incomingRequestCounterparts.length > 0 &&
							<PriorityUnreadIndicator count={incomingRequestCounterparts.length} />
					}
				</div>
			</Link>
		</div>
		{
			Array.from(
				account.rooms,
				([roomJID, info]) => {
					const name = LoadState.ifDone(info.infoState, disco => disco.name, () => null) ?? roomJID;

					const counterpart = account.counterparts.get(roomJID);
					const unread = typeof counterpart !== "undefined" &&
						counterpart.lastMessageID !== null &&
						counterpart.lastReadMessageID !== counterpart.lastMessageID;

					return <div key={roomJID}>
						<WithTooltip tooltip={name} side="inline-end">
							<Link
								to={"~/chat/rooms/" + encodeURIComponent(roomJID)}
								class={cx(styles.roomLink, currentRoom === roomJID && styles.currentRoomLink)}
							>
								<Avatar size="lg" jid={roomJID} />
								{
									unread && <div class={styles.roomUnreadIndicator} />
								}
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
	</div>;
}

function ChatHomePage() {
	const { $t } = useIntl();

	const account = useAccount();

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
		<SpaceItemsList>
			<Link to="/" className={active => cx(styles.spaceItem, active && "active")}>
				<Icon path={mdiAccountMultiple} class={styles.bigSpaceItemIcon} />
				<span>{$t({defaultMessage: "Friends"})}</span>
			</Link>
			{
				conversations.map(item => {
					const counterpart = account.counterparts.get(item)!;

					return <Link to={"~/chat/direct/" + encodeURIComponent(item)} className={active => cx(styles.spaceItem, active && "active")}>
						<AvatarWithStatus size="md" jid={item} />
						<span style={{flexGrow: 1}}>{getNickForCounterpart(counterpart)}</span>
						{
							counterpart.lastMessageID !== null &&
								counterpart.lastReadMessageID !== counterpart.lastMessageID &&
								<div class={styles.counterpartUnreadIndicator} />
						}
					</Link>;
				})
			}
		</SpaceItemsList>
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
	const { $t } = useIntl();

	const appCtx = useAppContext();
	const conn = useConnectionContext();
	const account = useAccount();

	const [tab, setTab] = useState<FriendsTab>(FriendsTab.All);

	function acceptFriendRequest(target: JID) {
		conn.acceptFriendRequest(account.jid, target);
	}

	function rejectFriendRequest(target: JID) {
		conn.rejectFriendRequest(account.jid, target);
	}

	function removeFriend(target: JID) {
		conn.removeFriend(account.jid, target);
	}

	function removeFriendAfterConfirm(target: JID) {
		appCtx.showDialog(
			<ConfirmDialog
				onConfirm={removeFriend.bind(undefined, target)}
				confirmText={$t({defaultMessage: "Remove Friend"})}
			>
				<p>
					{$t({
						defaultMessage: "Are you sure you want to remove {target} as a friend?"
					}, {target: <em>{target.toString()}</em>})}
				</p>
			</ConfirmDialog>,
		);
	}

	const onClickFriendButtons = useCallback((evt: Event) => {
		evt.stopPropagation();
		evt.preventDefault();
	}, []);

	const incomingRequestCounterparts = Array.from(account.counterparts.values())
		.filter(counterpartIsIncomingRequest);

	const outgoingRequestCounterparts = Array.from(account.counterparts.values())
		.filter(info => {
			return info.rosterEntry !== null &&
				!info.rosterEntry.subscriptionTo &&
				info.rosterEntry.requestingSubscriptionTo;
		});

	return <div class={styles.contactsPage}>
		<ManualTabsContainer tab={tab} setTab={setTab}>
			<TabsList>
				<TabLink tab={FriendsTab.Online}>
					{$t({defaultMessage: "Online", description: "Friends tab"})}
				</TabLink>
				<TabLink tab={FriendsTab.All}>
					{$t({defaultMessage: "All"})}
				</TabLink>
				<TabLink tab={FriendsTab.Requests}>
					{$t({defaultMessage: "Requests"})}
					{incomingRequestCounterparts.length > 0 &&
						<>
							{" "}
							<PriorityUnreadIndicator count={incomingRequestCounterparts.length} />
						</>
					}
				</TabLink>
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
										{$t(presenceShowTypeNames[showType])}
									</div>}
								</div>
								<div class={styles.friendButtons} onClick={onClickFriendButtons}>
									<Menu>
										<MenuItem onClick={removeFriendAfterConfirm.bind(undefined, info.jid)}>
											{$t({defaultMessage: "Remove Friend"})}
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
						<h1>{$t({defaultMessage: "Add Friend"})}</h1>
						<AddFriendForm />
					</Block>
					{outgoingRequestCounterparts.length > 0 &&
						<Block>
							<h1>
								{$t({defaultMessage: "Outgoing", description: "Heading for outgoing friend requests"})}
							</h1>
							<div>
								{outgoingRequestCounterparts.map(info => {
									return <div class={styles.friendEntry} key={info.jid.toString()}>
										<div style={{flexGrow: 1}}>
											{info.jid.toString()}
										</div>
										<div class={styles.friendButtons}>
											<WithTooltip tooltip={$t({defaultMessage: "Cancel Request"})}>
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
								<h1>
									{$t({
										defaultMessage: "Incoming",
										description: "Heading for incoming friend requests",
									})}
								</h1>
								<div>
									{incomingRequestCounterparts.map(info => {
										return <div class={styles.friendEntry} key={info.jid.toString()}>
											<div style={{flexGrow: 1}}>
												{info.jid.toString()}
											</div>
											<div class={styles.friendButtons}>
												<WithTooltip tooltip={$t({defaultMessage: "Accept Request"})}>
													<IconButton onClick={acceptFriendRequest.bind(undefined, info.jid)}>
														<Icon path={mdiCheck} />
													</IconButton>
												</WithTooltip>
												<WithTooltip tooltip={$t({defaultMessage: "Reject Request"})}>
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
	const [, navigate] = useLocation();

	const account = useAccount();

	const logout = useLatestCallback(() => {
		navigate("~/logout/" + encodeURIComponent(account.jid.toString()));
	});

	useEffect(() => {
		if(account.stopped) {
			// Assume that means expired login

			logout();
		}
	}, [account.stopped, logout]);

	return <div class={styles.connectingView}>
		{!account.stopped &&
			<div>
				Connecting…
			</div>
		}
		{account.lastError !== null &&
			<ErrorAlert error={account.lastError} />
		}
		<Button tier="secondary" onClick={logout}>Log out</Button>
	</div>;
}

const presenceShowTypeNames: Record<PresenceShowTypeExtended, MessageDescriptor> = {
	[PresenceShowTypeExtended.XA]: defineMessage({defaultMessage: "Extended Away"}),
	[PresenceShowTypeExtended.DND]: defineMessage({defaultMessage: "Do Not Disturb"}),
	[PresenceShowTypeExtended.Chat]: defineMessage({
		defaultMessage: "Open to Chat",
		description: "Status indicating user wants to chat",
	}),
	[PresenceShowTypeExtended.Away]: defineMessage({defaultMessage: "Away"}),
	[PresenceShowTypeExtended.Available]: defineMessage({defaultMessage: "Online", description: "Default user status"}),
	[PresenceShowTypeExtended.Unavailable]: defineMessage({
		defaultMessage: "Offline",
		description: "Status indicating user is not online",
	}),
};

function AddFriendForm() {
	const { $t } = useIntl();

	const conn = useConnectionContext();
	const account = useAccount();

	const [input, linkInput, setInput] = useLinkState("");

	const [submitting, submit] = useSubmitting((evt: Event) => {
		evt.preventDefault();

		conn.sendFriendRequest(account.jid, parseJID(input));

		setInput("");

		return Promise.resolve();
	});

	return <form onSubmit={submit}>
		<Input type="text" value={input} onChange={linkInput} placeholder="user@server.example" pattern=".*@.*" />
		{" "}
		<Button tier="primary" type="submit" disabled={submitting}>{$t(msgActionAdd)}</Button>
	</form>
}

function SelfBox() {
	const { $t } = useIntl();
	const [, navigate] = useLocation();

	const account = useAccount();

	const counterpart = account.counterparts.get(account.jid.toString());

	const logout = useLatestCallback(() => {
		navigate("~/logout/" + encodeURIComponent(account.jid.toString()));
	});

	return <div class={styles.selfBox}>
		<Avatar jid={account.jid} size="md" />
		<div class={styles.selfBoxNameSegment}>
			{typeof counterpart === "undefined" ? account.jid.local : getNickForCounterpart(counterpart)}
			<div class={styles.friendEntryJID}>{account.jid.toString()}</div>
		</div>
		<Menu>
			<MenuItem onClick={logout}>{$t({defaultMessage: "Log out"})}</MenuItem>
		</Menu>
	</div>;
}

function counterpartIsIncomingRequest(info: Counterpart) {
	return info.requestingMySubscription;
}
