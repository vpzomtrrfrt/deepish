import { css } from "@emotion/css";
import { useComputed, useSignal, useSignalEffect } from "@preact/signals";
import xid from "@xmpp/id";
import { JID, parse as parseJID } from "@xmpp/jid";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Fragment } from "preact/jsx-runtime";
import { useIntl } from "react-intl";
import useLatestCallback from "use-latest-callback";
import { useLocation } from "wouter-preact";

import { NOTIFICATION_LEVEL_NAMES, useAppContext } from "../../..";
import AvatarWithStatus from "../../../components/AvatarWithStatus";
import ConfirmDialog from "../../../components/ConfirmDialog";
import ConfirmTaskDialog from "../../../components/ConfirmTaskDialog";
import { DataNonDoneView, ErrorAlert, Loading } from "../../../components/DataView";
import EditRoomDialog from "../../../components/EditRoomDialog";
import For from "../../../components/For";
import Menu, { MenuGroupLabel, MenuItem, MenuRadioGroup, MenuRadioItem } from "../../../components/Menu";
import MessageInput from "../../../components/MessageInput";
import MessageList, { LoadMoreTriggerer, MessageSourceDialog, ReplyingIndicator } from "../../../components/MessageList";
import TaskDialog from "../../../components/TaskDialog";
import TypingIndicator from "../../../components/TypingIndicator";
import { Message, messageEditIsAllowed, MessageRemovalEvent, messageRemovalIsAllowed, NotificationLevel, ResultSetInfo, useAccountSig, useConnectionContext } from "../../../util/connection";
import { msgActionDelete, presenceShowTypeNames } from "../../../util/langCommon";
import { useCreateMessageCache } from "../../../util/messageCache";
import { useSignalMapKeysWhereValueMatches } from "../../../util/SignalMap";
import { getShowTypeForCounterpart } from "../../../util/statusUtil";
import { themeVars } from "../../../util/theme";
import { LoadState } from "../../../util/useData";
import { checkPrivilegeForRole, MUCPrivilege } from "../../../util/xmpp/mucPrivileges";
import { StanzaIDType } from "../../../util/xmpp/StanzaID";
import { SidebarSegment } from "..";

const styles = {
	page: css({
		flexGrow: 1,
		flexShrink: 1,
		minWidth: 0,
		marginInlineStart: ".5rem",

		display: "flex",
		flexDirection: "column",
	}),
	header: css({
		display: "flex",
		alignItems: "center",
	}),
	headerStart: css({
		display: "flex",
		gap: ".5rem",
		alignItems: "center",
		flexGrow: 1,
		flexShrink: 1,
		minWidth: 0,
		overflowX: "hidden",

		"> h1": {
			margin: 0,
		},
	}),
	membersList: css({
		width: "250px",

		display: "flex",
		flexDirection: "column",
		overflowY: "auto",
		overflowX: "hidden",

		borderRightStyle: "solid",
		borderRightWidth: "1px",
		borderRightColor: themeVars.outline1,
		backgroundColor: themeVars.bg1,
	}),
	membersListEntry: css({
		padding: ".5rem",
		textDecoration: "none",
		color: "inherit",

		display: "flex",
		alignItems: "center",
		whiteSpace: "nowrap",

		"> .avatar": {
			marginInlineEnd: ".5rem",
		},
	}),
	statusText: css({
		opacity: 0.65,
		fontSize: "80%",
	}),
	messageInputArea: css({
		marginInlineStart: "250px",
	}),
};

export default function ChatRoomPage(props: {params: {roomJID: string}}) {
	const { $t } = useIntl();

	const roomJID = useMemo(() => {
		try {
			return parseJID(decodeURIComponent(props.params.roomJID))
		}
		catch(ex) {
			console.error(ex);
			return undefined;
		}
	}, [props.params.roomJID]);

	if(typeof roomJID === "undefined") {
		return <div>{$t({defaultMessage: "Invalid address"})}</div>;
	}

	return <ChatRoomPageInner roomJID={roomJID} key={roomJID} />;
}

