import { css } from "@emotion/css";
import { JID, parse as parseJID } from "@xmpp/jid";
import { pushAtSortPosition } from "array-push-at-sort-position";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Fragment } from "preact/jsx-runtime";
import { defineMessage, MessageDescriptor, useIntl } from "react-intl";
import useLatestCallback from "use-latest-callback";
import { useLocation } from "wouter-preact";

import { useAppContext } from "../../..";
import AvatarWithStatus from "../../../components/AvatarWithStatus";
import ConfirmDialog from "../../../components/ConfirmDialog";
import ConfirmTaskDialog from "../../../components/ConfirmTaskDialog";
import { DataNonDoneView, ErrorAlert } from "../../../components/DataView";
import Menu, { MenuGroupLabel, MenuItem, MenuRadioGroup, MenuRadioItem } from "../../../components/Menu";
import MessageInput from "../../../components/MessageInput";
import MessageList, { LoadMoreTriggerer } from "../../../components/MessageList";
import TaskDialog from "../../../components/TaskDialog";
import TypingIndicator from "../../../components/TypingIndicator";
import { Message, MessageEvent, MessageRemovalEvent, messageRemovalIsAllowed, NotificationLevel, ResultSetInfo, useAccount, useConnectionContext } from "../../../util/connection";
import { msgActionDelete, presenceShowTypeNames } from "../../../util/langCommon";
import { getShowTypeForCounterpart } from "../../../util/statusUtil";
import { themeVars } from "../../../util/theme";
import { LoadState } from "../../../util/useData";
import useEventHandler from "../../../util/useEventHandler";
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
	const roomJID = decodeURIComponent(props.params.roomJID);

	return <ChatRoomPageInner roomJID={roomJID} key={roomJID} />;
}

