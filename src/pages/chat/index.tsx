import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachInstruction, extractInstruction, Instruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item";
import { DropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/list-item";
import { css, cx } from "@emotion/css";
import { mdiAccountMultiple, mdiConnection, mdiHome, mdiPlus } from "@mdi/js";
import { useComputed, useSignal, useSignalEffect } from "@preact/signals";
import { Show, useLiveSignal } from "@preact/signals/utils";
import { JID } from "@xmpp/jid";
import { JSX } from "preact";
import { memo } from "preact/compat";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { useIntl } from "react-intl";
import useLatestCallback from "use-latest-callback";
import { Link, Route, Switch, useLocation, useRoute } from "wouter-preact";

import { useAppContext } from "../..";
import Avatar from "../../components/Avatar";
import AvatarWithStatus, { AvatarWithStatusRaw } from "../../components/AvatarWithStatus";
import Button from "../../components/Button";
import { getCounterpartStatusContent } from "../../components/CounterpartStatusContent";
import { ErrorAlert } from "../../components/DataView";
import EditProfileDialog from "../../components/EditProfileDialog";
import For from "../../components/For";
import Icon from "../../components/Icon";
import Menu, { MenuItem } from "../../components/Menu";
import PriorityUnreadIndicator from "../../components/PriorityUnreadIndicator";
import SettingsDialog from "../../components/SettingsDialog";
import WithTooltip from "../../components/WithTooltip";
import { Room, useAccountSig, useConnectionContext } from "../../util/connection";
import { compareRanks } from "../../util/lexrank";
import { getNickForCounterpart } from "../../util/profileUtil";
import { useSignalMapKeysWhereValueMatches } from "../../util/SignalMap";
import { themeVars } from "../../util/theme";
import { Counterpart, PresenceShowType, PresenceShowTypeExtended } from "../../util/types";
import unsignal from "../../util/unsignal";
import { LoadState } from "../../util/useData";
import useEventHandler from "../../util/useEventHandler";
import ContactsPage from "./ContactsPage";
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

		".friendEntryJID": {
			display: "none",
		},

		"&:hover": {
			".friendEntryJID": {
				display: "initial",
			},
			".statusText": {
				display: "none",
			},
		},
	}),
	selfBoxJID: cx("friendEntryJID", css({
		display: "inline-block",
		fontSize: "80%",
		overflowX: "hidden",
		textOverflow: "ellipsis",
	})),
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
		overflowY: "auto",

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
	statusText: cx("statusText", css({
		opacity: 0.65,
		fontSize: "80%",

		whiteSpace: "nowrap",
		overflowX: "hidden",
		textOverflow: "ellipsis",
	})),
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
	roomDisconnectedIndicator: css({
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",

		display: "flex",

		justifyContent: "end",
		alignItems: "end",

		color: themeVars.error,
	}),
};