function ChatRoomPageInner(props: {roomJID: JID}) {
	const { $t } = useIntl();
	const [, navigate] = useLocation();

	const appCtx = useAppContext();
	const conn = useConnectionContext();
	const accountSig = useAccountSig();

	const accountJIDSig = useComputed(() => accountSig.value.jid);
	const roomSig = useComputed(() => accountSig.value.rooms.getSignal(props.roomJID.toString())).value;

	const accountJID = accountJIDSig.value;
	const room = roomSig.value;

	const counterpartSig = useComputed(() => accountSig.value.counterparts.getSignal(props.roomJID.toString())).value;

	const msgCache = useCreateMessageCache(useMemo(() => ({type: "room", jid: props.roomJID}), [props.roomJID]));

	const pageStateSig = useSignal<null | LoadState<ResultSetInfo | null>>(null);

	const nextPageRef = useRef<string | null>(null);

	const loadMore = useLatestCallback(() => {
		pageStateSig.value = LoadState.loading;

		conn.requestArchive(accountJID, room!.jid, {}, nextPageRef.current ?? undefined)
			.then(value => {
				nextPageRef.current = value === null ? null : value.firstItem;
				pageStateSig.value = LoadState.wrapValue(value);
			})
			.catch(err => {
				pageStateSig.value = LoadState.wrapError(err);
			});
	});

	useSignalEffect(() => {
		if(roomSig.value?.connected === true && pageStateSig.value === null) loadMore();
	});

	useSignalEffect(() => {
		const messages = msgCache.getMessages();
		const counterpart = counterpartSig.value;

		// TODO skip marking when scrolled up
		if(
			pageStateSig.value !== null &&
				pageStateSig.value.state === "done" &&
				messages.length > 0 &&
				typeof counterpart !== "undefined"
		) {
			const lastMessage = messages[messages.length - 1];
			const lastMessageID = lastMessage.ids.find(x => {
				return x.type === StanzaIDType.Stanza && x.by !== null && x.by.equals(counterpart.jid);
			});
			if(typeof lastMessageID !== "undefined" && counterpart.lastReadMessageID !== lastMessageID.id) {
				conn.markCounterpartAsRead(accountJIDSig.value, counterpart.jid, lastMessageID.id, false);
			}
		}
	});

	const [replyingTo, setReplyingTo] = useState<Message | null>(null);

	const cancelReply = useCallback(() => {
		setReplyingTo(null);

		inputRef.current!.focus();
	}, []);

	const inputRef = useRef<HTMLTextAreaElement>(null);

	const startReply = useLatestCallback((message: Message) => {
		setReplyingTo(message);

		inputRef.current!.focus();
	});

	const [pendingMessages, setPendingMessages] = useState<Array<
		Pick<Message, "content" | "timestamp" | "localID">
	>>([]);

	const submitMessage = useLatestCallback((newMessage: string, options?: {replaces?: string}) => {
		const tmpID = xid();

		setPendingMessages(current => {
			return [
				...current,
				{localID: tmpID, timestamp: new Date(), content: [{type: "markdown", content: newMessage}]},
			];
		});

		(async () => {
			try {
				await conn.sendMessageToRoom(
					accountJID,
					room!.jid,
					{body: newMessage},
					{replyingTo: replyingTo ?? undefined, ...options},
				);
			}
			finally {
				setPendingMessages(current => current.filter(x => x.localID !== tmpID));
			}
		})();

		setReplyingTo(null);
	});

	const submitEdit = useLatestCallback(async (newMessage: string, replaces: string) => {
		return submitMessage(newMessage, {replaces});
	});

	const submitReactions = useLatestCallback(async (reactions: string[], message: Message) => {
		const id = message.ids.find(x => x.type === StanzaIDType.Stanza && x.by?.equals(props.roomJID));
		if(typeof id === "undefined") throw new Error("Cannot react to this message");

		await conn.sendMessageReactionsToRoom.call(
			undefined,
			accountSig.value.jid,
			props.roomJID,
			id.id,
			reactions,
		);
	});

	const onChangeComposing = useLatestCallback((composing: boolean) => {
		conn.setComposingToRoom(accountJID, props.roomJID, composing);
	});

	useEffect(() => {
		return () => onChangeComposing(false);
	}, [onChangeComposing]);

	const editRoom = useLatestCallback(() => {
		appCtx.showDialog(
			<EditRoomDialog room={props.roomJID} />
		);
	});

	const leaveRoom = useLatestCallback(() => {
		appCtx.showDialog(
			<ConfirmDialog
				confirmText={$t({defaultMessage: "Leave"})}
				onConfirm={() => {
					const task = conn.leaveRoom.call(undefined, accountJID, room!.jid);

					appCtx.showDialog(<TaskDialog task={task}>{$t({defaultMessage: "Leaving…"})}</TaskDialog>);

					task.then(() => navigate("~/"));
				}}
			>
				<p>
					{$t({
						defaultMessage: "Are you sure you want to leave {room}?",
					}, {room: <em>{room!.jid.toString()}</em>})}
				</p>
			</ConfirmDialog>
		);
	});

	const selfJIDInRoomSig = useComputed(() => {
		const room = roomSig.value;
		if(typeof room === "undefined") return undefined;

		return new JID(room.jid.local, room.jid.domain, room.nick ?? accountJIDSig.value.local);
	});

	const allUsersTypingSig = useSignalMapKeysWhereValueMatches(accountSig.value.counterparts, value => {
		return value.jid.bare().equals(props.roomJID) && value.composingFrom === true;
	});

	const usersTypingSig = useComputed(() => {
		const room = roomSig.value;

		if(typeof room === "undefined") return [];

		return allUsersTypingSig.value.map(parseJID).filter(x => !x.equals(selfJIDInRoomSig.value!));
	});

	const selfCounterpartInRoomSig = useComputed(() => {
		const selfJIDInRoom = selfJIDInRoomSig.value;

		return typeof selfJIDInRoom === "undefined" ?
			undefined :
			accountSig.value.counterparts.get(selfJIDInRoom.toString());
	});
	const selfCounterpartInRoom = selfCounterpartInRoomSig.value;

	const canSend = (
		typeof room === "undefined" ||
			!room.connected ||
			typeof selfCounterpartInRoom === "undefined" ||
			selfCounterpartInRoom.role === null
	) ?
		null :
		checkPrivilegeForRole(MUCPrivilege.SendMessagesToAll, selfCounterpartInRoom.role);

	const retractMessage = useCallback((messageID: string) => {
		appCtx.showDialog.call(
			undefined,
			<ConfirmTaskDialog
				submit={async () => {
					return conn.retractMessageToRoom.call(undefined, accountJID, props.roomJID, messageID);
				}}
				confirmText={$t(msgActionDelete)}
			>
				{$t({defaultMessage: "Are you sure you want to delete this message?"})}
			</ConfirmTaskDialog>
		);
	}, [$t, accountJID, appCtx.showDialog, conn.retractMessageToRoom, props.roomJID]);

	const moderateMessage = useCallback((messageID: string) => {
		appCtx.showDialog.call(
			undefined,
			<ConfirmTaskDialog
				submit={async () => {
					return conn.moderateMessageToRoom.call(undefined, accountJID, props.roomJID, messageID);
				}}
				confirmText={$t(msgActionDelete)}
			>
				{$t({defaultMessage: "Are you sure you want to delete this message?"})}
			</ConfirmTaskDialog>
		);
	}, [$t, accountJID, appCtx.showDialog, conn.moderateMessageToRoom, props.roomJID]);

	const showSourceDialog = useCallback((message: Message) => {
		appCtx.showDialog.call(undefined, <MessageSourceDialog message={message} />);
	}, [appCtx.showDialog]);

	const selfOccupantIDSig = useComputed(() => {
		const selfCounterpartInRoom = selfCounterpartInRoomSig.value;

		return selfCounterpartInRoom?.occupantID ?? undefined;
	});

	const actionFrom = useComputed(() => {
		if(typeof selfJIDInRoomSig.value === "undefined") return undefined;

		return {
			jid: selfJIDInRoomSig.value,
			occupantID: selfOccupantIDSig.value,
		} satisfies MessageRemovalEvent["from"];
	}).value;

	const canModerate = useComputed(() => {
		const room = roomSig.value;
		const selfCounterpartInRoom = selfCounterpartInRoomSig.value;

		return typeof room !== "undefined" &&
			LoadState.ifDone(room.infoState, info => info.features.has("urn:xmpp:message-moderate:1")) &&
			typeof selfCounterpartInRoom?.role === "string" &&
			checkPrivilegeForRole(MUCPrivilege.ModerateMessages, selfCounterpartInRoom.role);
	}).value;

	const renderMenu = useCallback((message: Message, setMenuOpen: (value: boolean) => void) => {
		const items = [];

		{
			const id = message.ids.find(x => {
				return x.type === StanzaIDType.Stanza && x.by !== null && x.by.equals(props.roomJID);
			});

			if(typeof id !== "undefined") {
				if(
					typeof actionFrom !== "undefined" && messageRemovalIsAllowed(
						message,
						{
							from: actionFrom,
							removal: {type: "retract"},
							room: props.roomJID,
						},
					)
				) {
					items.push(
						<MenuItem onClick={retractMessage.bind(undefined, id.id)}>
							{$t({defaultMessage: "Delete Message"})}
						</MenuItem>
					);
				}
				else if(canModerate) {
					items.push(
						<MenuItem onClick={moderateMessage.bind(undefined, id.id)}>
							{$t({defaultMessage: "Delete Message"})}
						</MenuItem>
					);
				}
			}
		}

		items.push(
			<MenuItem onClick={showSourceDialog.bind(undefined, message)}>
				{$t({defaultMessage: "View Source"})}
			</MenuItem>,
		);

		if(items.length < 1) return null;
		else {
			return <Menu onOpenChange={setMenuOpen}>{items}</Menu>;
		}
	}, [$t, canModerate, actionFrom, moderateMessage, props.roomJID, retractMessage, showSourceDialog]);

	const canEdit = useMemo(() => {
		console.log("canEdit changed");

		return (message: Message) => {
			if(canSend !== true) return false;

			if(typeof actionFrom !== "undefined") {
				if(
					messageEditIsAllowed(
						message,
						{
							from: actionFrom,
							room: props.roomJID,
						},
					)
				) {
					return true;
				}
			}

			return false;
		};
	}, [canSend, actionFrom, props.roomJID]);

	const onChangeNotificationLevel = useCallback((newValue: NotificationLevel) => {
		console.log("onChangeNotificationLevel");

		conn.setRoomNotificationLevel.call(undefined, accountJID, props.roomJID, newValue);
	}, [accountJID, conn.setRoomNotificationLevel, props.roomJID]);

	const onInputKeyDown = useLatestCallback((evt: KeyboardEvent) => {
		if(evt.code === "Escape") {
			if(replyingTo !== null) {
				evt.preventDefault();
				cancelReply();
			}
		}
	});

	const loaderContentSig = useComputed(() => {
		return pageStateSig.value === null ?
			<p>{$t({defaultMessage: "Connecting…"})}</p> :
			LoadState.ifDone(
				pageStateSig.value,
				info => info === null ?
					<p>{$t({defaultMessage: "No more messages known."})}</p> :
					<LoadMoreTriggerer loadMore={loadMore} />,
				pageState => <DataNonDoneView state={pageState} />,
			);
	});

	return <Fragment>
		<div class={styles.page}>
			<div class={styles.header}>
				<div class={styles.headerStart}>
					{
						typeof room !== "undefined" &&
							LoadState.ifDone(room.infoState, disco => <h1>{disco.name}</h1>, () => null)
					}
					<div style={{textOverflow: "ellipsis", overflowX: "hidden"}}>{props.roomJID.toString()}</div>
				</div>
				<div>
					<Menu>
						{typeof room !== "undefined" &&
							<MenuRadioGroup value={room.notificationLevel} onValueChange={onChangeNotificationLevel}>
								<MenuGroupLabel>{$t({defaultMessage: "Notifications"})}</MenuGroupLabel>
								<MenuRadioItem value={null}>
									{$t({defaultMessage: "Default"})}
								</MenuRadioItem>
								{Array.from(Object.entries(NOTIFICATION_LEVEL_NAMES), ([key, value]) => {
									return <MenuRadioItem value={parseInt(key, 10)}>{$t(value)}</MenuRadioItem>;
								})}
							</MenuRadioGroup>
						}
						{(
							typeof selfCounterpartInRoom !== "undefined" &&
								selfCounterpartInRoom.affiliation === "owner"
						) &&
							<MenuItem onClick={editRoom}>{$t({defaultMessage: "Channel Settings"})}</MenuItem>
						}
						<MenuItem onClick={leaveRoom}>{$t({defaultMessage: "Leave Channel"})}</MenuItem>
					</Menu>
				</div>
			</div>
			{
				(typeof room !== "undefined" && !room.connected && room.error !== null) ?
					<div>
						<ErrorAlert error={room.error} />
					</div> :
					<>
						<MessageList
							msgCache={msgCache}
							pendingMessages={pendingMessages}
							loaderContent={loaderContentSig}
							renderMenu={renderMenu}
							submitEdit={submitEdit}
							canEdit={canEdit}
							submitReactions={submitReactions}
							startReply={startReply}
						/>
						<div class={styles.messageInputArea} onKeyDown={onInputKeyDown}>
							<TypingIndicator usersTyping={usersTypingSig} inRoom={true} />
							{replyingTo !== null && <ReplyingIndicator message={replyingTo} cancelReply={cancelReply} />}
							{
								canSend === null ?
									(
										room?.connected === false ?
											<p>{$t({defaultMessage: "Connecting…"})}</p> :
											<Loading />
									) :
									(
										canSend ?
											<MessageInput
												submitMessage={submitMessage}
												autofocus
												onChangeComposing={onChangeComposing}
												ref={inputRef}
											/> :
											<p>
												{$t({
													defaultMessage:
														"You don't have permission to send messages in this channel",
												})}
											</p>
									)
							}
						</div>
					</>
			}
		</div>
		<MembersList roomJID={props.roomJID} />
	</Fragment>;
}

