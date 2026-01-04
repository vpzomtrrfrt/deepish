import { css } from "@emotion/css";
import { useEffect, useRef, useState } from "preact/hooks";
import { Message, MessageEvent, ResultSetInfo, useAppContext } from "../../..";
import useLatestCallback from "use-latest-callback";
import { LoadState } from "../../../util/useData";
import { DataNonDoneView } from "../../../components/DataView";
import { pushAtSortPosition } from "array-push-at-sort-position";
import MessageList, { LoadMoreTriggerer } from "../../../components/MessageList";
import MessageInput from "../../../components/MessageInput";

const styles = {
	page: css({
		flexGrow: 1,
		marginInlineStart: ".5rem",

		display: "flex",
		flexDirection: "column",
	}),
};

export default function ChatRoomPage(props: {params: {roomJID: string}}) {
	const roomJID = decodeURIComponent(props.params.roomJID);

	return <ChatRoomPageInner roomJID={roomJID} key={roomJID} />;
}

function ChatRoomPageInner(props: {roomJID: string}) {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0]!;
	const room = account.rooms.get(props.roomJID);

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
		appCtx.addEventListener.call(undefined, "message", onMessage);

		return () => {
			appCtx.removeEventListener.call(undefined, "message", onMessage);
		};
	}, [onMessage, appCtx.addEventListener, appCtx.removeEventListener]);

	const [pageState, setPageState] = useState<LoadState<ResultSetInfo | null> | null>(null);

	const nextPageRef = useRef<string | null>(null);

	const loadMore = useLatestCallback(() => {
		setPageState(LoadState.loading);

		appCtx.requestArchive(account.jid, room!.jid, {}, nextPageRef.current ?? undefined)
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

	const submitMessage = useLatestCallback(async (newMessage: string) => {
		await appCtx.sendMessageToRoom(account.jid, room!.jid, {body: newMessage});
	});

	const loaderContent = pageState === null ?
		<p>Connecting…</p> :
		LoadState.ifDone(
			pageState,
			info => info === null ? <p>No more messages known.</p> : <LoadMoreTriggerer loadMore={loadMore} />,
			pageState => <DataNonDoneView state={pageState} />,
		);

	return <div class={styles.page}>
		<h1>
			{
				(
					typeof room === "undefined" ?
						null :
						LoadState.ifDone(room.infoState, disco => disco.name, () => null)
				) ?? props.roomJID
			}
		</h1>
		<MessageList
			messages={messagesData.messages}
			loaderContent={loaderContent}
		/>
		<MessageInput submitMessage={submitMessage} autofocus />
	</div>;
}