function ChatRoomPageInner(props: {roomJID: string}) {
	const { $t } = useIntl();
	const [, navigate] = useLocation();

	const appCtx = useAppContext();
	const conn = useConnectionContext();
	const account = useAccount();
	const room = account.rooms.get(props.roomJID);
	const counterpart = account.counterparts.get(props.roomJID);

	const [messagesData, setMessagesData] = useState<{messages: Message[]; messageMap: Map<string, Message>}>({
		messages: [],
		messageMap: new Map(),
	});

	const unresolvedRemovalsRef = useRef<Map<string, MessageRemovalEvent>>(new Map());

	const onMessage = useLatestCallback((evt: MessageEvent) => {
		console.log("room page got message", evt);

		if(evt.message.room !== null && evt.message.room.toString() === props.roomJID) {
			setMessagesData(current => {
				if(evt.message.ids.some(x => current.messageMap.has(x.toString()))) {
					// we already have this message, ignore
					return current;
				}

				let removal = null;
				evt.message.ids.forEach(id => {
					const entry = unresolvedRemovalsRef.current.get(id.toString());
					if(typeof entry !== "undefined") {
						console.log("resolving unresolved removal", id);
						if(messageRemovalIsAllowed(evt.message, entry)) {
							removal = entry.removal;
							unresolvedRemovalsRef.current.delete(id.toString());
						}
					}
				});

				const message: Message = removal === null ?
					evt.message :
					{...evt.message, removal};

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
		if(evt.room === null || evt.room.toString() !== props.roomJID) return;

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

				unresolvedRemovalsRef.current.set(evt.target.toString(), evt);

				return current;
			}
		});
	});
	useEventHandler(conn, "messageRemove", onMessageRemove);

	const [pageState, setPageState] = useState<LoadState<ResultSetInfo | null> | null>(null);

	const nextPageRef = useRef<string | null>(null);

	const loadMore = useLatestCallback(() => {
		setPageState(LoadState.loading);

		conn.requestArchive(account.jid, room!.jid, {}, nextPageRef.current ?? undefined)
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
			const lastMessageID =
				lastMessage.ids.find(x => x.type === StanzaIDType.Stanza && x.by.equals(counterpart.jid));
			if(typeof lastMessageID !== "undefined" && counterpart.lastReadMessageID !== lastMessageID.id) {
				conn.markCounterpartAsRead.call(undefined, account.jid, counterpart.jid, lastMessageID.id, false);
			}
		}
	}, [account.jid, conn.markCounterpartAsRead, counterpart, messagesData.messages, pageState]);

	const submitMessage = useLatestCallback(async (newMessage: string) => {
		await conn.sendMessageToRoom(account.jid, room!.jid, {body: newMessage});
	});

	const onChangeComposing = useLatestCallback((composing: boolean) => {
		conn.setComposingToRoom(account.jid, parseJID(props.roomJID), composing);
	});

	useEffect(() => {
		return () => onChangeComposing(false);
	}, [onChangeComposing]);

	const leaveRoom = useLatestCallback(() => {
		appCtx.showDialog(
			<ConfirmDialog
				confirmText={$t({defaultMessage: "Leave"})}
				onConfirm={() => {
					const task = conn.leaveRoom.call(undefined, account.jid, room!.jid);

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

	const selfJIDInRoom = useMemo(() => {
		if(typeof room === "undefined") return undefined;

		return new JID(room.jid.local, room.jid.domain, room.nick ?? account.jid.local);
	}, [account.jid.local, room]);

	const usersTyping = useMemo(() => {
		if(typeof room === "undefined") return [];

		const result: JID[] = [];
		for(const [, value] of account.counterparts.entries()) {
			if(value.jid.bare().equals(room.jid)) {
				if(
					value.composingFrom === true &&
						// Don't show myself
						!value.jid.equals(selfJIDInRoom!)
				) {
					result.push(value.jid);
				}
			}
		}

		return result;
	}, [account.counterparts, room, selfJIDInRoom]);

	const selfCounterpartInRoom = typeof selfJIDInRoom === "undefined" ?
		undefined :
		account.counterparts.get(selfJIDInRoom.toString());

	const retractMessage = useCallback((messageID: string) => {
		appCtx.showDialog.call(
			undefined,
			<ConfirmTaskDialog
				submit={async () => {
					return conn.retractMessageToRoom.call(undefined, account.jid, parseJID(props.roomJID), messageID);
				}}
				confirmText={$t(msgActionDelete)}
			>
				{$t({defaultMessage: "Are you sure you want to delete this message?"})}
			</ConfirmTaskDialog>
		);
	}, [$t, account.jid, appCtx.showDialog, conn.retractMessageToRoom, props.roomJID]);

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
				const id = message.ids.find(x => x.type === StanzaIDType.Stanza && x.by.equals(room!.jid));
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

	const onChangeNotificationLevel = useCallback((newValue: NotificationLevel) => {
		console.log("onChangeNotificationLevel");

		conn.setRoomNotificationLevel.call(undefined, account.jid, parseJID(props.roomJID), newValue);
	}, [account.jid, conn.setRoomNotificationLevel, props.roomJID]);

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
					<div style={{textOverflow: "ellipsis", overflowX: "hidden"}}>{props.roomJID}</div>
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
						/>
						<div class={styles.messageInputArea}>
							<TypingIndicator usersTyping={usersTyping} inRoom={true} />
							<MessageInput
								submitMessage={submitMessage}
								autofocus
								onChangeComposing={onChangeComposing}
							/>
						</div>
					</>
			}
		</div>
		<MembersList roomJID={props.roomJID} />
	</Fragment>;
}

function MembersList(props: {roomJID: string}) {
	const { $t } = useIntl();

	const account = useAccount();

	const room = account.rooms.get(props.roomJID);

	if(typeof room === "undefined" || !room.connected) return null;

	const members = Array.from(
		account.counterparts.values()
			.filter(x => {
				return x.jid.bare().equals(room.jid) &&
					x.jid.resource !== "" &&
					x.presences !== null &&
					x.presences.size > 0;
			}),
	);

	return <SidebarSegment class={styles.membersList}>
		{
			members.map(member => {
				const showType = getShowTypeForCounterpart(member, true);

				return <div key={member.jid.resource} class={styles.membersListEntry}>
					<AvatarWithStatus size="md" jid={member.jid} inRoom />
					<div style={{flexGrow: 1}}>
						<div>{member.jid.resource}</div>
						{showType !== null &&
							<div class={styles.statusText}>
								{$t(presenceShowTypeNames[showType])}
							</div>
						}
					</div>
				</div>;
			})
		}
	</SidebarSegment>;
}

const NOTIFICATION_LEVEL_NAMES: Record<NotificationLevel.Never | NotificationLevel.Always, MessageDescriptor> = {
	[NotificationLevel.Never]: defineMessage({
		defaultMessage: "Never",
	}),
	[NotificationLevel.Always]: defineMessage({
		defaultMessage: "All Messages",
	}),
};
