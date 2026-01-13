import { css } from "@emotion/css";
import { JID, parse as parseJID } from "@xmpp/jid";
import { pushAtSortPosition } from "array-push-at-sort-position";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Fragment } from "preact/jsx-runtime";
import useLatestCallback from "use-latest-callback";
import { useLocation } from "wouter-preact";

import { useAppContext } from "../../..";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { DataNonDoneView } from "../../../components/DataView";
import Menu, { MenuItem } from "../../../components/Menu";
import MessageInput from "../../../components/MessageInput";
import MessageList, { LoadMoreTriggerer } from "../../../components/MessageList";
import TaskDialog from "../../../components/TaskDialog";
import TypingIndicator from "../../../components/TypingIndicator";
import { Message, MessageEvent, ResultSetInfo, useAccount, useConnectionContext } from "../../../util/connection";
import { LoadState } from "../../../util/useData";
import { SpaceItemsList } from "..";

const styles = {
	page: css({
		flexGrow: 1,
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

		"> h1": {
			margin: 0,
		},
	}),
};

export default function ChatRoomPage(props: {params: {roomJID: string}}) {
	const roomJID = decodeURIComponent(props.params.roomJID);

	return <ChatRoomPageInner roomJID={roomJID} key={roomJID} />;
}

function ChatRoomPageInner(props: {roomJID: string}) {
	const appCtx = useAppContext();
	const conn = useConnectionContext();
	const account = useAccount();
	const room = account.rooms.get(props.roomJID);
	const counterpart = account.counterparts.get(props.roomJID);

	const [, navigate] = useLocation();

	const [messagesData, setMessagesData] = useState<{messages: Message[]; messageMap: Map<string, Message>}>({
		messages: [],
		messageMap: new Map(),
	});

	const onMessage = useLatestCallback((evt: MessageEvent) => {
		console.log("room page got message", evt);

		if(evt.message.room !== null && evt.message.room.toString() === props.roomJID) {
			setMessagesData(current => {
				if(evt.message.id !== null && current.messageMap.has(evt.message.id)) {
					// we already have this message, ignore
					return current;
				}

				let newMap;
				if(evt.message.id === null) newMap = current.messageMap;
				else {
					newMap = new Map(current.messageMap);
					newMap.set(evt.message.id, evt.message);
				}

				const newMessages = current.messages.slice();
				pushAtSortPosition(
					newMessages,
					evt.message,
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

	useEffect(() => {
		conn.addEventListener.call(undefined, "message", onMessage);

		return () => {
			conn.removeEventListener.call(undefined, "message", onMessage);
		};
	}, [onMessage, conn.addEventListener, conn.removeEventListener]);

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
			if(lastMessage.id !== null && counterpart.lastReadMessageID !== lastMessage.id) {
				conn.markCounterpartAsRead.call(undefined, account.jid, counterpart.jid, lastMessage.id, false);
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
				confirmText="Leave"
				onConfirm={() => {
					const task = conn.leaveRoom.call(undefined, account.jid, room!.jid);

					appCtx.showDialog(<TaskDialog task={task}>Leaving room…</TaskDialog>);

					task.then(() => navigate("~/"));
				}}
			>
				<p>Are you sure you want to leave <em>{room!.jid.toString()}</em>?</p>
			</ConfirmDialog>
		);
	});

	const usersTyping = useMemo(() => {
		if(typeof room === "undefined") return [];

		const result: JID[] = [];
		for(const [, value] of account.counterparts.entries()) {
			if(value.jid.bare().equals(room.jid)) {
				if(
					value.composingFrom === true &&
						// Don't show myself
						!value.jid.equals(new JID(room.jid.local, room.jid.domain, room.nick ?? account.jid.local))
				) {
					result.push(value.jid);
				}
			}
		}

		return result;
	}, [account.counterparts, account.jid.local, room]);

	const loaderContent = pageState === null ?
		<p>Connecting…</p> :
		LoadState.ifDone(
			pageState,
			info => info === null ? <p>No more messages known.</p> : <LoadMoreTriggerer loadMore={loadMore} />,
			pageState => <DataNonDoneView state={pageState} />,
		);

	return <Fragment>
		<SpaceItemsList />
		<div class={styles.page}>
			<div class={styles.header}>
				<div class={styles.headerStart}>
					{
						typeof room !== "undefined" &&
							LoadState.ifDone(room.infoState, disco => <h1>{disco.name}</h1>, () => null)
					}
					<div>{props.roomJID}</div>
				</div>
				<div>
					<Menu>
						<MenuItem onClick={leaveRoom}>Leave Room</MenuItem>
					</Menu>
				</div>
			</div>
			<MessageList
				messages={messagesData.messages}
				loaderContent={loaderContent}
			/>
			<TypingIndicator usersTyping={usersTyping} />
			<MessageInput submitMessage={submitMessage} autofocus onChangeComposing={onChangeComposing} />
		</div>
	</Fragment>;
}

