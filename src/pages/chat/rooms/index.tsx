import { css } from "@emotion/css";
import { useComputed } from "@preact/signals";
import { JID, parse as parseJID } from "@xmpp/jid";
import { pushAtSortPosition } from "array-push-at-sort-position";
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
import MessageList, { LoadMoreTriggerer } from "../../../components/MessageList";
import TaskDialog from "../../../components/TaskDialog";
import TypingIndicator from "../../../components/TypingIndicator";
import { Message, MessageEditEvent, messageEditIsAllowed, MessageEvent, MessageReactionsChangeEvent, MessageRemovalEvent, messageRemovalIsAllowed, NotificationLevel, ResultSetInfo, useAccountSig, useConnectionContext } from "../../../util/connection";
import { msgActionDelete, presenceShowTypeNames } from "../../../util/langCommon";
import { useSignalMapKeysWhereValueMatches } from "../../../util/SignalMap";
import { getShowTypeForCounterpart } from "../../../util/statusUtil";
import { themeVars } from "../../../util/theme";
import { LoadState } from "../../../util/useData";
import useEventHandler from "../../../util/useEventHandler";
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

	const counterpart = useComputed(() => accountSig.value.counterparts.getSignal(props.roomJID.toString())).value.value;

	const [messagesData, setMessagesData] = useState<{messages: Message[]; messageMap: Map<string, Message>}>({
		messages: [],
		messageMap: new Map(),
	});

	const unresolvedFastensRef = useRef<Map<string,
		Array<
			{type: "messageRemove"; event: MessageRemovalEvent} |
				{type: "messageEdit"; event: MessageEditEvent} |
				{type: "messageReactionsChange"; event: MessageReactionsChangeEvent}
		>
	>>(new Map());

	const onMessage = useLatestCallback((evt: MessageEvent) => {
		console.log("room page got message", evt);

		if(evt.message.room !== null && evt.message.room.equals(props.roomJID)) {
			setMessagesData(current => {
				if(evt.message.ids.some(x => current.messageMap.has(x.toString()))) {
					// we already have this message, ignore
					return current;
				}

				let message = evt.message;
				evt.message.ids.forEach(id => {
					const list = unresolvedFastensRef.current.get(id.toString());
					if(typeof list !== "undefined") {
						list.forEach(entry => {
							console.log("resolving unresolved fasten", id, entry);
							if(entry.type === "messageRemove") {
								if(messageRemovalIsAllowed(evt.message, entry.event)) {
									message = {...message, removal: entry.event.removal};
								}
							}
							else if(entry.type === "messageEdit") {
								if(
									messageEditIsAllowed(evt.message, entry.event) && (
										message.editedAt === null ||
											message.editedAt.getTime() < entry.event.edit.timestamp.getTime()
									)
								) {
									message = {
										...message,
										content: entry.event.edit.content,
										editedAt: entry.event.edit.timestamp,
									};
								}
							}
							else if(entry.type === "messageReactionsChange") {
								const key = entry.event.from.jid.toString() + "/" + (
									typeof entry.event.from.occupantID === "undefined" ?
										"" :
										encodeURIComponent(entry.event.from.occupantID)
								);
								const reactionsEntry = message.reactions.get(key);

								if(
									typeof reactionsEntry === "undefined" ||
										reactionsEntry.timestamp.getTime() < entry.event.reactions.timestamp.getTime()
								) {
									const newReactions = new Map(message.reactions);
									newReactions.set(key, entry.event.reactions);

									message = {
										...message,
										reactions: newReactions,
									};
								}
							}
						});
						unresolvedFastensRef.current.delete(id.toString());
					}
				});

				const newMap = new Map(current.messageMap);
				evt.message.ids.forEach(id => {
					newMap.set(id.toString(), message);
				});

				const newMessages = current.messages.slice();
				pushAtSortPosition(
					newMessages,
					message,
					(a, b) => (a.timestamp - b.timestamp) as (0 | 1 | -1), // it's not but should be fine
					0,
				);

				return {
					messages: newMessages,
					messageMap: newMap,
				};
			});
		}
	});

	useEventHandler(conn, "message", onMessage);

	const onMessageRemove = useLatestCallback((evt: MessageRemovalEvent) => {
		if(evt.room === null || !evt.room.equals(props.roomJID)) return;

		setMessagesData(current => {
			const newMessageMap = new Map(current.messageMap);

			let anyHit = false;

			const newMessages = current.messages.map(message => {
				if(message.ids.some(x => x.equals(evt.target))) {
					if(messageRemovalIsAllowed(message, evt)) {
						const newValue: Message = {
							...message,
							removal: evt.removal,
						};

						message.ids.forEach(id => {
							newMessageMap.set(id.toString(), newValue);
						});

						anyHit = true;

						return newValue;
					}
				}

				return message;
			});

			if(anyHit) {
				return {messages: newMessages, messageMap: newMessageMap};
			}
			else {
				console.log("got unresolved removal", evt);

				let list = unresolvedFastensRef.current.get(evt.target.toString());
				if(typeof list === "undefined") {
					list = [];
					unresolvedFastensRef.current.set(evt.target.toString(), list);
				}
				list.push({type: "messageRemove", event: evt});

				return current;
			}
		});
	});
	useEventHandler(conn, "messageRemove", onMessageRemove);

	const onMessageEdit = useLatestCallback((evt: MessageEditEvent) => {
		if(evt.room === null || !evt.room.equals(props.roomJID)) return;

		setMessagesData(current => {
			const newMessageMap = new Map(current.messageMap);

			let anyHit = false;

			const newMessages = current.messages.map(message => {
				if(message.ids.some(x => x.equals(evt.target))) {
					if(messageEditIsAllowed(message, evt) && (
						message.editedAt === null ||
							message.editedAt.getTime() < evt.edit.timestamp.getTime()
					)) {
						const newValue: Message = {
							...message,
							content: evt.edit.content,
							editedAt: evt.edit.timestamp,
						};

						message.ids.forEach(id => {
							newMessageMap.set(id.toString(), newValue);
						});

						anyHit = true;

						return newValue;
					}
				}

				return message;
			});

			if(anyHit) {
				return {messages: newMessages, messageMap: newMessageMap};
			}
			else {
				console.log("got unresolved edit", evt);

				let list = unresolvedFastensRef.current.get(evt.target.toString());
				if(typeof list === "undefined") {
					list = [];
					unresolvedFastensRef.current.set(evt.target.toString(), list);
				}
				list.push({type: "messageEdit", event: evt});

				return current;
			}
		});
	});
	useEventHandler(conn, "messageEdit", onMessageEdit);

	const onMessageReactionsChange = useLatestCallback((evt: MessageReactionsChangeEvent) => {
		if(evt.room === null || !evt.room.equals(props.roomJID)) return;

		setMessagesData(current => {
			const newMessageMap = new Map(current.messageMap);

			let anyHit = false;

			const newMessages = current.messages.map(message => {
				if(message.ids.some(x => x.equals(evt.target))) {
					const key = evt.from.jid.toString() + "/" +
						(typeof evt.from.occupantID === "undefined" ? "" : encodeURIComponent(evt.from.occupantID));
					const entry = message.reactions.get(key);

					if(typeof entry === "undefined" || entry.timestamp.getTime() < evt.reactions.timestamp.getTime()) {
						const newReactions = new Map(message.reactions);
						newReactions.set(key, evt.reactions);

						const newValue: Message = {
							...message,
							reactions: newReactions,
						};

						message.ids.forEach(id => {
							newMessageMap.set(id.toString(), newValue);
						});

						anyHit = true;

						return newValue;
					}
				}

				return message;
			});

			if(anyHit) {
				return {messages: newMessages, messageMap: newMessageMap};
			}
			else {
				let list = unresolvedFastensRef.current.get(evt.target.toString());
				if(typeof list === "undefined") {
					list = [];
					unresolvedFastensRef.current.set(evt.target.toString(), list);
				}
				list.push({type: "messageReactionsChange", event: evt});

				return current;
			}
		});
	});
	useEventHandler(conn, "messageReactionsChange", onMessageReactionsChange);

	const [pageState, setPageState] = useState<LoadState<ResultSetInfo | null> | null>(null);

	const nextPageRef = useRef<string | null>(null);

	const loadMore = useLatestCallback(() => {
		setPageState(LoadState.loading);

		conn.requestArchive(accountJID, room!.jid, {}, nextPageRef.current ?? undefined)
			.then(value => {
				nextPageRef.current = value === null ? null : value.firstItem;
				setPageState(LoadState.wrapValue(value));
			})
			.catch(err => {
				setPageState(LoadState.wrapError(err));
			});
	});

	useEffect(() => {
		if(room?.connected === true && pageState === null) {
			loadMore();
		}
	}, [room?.connected, pageState, loadMore]);

	useEffect(() => {
		// TODO skip marking when scrolled up
		if(
			pageState !== null &&
				pageState.state === "done" &&
				messagesData.messages.length > 0 &&
				typeof counterpart !== "undefined"
		) {
			const lastMessage = messagesData.messages[messagesData.messages.length - 1];
			const lastMessageID = lastMessage.ids.find(x => {
				return x.type === StanzaIDType.Stanza && x.by !== null && x.by.equals(counterpart.jid);
			});
			if(typeof lastMessageID !== "undefined" && counterpart.lastReadMessageID !== lastMessageID.id) {
				conn.markCounterpartAsRead.call(undefined, accountJID, counterpart.jid, lastMessageID.id, false);
			}
		}
	}, [accountJID, conn.markCounterpartAsRead, counterpart, messagesData.messages, pageState]);

	const submitMessage = useLatestCallback(async (newMessage: string, options?: {replaces?: string}) => {
		await conn.sendMessageToRoom(accountJID, room!.jid, {body: newMessage}, options);
	});

	const submitEdit = useLatestCallback(async (newMessage: string, replaces: string) => {
		return submitMessage(newMessage, {replaces});
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

	const selfCounterpartInRoom = useComputed(() => {
		const selfJIDInRoom = selfJIDInRoomSig.value;

		return typeof selfJIDInRoom === "undefined" ?
			undefined :
			accountSig.value.counterparts.get(selfJIDInRoom.toString());
	}).value;

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

	const renderMenu = useCallback((message: Message) => {
		const items = [];

		if(typeof selfCounterpartInRoom !== "undefined") {
			if(
				messageRemovalIsAllowed(
					message,
					{
						from: {
							jid: selfCounterpartInRoom.jid,
							occupantID: selfCounterpartInRoom.occupantID === null ?
								undefined :
								selfCounterpartInRoom.occupantID,
						},
						removal: {type: "retract"},
						room: room!.jid,
					},
				)
			) {
				const id = message.ids.find(x => {
					return x.type === StanzaIDType.Stanza && x.by !== null && x.by.equals(room!.jid);
				});
				if(typeof id !== "undefined") {
					items.push(
						<MenuItem onClick={retractMessage.bind(undefined, id.id)}>{$t({defaultMessage: "Delete Message"})}</MenuItem>
					);
				}
			}
		}

		if(items.length < 1) return null;
		else {
			return <Menu>{items}</Menu>;
		}
	}, [$t, retractMessage, room, selfCounterpartInRoom]);

	const canEdit = useCallback((message: Message) => {
		if(canSend !== true) return false;

		if(typeof selfCounterpartInRoom !== "undefined") {
			if(
				messageEditIsAllowed(
					message,
					{
						from: {
							jid: selfCounterpartInRoom.jid,
							occupantID: selfCounterpartInRoom.occupantID === null ?
								undefined :
								selfCounterpartInRoom.occupantID,
						},
						room: room!.jid,
					},
				)
			) {
				return true;
			}
		}

		return false;
	}, [canSend, room, selfCounterpartInRoom]);

	const onChangeNotificationLevel = useCallback((newValue: NotificationLevel) => {
		console.log("onChangeNotificationLevel");

		conn.setRoomNotificationLevel.call(undefined, accountJID, props.roomJID, newValue);
	}, [accountJID, conn.setRoomNotificationLevel, props.roomJID]);

	const loaderContent = pageState === null ?
		<p>{$t({defaultMessage: "Connecting…"})}</p> :
		LoadState.ifDone(
			pageState,
			info => info === null ?
				<p>{$t({defaultMessage: "No more messages known."})}</p> :
				<LoadMoreTriggerer loadMore={loadMore} />,
			pageState => <DataNonDoneView state={pageState} />,
		);

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
							messages={messagesData.messages}
							loaderContent={loaderContent}
							renderMenu={renderMenu}
							submitEdit={submitEdit}
							canEdit={canEdit}
						/>
						<div class={styles.messageInputArea}>
							<TypingIndicator usersTyping={usersTypingSig} inRoom={true} />
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
		<div style={{flexGrow: 1}}>
			<div>{counterpart.jid.resource}</div>
			{showType !== null &&
				<div class={styles.statusText}>
					{$t(presenceShowTypeNames[showType])}
				</div>
			}
		</div>
	</div>;
}
