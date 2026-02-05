import { css } from "@emotion/css";
import { computed, effect, signal, useComputed } from "@preact/signals";
import { Show, useLiveSignal } from "@preact/signals/utils";
import xid from "@xmpp/id";
import { JID, parse as parseJID } from "@xmpp/jid";
import { createRef } from "preact";
import { memo } from "preact/compat";
import { useCallback, useEffect, useMemo } from "preact/hooks";
import { Fragment } from "preact/jsx-runtime";
import { defineMessage, MessageDescriptor, useIntl } from "react-intl";

import { NOTIFICATION_LEVEL_NAMES, useAppContext } from "../../..";
import AvatarWithStatus from "../../../components/AvatarWithStatus";
import ConfirmDialog from "../../../components/ConfirmDialog";
import ConfirmTaskDialog from "../../../components/ConfirmTaskDialog";
import { DataNonDoneView, ErrorAlert, Loading } from "../../../components/DataView";
import EditRoomDialog from "../../../components/EditRoomDialog";
import Menu, { MenuGroupLabel, MenuItem, MenuRadioGroup, MenuRadioItem } from "../../../components/Menu";
import MessageInput from "../../../components/MessageInput";
import MessageList, { LoadMoreTriggerer, MessageSourceDialog, ReplyingIndicator } from "../../../components/MessageList";
import TaskDialog from "../../../components/TaskDialog";
import TypingIndicator from "../../../components/TypingIndicator";
import { Message, messageEditIsAllowed, MessageRemovalEvent, messageRemovalIsAllowed, NotificationLevel, ResultSetInfo, useAccountSig, useConnectionContext } from "../../../util/connection";
import createComponent from "../../../util/createComponent";
import getRoomUserColor from "../../../util/getRoomUserColor";
import { msgActionDelete, presenceShowTypeNames } from "../../../util/langCommon";
import { MessageCache } from "../../../util/messageCache";
import { signalMapKeysSigWhereValueMatches, useSignalMapKeysWhereValueMatches } from "../../../util/SignalMap";
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

		gap: ".25rem",
		paddingBlock: ".25rem",
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
	memberGroupLabel: css({
		fontWeight: "bold",
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

const ChatRoomPageInner = createComponent(
	(props: {roomJID: JID}) => {
		const intlSig = useLiveSignal(useIntl());

		const appCtxSig = useLiveSignal(useAppContext());

		const accountSig = useAccountSig();
		const accountJID = useComputed(() => accountSig.value.jid).value;

		const conn = useConnectionContext();

		return useMemo(() => ({
			intlSig,
			appCtxSig,
			accountSig,
			accountJID,
			roomJID: props.roomJID,
			conn,
		}), [intlSig, appCtxSig, accountSig, accountJID, props.roomJID, conn]);
	},
	({intlSig, appCtxSig, accountSig, accountJID, roomJID, conn}) => {
		const roomSig = computed(() => accountSig.value.rooms.get(roomJID.toString()));

		const inputRef = createRef<HTMLTextAreaElement>();

		const replyingToSig = signal<Message | null>(null);

		function cancelReply() {
			replyingToSig.value = null;

			inputRef.current!.focus();
		}

		const pageStateSig = signal<null | LoadState<ResultSetInfo | null>>(null);

		let nextPage: string | null = null;

		function loadMore() {
			pageStateSig.value = LoadState.loading;

			conn.requestArchive(accountJID, roomSig.value!.jid, {}, nextPage ?? undefined)
				.then(value => {
					nextPage = value === null ? null : value.firstItem;
					pageStateSig.value = LoadState.wrapValue(value);
				})
				.catch(err => {
					pageStateSig.value = LoadState.wrapError(err);
				});
		}

		effect(() => {
			if(roomSig.value?.connected === true && pageStateSig.value === null) loadMore();
		});

		const allUsersTypingSig = signalMapKeysSigWhereValueMatches(accountSig.value.counterparts, value => {
			return value.jid.bare().equals(roomJID) && value.composingFrom === true;
		});

		const counterpartSig = computed(() => accountSig.value.counterparts.get(roomJID.toString()));

		const msgCache = new MessageCache({type: "room", jid: roomJID}, conn);

		const selfJIDInRoomSig = computed(() => {
			const room = roomSig.value;
			if(typeof room === "undefined") return undefined;

			return new JID(room.jid.local, room.jid.domain, room.nick ?? accountJID.local);
		});

		const usersTypingSig = computed(() => {
			const room = roomSig.value;

			if(typeof room === "undefined") return [];

			return allUsersTypingSig.value.map(parseJID).filter(x => !x.equals(selfJIDInRoomSig.value!));
		});

		const selfCounterpartInRoomSig = computed(() => {
			const selfJIDInRoom = selfJIDInRoomSig.value;

			return typeof selfJIDInRoom === "undefined" ?
				undefined :
				accountSig.value.counterparts.get(selfJIDInRoom.toString());
		});

		const selfOccupantIDSig = useComputed(() => {
			const selfCounterpartInRoom = selfCounterpartInRoomSig.value;

			return selfCounterpartInRoom?.occupantID ?? undefined;
		});

		const actionFromSig = computed(() => {
			if(typeof selfJIDInRoomSig.value === "undefined") return undefined;

			return {
				jid: selfJIDInRoomSig.value,
				occupantID: selfOccupantIDSig.value,
			} satisfies MessageRemovalEvent["from"];
		});

		const canModerateSig = computed(() => {
			const room = roomSig.value;
			const selfCounterpartInRoom = selfCounterpartInRoomSig.value;

			return typeof room !== "undefined" &&
				LoadState.ifDone(room.infoState, info => info.features.has("urn:xmpp:message-moderate:1")) &&
				typeof selfCounterpartInRoom?.role === "string" &&
				checkPrivilegeForRole(MUCPrivilege.ModerateMessages, selfCounterpartInRoom.role);
		});

		function retractMessage(messageID: string) {
			const appCtx = appCtxSig.value;
			const { $t } = intlSig.value;

			appCtx.showDialog.call(
				undefined,
				<ConfirmTaskDialog
					submit={async () => {
						return conn.retractMessageToRoom.call(undefined, accountJID, roomJID, messageID);
					}}
					confirmText={$t(msgActionDelete)}
				>
					{$t({defaultMessage: "Are you sure you want to delete this message?"})}
				</ConfirmTaskDialog>
			);
		}

		function moderateMessage(messageID: string) {
			const appCtx = appCtxSig.value;
			const { $t } = intlSig.value;

			appCtx.showDialog.call(
				undefined,
				<ConfirmTaskDialog
					submit={async () => {
						return conn.moderateMessageToRoom.call(undefined, accountJID, roomJID, messageID);
					}}
					confirmText={$t(msgActionDelete)}
				>
					{$t({defaultMessage: "Are you sure you want to delete this message?"})}
				</ConfirmTaskDialog>
			);
		}

		function showSourceDialog(message: Message) {
			const appCtx = appCtxSig.value;

			appCtx.showDialog.call(undefined, <MessageSourceDialog message={message} />);
		}

		function renderMenu(message: Message, setMenuOpen: (value: boolean) => void) {
			const { $t } = intlSig.value;

			const actionFrom = actionFromSig.value;
			const canModerate = canModerateSig.value;

			const items = [];

			{
				const id = message.ids.find(x => {
					return x.type === StanzaIDType.Stanza && x.by !== null && x.by.equals(roomJID);
				});

				if(typeof id !== "undefined") {
					if(
						typeof actionFrom !== "undefined" && messageRemovalIsAllowed(
							message,
							{
								from: actionFrom,
								removal: {type: "retract"},
								room: roomJID,
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
		}

		function canSend() {
			const room = roomSig.value;

			return (
				typeof room === "undefined" ||
					!room.connected ||
					typeof selfCounterpartInRoomSig.value === "undefined" ||
					selfCounterpartInRoomSig.value.role === null
			) ?
				null :
				checkPrivilegeForRole(MUCPrivilege.SendMessagesToAll, selfCounterpartInRoomSig.value.role);
		}

		function canEdit(message: Message) {
			const actionFrom = actionFromSig.value;

			if(canSend() !== true) return false;

			if(typeof actionFrom !== "undefined") {
				if(
					messageEditIsAllowed(
						message,
						{
							from: actionFrom,
							room: roomJID,
						},
					)
				) {
					return true;
				}
			}

			return false;
		}

		function startReply(message: Message) {
			replyingToSig.value = message;

			inputRef.current!.focus();
		}

		const pendingMessagesSig = signal<Array<
			Pick<Message, "content" | "timestamp" | "localID">
		>>([]);

		function submitMessage(newMessage: string, options?: {replaces?: string}) {
			const room = roomSig.value;

			const tmpID = xid();

			pendingMessagesSig.value = [
				...pendingMessagesSig.value,
				{localID: tmpID, timestamp: new Date(), content: [{type: "markdown", content: newMessage}]},
			];

			(async () => {
				try {
					await conn.sendMessageToRoom(
						accountJID,
						room!.jid,
						{body: newMessage},
						{replyingTo: replyingToSig.value ?? undefined, ...options},
					);
				}
				finally {
					pendingMessagesSig.value = pendingMessagesSig.value.filter(x => x.localID !== tmpID);
				}
			})();

			replyingToSig.value = null;
		}

		async function submitEdit(newMessage: string, replaces: string) {
			return submitMessage(newMessage, {replaces});
		}

		async function submitReactions(reactions: string[], message: Message) {
			const id = message.ids.find(x => x.type === StanzaIDType.Stanza && x.by?.equals(roomJID));
			if(typeof id === "undefined") throw new Error("Cannot react to this message");

			await conn.sendMessageReactionsToRoom.call(
				undefined,
				accountJID,
				roomJID,
				id.id,
				reactions,
			);
		}

		function onChangeComposing(composing: boolean) {
			conn.setComposingToRoom(accountJID, roomJID, composing);
		}

		effect(() => {
			return () => onChangeComposing(false);
		});

		function editRoom() {
			appCtxSig.value.showDialog(
				<EditRoomDialog room={roomJID} />
			);
		}

		function leaveRoom() {
			const { $t } = intlSig.value;

			appCtxSig.value.showDialog(
				<ConfirmDialog
					confirmText={$t({defaultMessage: "Leave"})}
					onConfirm={() => {
						const task = conn.leaveRoom.call(undefined, accountJID, roomJID);

						appCtxSig.value.showDialog(<TaskDialog task={task}>{$t({defaultMessage: "Leaving…"})}</TaskDialog>);

						task.then(() => appCtxSig.value.navigate("~/"));
					}}
				>
					<p>
						{$t({
							defaultMessage: "Are you sure you want to leave {room}?",
						}, {room: <em>{roomJID.toString()}</em>})}
					</p>
				</ConfirmDialog>
			);
		}

		function onChangeNotificationLevel(newValue: NotificationLevel) {
			console.log("onChangeNotificationLevel");

			conn.setRoomNotificationLevel.call(undefined, accountJID, roomJID, newValue);
		}

		function onInputKeyDown(evt: KeyboardEvent) {
			if(evt.code === "Escape") {
				if(replyingToSig.value !== null) {
					evt.preventDefault();
					cancelReply();
				}
			}
		}

		effect(() => {
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
					conn.markCounterpartAsRead(accountJID, counterpart.jid, lastMessageID.id, false);
				}
			}
		});

		const loaderContentSig = useComputed(() => {
			const { $t } = intlSig.value;

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

		// We want to avoid rendering some components initially to make navigation feel faster
		const initedSig = signal(false);

		return props => {
			const { $t } = useIntl();

			const room = roomSig.value;

			console.log("rendering page", room);

			useEffect(() => {
				initedSig.value = true;
			}, []);

			return <Fragment>
				<div class={styles.page}>
					<div class={styles.header}>
						<div class={styles.headerStart}>
							{
								typeof room !== "undefined" &&
									LoadState.ifDone(room.infoState, disco => <h1>{disco.name}</h1>, () => null)
							}
							<div style={{textOverflow: "ellipsis", overflowX: "hidden"}}>{roomJID.toString()}</div>
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
								<Show when={() => selfCounterpartInRoomSig.value?.affiliation === "owner"}>
									<MenuItem onClick={editRoom}>{$t({defaultMessage: "Channel Settings"})}</MenuItem>
								</Show>
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
									pendingMessages={pendingMessagesSig}
									loaderContent={loaderContentSig}
									renderMenu={renderMenu}
									submitEdit={submitEdit}
									canEdit={canEdit}
									submitReactions={submitReactions}
									startReply={startReply}
								/>
								<div class={styles.messageInputArea} onKeyDown={onInputKeyDown}>
									<TypingIndicator usersTyping={usersTypingSig} inRoom={true} />
									<Show when={replyingToSig}>
										{replyingTo => <ReplyingIndicator message={replyingTo} cancelReply={cancelReply} />}
									</Show>
									{
										canSend() === null ?
											(
												room?.connected === false ?
													<p>{$t({defaultMessage: "Connecting…"})}</p> :
													<Loading />
											) :
											(
												canSend() ?
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
				<Show when={initedSig} fallback={<SidebarSegment class={styles.membersList} />}>
					<MembersList roomJID={props.roomJID} />
				</Show>
			</Fragment>;
		};
	},
);

type MemberGroup = "owner" | "admin" | "other";

const MEMBER_GROUP_NAMES: Record<MemberGroup, MessageDescriptor> = {
	owner: defineMessage({defaultMessage: "Owner", description: "Room affiliation"}),
	admin: defineMessage({defaultMessage: "Admin", description: "Room affiliation"}),
	other: defineMessage({defaultMessage: "Other", description: "Room affiliation"}),
};

function MembersList(props: {roomJID: JID}) {
	const { $t } = useIntl();

	const accountSig = useAccountSig();

	const room = useComputed(() => accountSig.value.rooms.getSignal(props.roomJID.toString())).value.value;

	const memberKeysSig = useSignalMapKeysWhereValueMatches(accountSig.value.counterparts, useCallback(x => {
		return x.jid.bare().equals(props.roomJID) &&
			x.jid.resource !== "" &&
			x.presences !== null &&
			x.presences.size > 0;
	}, [props.roomJID]), false);

	const membersByGroupSig = useComputed(() => {
		const result = new Map<MemberGroup, JID[]>();

		memberKeysSig.value.forEach(key => {
			const counterpart = accountSig.value.counterparts.get(key)!;

			let group: MemberGroup;
			if(counterpart.affiliation === "owner") group = "owner";
			else if(counterpart.affiliation === "admin") group = "admin";
			else group = "other";

			let list = result.get(group);
			if(typeof list === "undefined") {
				list = [];
				result.set(group, list);
			}

			list.push(counterpart.jid);
		});

		result.forEach(list => list.sort((a, b) => a.toString().localeCompare(b.toString())));

		return result;
	});

	if(typeof room === "undefined" || !room.connected) return null;

	return <SidebarSegment class={styles.membersList}>
		{Object.keys(MEMBER_GROUP_NAMES).map(group_ => {
			const group = group_ as keyof typeof MEMBER_GROUP_NAMES;

			if(membersByGroupSig.value.has(group)) {
				return <div key={group}>
					<div class={styles.memberGroupLabel}>{$t(MEMBER_GROUP_NAMES[group])}</div>
					{membersByGroupSig.value.get(group)!.map(jid => <MembersListEntry key={jid.toString()} jid={jid} />)}
				</div>;
			}
		})}
	</SidebarSegment>;
}

const MembersListEntry = memo(function MembersListEntry(props: {jid: JID}) {
	const { $t } = useIntl();

	const accountSig = useAccountSig();

	const counterpart = accountSig.value.counterparts.get(props.jid.toString())!;

	const showType = getShowTypeForCounterpart(counterpart, true);

	return <div key={counterpart.jid.resource} class={styles.membersListEntry}>
		<AvatarWithStatus size="md" jid={counterpart.jid} inRoom />
		<div style={{flexGrow: 1, minWidth: 0}}>
			<div
				style={{
					maxWidth: "100%",
					overflowX: "hidden",
					textOverflow: "ellipsis",
					color: getRoomUserColor(counterpart),
				}}
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
});