function MembersList(props: {roomJID: JID}) {
	const accountSig = useAccountSig();

	const room = useComputed(() => accountSig.value.rooms.getSignal(props.roomJID.toString())).value.value;

	const membersSig = useSignalMapKeysWhereValueMatches(accountSig.value.counterparts, x => {
		return x.jid.bare().equals(props.roomJID) &&
			x.jid.resource !== "" &&
			x.presences !== null &&
			x.presences.size > 0;
	});

	if(typeof room === "undefined" || !room.connected) return null;

	return <SidebarSegment class={styles.membersList}>
		<For each={membersSig} static>
			{jid => <MembersListEntry jid={parseJID(jid)} />}
		</For>
	</SidebarSegment>;
}

function MembersListEntry(props: {jid: JID}) {
	const { $t } = useIntl();

	const accountSig = useAccountSig();

	const counterpart = accountSig.value.counterparts.get(props.jid.toString())!;

	const showType = getShowTypeForCounterpart(counterpart, true);

	return <div key={counterpart.jid.resource} class={styles.membersListEntry}>
		<AvatarWithStatus size="md" jid={counterpart.jid} inRoom />
		<div style={{flexGrow: 1, minWidth: 0}}>
			<div
				style={{maxWidth: "100%", overflowX: "hidden", textOverflow: "ellipsis"}}
				title={counterpart.jid.resource}
			>
				{counterpart.jid.resource}
			</div>
			{showType !== null &&
				<div class={styles.statusText}>
					{$t(presenceShowTypeNames[showType])}
				</div>
			}
		</div>
	</div>;
}