export default function ChatPage() {
	const accountSig = useAccountSig();

	const connectedSig = useComputed(() => accountSig.value!.connected);

	if(!connectedSig.value) {
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

export function SidebarSegment(props: JSX.HTMLAttributes<HTMLDivElement>) {
	return <div
		{...props}
		className={cx(styles.sidebarSegment, unsignal(props.class), unsignal(props.className))}
	/>;
}

export function SpaceItemsList(props: JSX.HTMLAttributes<HTMLDivElement>) {
	return <SidebarSegment
		{...props}
		className={cx(styles.spaceItemsList, unsignal(props.class), unsignal(props.className))}
	/>;
}

type PendingReorder = {movingRoom: JID; to: {after: JID | null; before: JID | null}};

function ChatView() {
	const [, navigate] = useLocation();

	const conn = useConnectionContext();
	const accountSig = useAccountSig();

	const roomMatch = useRoute("/rooms/:roomJID");
	const currentRoom = roomMatch[0] ? decodeURIComponent(roomMatch[1].roomJID) : null;

	const addMatch = useRoute("/rooms:add");

	const pendingReordersSig = useSignal<Set<PendingReorder>>(new Set());

	const reorderRoom = useLatestCallback((movingRoom: JID, to: {after: JID | null; before: JID | null}) => {
		(async () => {
			const entry = {movingRoom, to};
			pendingReordersSig.value = withAddedToSet(pendingReordersSig.value, entry);
			try {
				await conn.reorderRoom(accountSig.value.jid, movingRoom, to);
			}
			catch(err) {
				alert(err);
			}
			finally {
				pendingReordersSig.value = withDeletedFromSet(pendingReordersSig.value, entry);
			}
		})();
	});

	const roomsSrcSig = useComputed(() => accountSig.value.rooms);

	const roomsSig = useComputed(() => {
		const rooms = Array.from(roomsSrcSig.value.values());
		rooms.sort((a, b) => compareRanks(a.rank, b.rank));
		applyPendingReorders(rooms, pendingReordersSig.value);
		return rooms;
	});

	const onGlobalKeyDown = useLatestCallback((evt: KeyboardEvent) => {
		if(evt.ctrlKey && evt.altKey) {
			if(evt.code === "Home") {
				navigate("~/");
				evt.preventDefault();
			}
			else if(evt.code === "ArrowUp" || evt.code === "ArrowDown") {
				const currentIndex = currentRoom === null ?
					(addMatch[0] ? roomsSig.value.length : -1) :
					roomsSig.value.findIndex(x => x.jid.toString() === currentRoom);

				let targetIndex;
				if(evt.code === "ArrowUp") {
					targetIndex = currentIndex - 1;
					if(targetIndex < -1) targetIndex = roomsSig.value.length;
				}
				else {
					targetIndex = currentIndex + 1;
					if(targetIndex > roomsSig.value.length) targetIndex = -1;
				}

				console.log("from", currentIndex, "to", targetIndex);

				navigate(
					targetIndex === -1 ?
						"~/" :
						(
							targetIndex === roomsSig.value.length ?
								"~/chat/rooms:add" : 
								("~/chat/rooms/" + encodeURIComponent(roomsSig.value[targetIndex].jid.toString()))
						)
				);
			}
		}
	});
	useEventHandler(window, "keydown", onGlobalKeyDown);

	return <div class={cx(styles.sidebarSegment, styles.roomList)}>
		<HomeLink active={currentRoom === null && !addMatch[0]} />
		<For each={roomsSig} static>
			{info => {
				return <RoomLink
					key={info.jid.toString()}
					room={info}
					reorderRoom={reorderRoom}
				/>;
			}}
		</For>
		<div>
			<Link to="~/chat/rooms:add">
				<div class={cx(styles.roomLink, addMatch[0] && styles.currentRoomLink, styles.homeAvatar)}>
					<Icon path={mdiPlus} class={styles.roomLinkIcon} />
				</div>
			</Link>
		</div>
	</div>;
}

function HomeLink(props: {active: boolean}) {
	const accountSig = useAccountSig();

	const incomingRequestCounterpartsCount = useComputed(() => {
		let result = 0;

		for(const counterpart of accountSig.value.counterparts.values()) {
			if(counterpartIsIncomingRequest(counterpart)) result += 1;
		}

		return result;
	}).value;

	const possibleUnreadConversationsSig = useSignalMapKeysWhereValueMatches(
		accountSig.value.counterparts,
		counterpart => {
			return counterpart.lastMessageIDForUnread !== null &&
				counterpart.lastReadMessageID !== counterpart.lastMessageIDForUnread &&
				counterpart.lastReadMessageID !== counterpart.lastMessageID;
		},
		true,
	);
	const hasUnreadConversationsSig = useComputed(() => {
		// Ignore rooms for this

		for(const key of possibleUnreadConversationsSig.value) {
			const counterpart = accountSig.value.counterparts.get(key)!;

			if(!accountSig.value.rooms.has(counterpart.jid.toString())) return true;
		}

		return false;
	});

	return <div>
		<Link to="~/">
			<div class={cx(styles.roomLink, props.active && styles.currentRoomLink, styles.homeAvatar)}>
				<Icon path={mdiHome} class={styles.roomLinkIcon} />
				{
					incomingRequestCounterpartsCount > 0 ?
						<PriorityUnreadIndicator count={incomingRequestCounterpartsCount} /> :
						<Show when={hasUnreadConversationsSig}>
							<div class={styles.roomUnreadIndicator} />
						</Show>
				}
			</div>
		</Link>
	</div>;
}

function RoomLink(props: {
	room: Room;
	reorderRoom(movingRoom: JID, to: {before: JID | null; after: JID | null}): void;
}) {
	const conn = useConnectionContext();
	const accountSig = useAccountSig();

	const accountJID = useComputed(() => accountSig.value.jid).value;

	const roomMatch = useRoute("/rooms/:roomJID");
	const currentRoom = roomMatch[0] ? decodeURIComponent(roomMatch[1].roomJID) : null;
	const isCurrent = props.room.jid.toString() === currentRoom;

	const name = LoadState.ifDone(props.room.infoState, disco => disco.name, () => null) ?? props.room.jid.toString();

	const counterpart = useComputed(() => {
		return accountSig.value.counterparts.get(props.room.jid.toString());
	}).value;
	const unread = typeof counterpart !== "undefined" &&
		counterpart.lastMessageIDForUnread !== null &&
		counterpart.lastReadMessageID !== counterpart.lastMessageIDForUnread &&
		counterpart.lastReadMessageID !== counterpart.lastMessageID;

	const ref = useRef<HTMLDivElement>(null);

	const [dragging, setDragging] = useState(false);
	const [instruction, setInstruction] = useState<null | Instruction>(null);

	useEffect(() => {
		return combine(
			draggable({
				element: ref.current!,
				onDragStart: () => {
					console.log("drag start");
					setDragging(true);
				},
				getInitialData() {
					return {jid: props.room.jid};
				},
				onDrop: setDragging.bind(undefined, false),
			}),
			dropTargetForElements({
				element: ref.current!,
				getData({input, element}) {
					return attachInstruction({}, {
						input,
						element,
						operations: {
							"reorder-before": "available",
							"reorder-after": "available",
						},
					});
				},
				onDrag(args) {
					setInstruction(extractInstruction(args.self.data));
				},
				onDragLeave() {
					setInstruction(null);
				},
				onDrop(args) {
					try {
						console.log("drop", args);

						const movingRoom = args.source.data.jid as JID;

						const finalInstruction = extractInstruction(args.self.data);

						if(finalInstruction !== null) {
							const accountNow = conn.accountsSig.value.find(x => x.jid.equals(accountJID));
							if(typeof accountNow === "undefined") throw new Error("Missing account");

							const rooms = Array.from(accountNow.rooms.values());
							rooms.sort((a, b) => compareRanks(a.rank, b.rank));

							const targetIdx = rooms.findIndex(x => x.jid.equals(props.room.jid));
							if(targetIdx < 0) throw new Error("Couldn't find anchor room");

							let to: {after: JID | null; before: JID | null};
							if(finalInstruction.operation === "reorder-after") {
								to = {
									after: props.room.jid,
									before: (targetIdx + 1 < rooms.length) ? rooms[targetIdx + 1].jid : null,
								};
							}
							else if(finalInstruction.operation === "reorder-before") {
								to = {
									before: props.room.jid,
									after: targetIdx > 0 ? rooms[targetIdx - 1].jid : null,
								};
							}
							else {
								throw new Error("Unsupported operation");
							}

							props.reorderRoom.call(undefined,movingRoom, to);
						}
					}
					finally {
						setInstruction(null);
					}
				},
			}),
		);
	}, [accountJID, conn.accountsSig, props.reorderRoom, props.room.jid]);

	return <div
		key={props.room.jid.toString()}
		ref={ref}
		style={{visibility: dragging ? "hidden" : undefined, position: "relative"}}
	>
		<WithTooltip tooltip={name} side="inline-end">
			<Link
				to={"~/chat/rooms/" + encodeURIComponent(props.room.jid.toString())}
				class={cx(styles.roomLink, isCurrent && styles.currentRoomLink)}
				draggable={false}
			>
				<Avatar size="lg" jid={props.room.jid.toString()} />
				{
					unread && <div class={styles.roomUnreadIndicator} />
				}
				{
					!props.room.connected && <div class={styles.roomDisconnectedIndicator}>
						<Icon path={mdiConnection} />
					</div>
				}
			</Link>
		</WithTooltip>
		{instruction !== null && <DropIndicator instruction={instruction} />}
	</div>;
}

function ChatHomePage() {
	const { $t } = useIntl();

	const [, navigate] = useLocation();

	const accountSig = useAccountSig();

	const possibleConversationsKeysSig = useSignalMapKeysWhereValueMatches(accountSig.value.counterparts, counterpart => {
		return (counterpart.lastMessageTimestamp !== null || counterpart.overrideVisibleTimestamp !== null);
	}, true);

	// TODO somehow avoid re-sorting so often?
	const conversationsSig = useComputed(() => {
		const list = possibleConversationsKeysSig.value.map(x => accountSig.value.counterparts.get(x)!)
			.filter(x => !accountSig.value.rooms.has(x.jid.toString()));
		list.sort((a, b) => {
			return (b.lastMessageTimestamp ?? b.overrideVisibleTimestamp)!.getTime() -
				(a.lastMessageTimestamp ?? a.overrideVisibleTimestamp)!.getTime();
		});
		return list.map(x => x.jid);
	});

	const conversationMatch = useRoute("/direct/:jid");
	const currentConversation = conversationMatch[0] ? decodeURIComponent(conversationMatch[1].jid) : null;

	const onGlobalKeyDown = useLatestCallback((evt: KeyboardEvent) => {
		if(evt.altKey && !evt.ctrlKey) {
			if(evt.code === "ArrowUp" || evt.code === "ArrowDown") {
				const currentIndex = currentConversation === null ?
					-1 :
					conversationsSig.value.findIndex(x => x.toString() === currentConversation);

				let targetIndex;
				if(evt.code === "ArrowUp") {
					targetIndex = currentIndex - 1;
					if(targetIndex < -1) targetIndex = conversationsSig.value.length - 1;
				}
				else {
					targetIndex = currentIndex + 1;
					if(targetIndex > conversationsSig.value.length - 1) targetIndex = -1;
				}

				console.log("from", currentIndex, "to", targetIndex);

				navigate(
					targetIndex === -1 ?
						"~/" :
						("~/chat/direct/" + encodeURIComponent(conversationsSig.value[targetIndex].toString()))
				);
			}
		}
	});
	useEventHandler(window, "keydown", onGlobalKeyDown);

	return <div style={{display: "flex", flexGrow: 1}}>
		<SpaceItemsList>
			<Link to="/" className={active => cx(styles.spaceItem, active && "active")}>
				<Icon path={mdiAccountMultiple} class={styles.bigSpaceItemIcon} />
				<span>{$t({defaultMessage: "Friends"})}</span>
			</Link>
			<For each={conversationsSig} static>
				{jid => <ConversationLink jid={jid} key={jid} />}
			</For>
		</SpaceItemsList>
		<Switch>
			<Route path="/direct/:counterpartJID" component={DirectChatPage} />
			<Route path="/" component={ContactsPage} />
		</Switch>
	</div>;
}

const ConversationLink = memo(function ConversationLink(props: {jid: JID}) {
	const accountSig = useAccountSig();
	const counterpart = useComputed(() => accountSig.value.counterparts.get(props.jid.toString())).value!;

	return <Link
		to={"~/chat/direct/" + encodeURIComponent(props.jid.toString())}
		className={active => cx(styles.spaceItem, active && "active")}
	>
		<AvatarWithStatus size="md" jid={props.jid} />
		<span style={{flexGrow: 1}}>{getNickForCounterpart(counterpart)}</span>
		{
			counterpart.lastMessageIDForUnread !== null &&
				counterpart.lastReadMessageID !== counterpart.lastMessageIDForUnread &&
				counterpart.lastReadMessageID !== counterpart.lastMessageID &&
				<div class={styles.counterpartUnreadIndicator} />
		}
	</Link>;
});

function ConnectingView() {
	const { $t } = useIntl();

	const [, navigate] = useLocation();

	const accountSig = useAccountSig();

	const logout = useLatestCallback(() => {
		navigate("~/logout/" + encodeURIComponent(accountSig.value.jid.toString()));
	});

	useSignalEffect(() => {
		if(accountSig.value.stopped) {
			// Assume that means expired login

			logout();
		}
	});

	return <div class={styles.connectingView}>
		{!accountSig.value.stopped &&
			<div>
				{$t({defaultMessage: "Connecting…"})}
			</div>
		}
		{accountSig.value.lastError !== null &&
			<ErrorAlert error={accountSig.value.lastError} />
		}
		<Button tier="secondary" onClick={logout}>{$t({defaultMessage: "Log out"})}</Button>
	</div>;
}

function SelfBox() {
	const intl = useIntl();
	const { $t } = intl;
	const intlSig = useLiveSignal(intl);

	const [, navigate] = useLocation();

	const appCtx = useAppContext();
	const conn = useConnectionContext();
	const accountSig = useAccountSig();

	const jid = useComputed(() => {
		const account = accountSig.value;
		if(typeof account === "undefined") throw new Error("Not logged in");
		return account.jid;
	}).value;

	const counterpartSig = useComputed(() => {
		const account = accountSig.value;
		if(typeof account === "undefined") throw new Error("Not logged in");

		return account.counterparts.get(account.jid.toString());
	});

	const nickSig = useComputed(() => {
		const counterpart = counterpartSig.value;

		return typeof counterpart === "undefined" ? jid.local : getNickForCounterpart(counterpart);
	});

	const openSettings = useCallback(() => {
		appCtx.showDialog.call(undefined, <SettingsDialog />);
	}, [appCtx.showDialog]);

	const editProfile = useLatestCallback(() => {
		appCtx.showDialog(<EditProfileDialog />);
	});

	const logout = useLatestCallback(() => {
		navigate("~/logout/" + encodeURIComponent(jid.toString()));
	});

	const showTypeSig = useComputed(() => {
		return conn.idle.value.idle ? PresenceShowType.Away : PresenceShowTypeExtended.Available;
	});

	const statusContentSig = useComputed(() => {
		if(typeof counterpartSig.value === "undefined") return null;

		return getCounterpartStatusContent(counterpartSig.value, intlSig.value, showTypeSig.value);
	});

	return <div class={styles.selfBox}>
		<AvatarWithStatusRaw
			size="md"
			jid={jid}
			showType={showTypeSig}
		/>
		<div class={styles.selfBoxNameSegment}>
			{nickSig}
			<div class={cx(styles.statusText)}>{statusContentSig}</div>
			<div class={styles.selfBoxJID}>{jid.toString()}</div>
		</div>
		<Menu>
			<MenuItem onClick={openSettings}>{$t({defaultMessage: "Settings"})}</MenuItem>
			<MenuItem onClick={editProfile}>{$t({defaultMessage: "Edit Profile"})}</MenuItem>
			<MenuItem onClick={logout}>{$t({defaultMessage: "Log out"})}</MenuItem>
		</Menu>
	</div>;
}

function counterpartIsIncomingRequest(info: Counterpart) {
	return info.requestingMySubscription;
}

function applyPendingReorders(rooms: Room[], pendingReorders: Set<PendingReorder>) {
	pendingReorders.forEach(entry => {
		const currentIndex = rooms.findIndex(x => x.jid.equals(entry.movingRoom));
		if(currentIndex < 0) return;

		let targetIndex;
		if(entry.to.after !== null) {
			const refIndex = rooms.findIndex(x => x.jid.equals(entry.to.after!));
			if(refIndex < 0) return;

			targetIndex = refIndex + 1;
		}
		else if(entry.to.before !== null) {
			const refIndex = rooms.findIndex(x => x.jid.equals(entry.to.before!));
			if(refIndex < 0) return;

			targetIndex = refIndex - 1;
		}
		else {
			return;
		}

		const [room] = rooms.splice(currentIndex, 1);
		rooms.splice(currentIndex < targetIndex ? (targetIndex - 1) : targetIndex, 0, room);
	});
}

function withAddedToSet<T>(current: Set<T>, newItem: T): Set<T> {
	const result = new Set(current);
	result.add(newItem);
	return result;
}

function withDeletedFromSet<T>(current: Set<T>, newItem: T): Set<T> {
	const result = new Set(current);
	result.delete(newItem);
	return result;
}
