import { css } from "@emotion/css";
import { useEffect, useRef, useState } from "preact/hooks";
import { Message, MessageEvent, ResultSetInfo, useAppContext } from "../..";
import useLatestCallback from "use-latest-callback";
import { LoadState } from "../../util/useData";
import { DataNonDoneView } from "../../components/DataView";
import { pushAtSortPosition } from "array-push-at-sort-position";
import MessageList, { LoadMoreTriggerer } from "../../components/MessageList";
import MessageInput from "../../components/MessageInput";

const styles = {
	page: css({
		flexGrow: 1,
		marginInlineStart: ".5rem",

		display: "flex",
		flexDirection: "column",
	}),
};

export default function DirectChatPage(props: {params: {counterpartJID: string}}) {
	const counterpartJID = decodeURIComponent(props.params.counterpartJID);

	return <DirectChatPageInner counterpartJID={counterpartJID} key={counterpartJID} />;
}

function DirectChatPageInner(props: {counterpartJID: string}) {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0]!;
	const counterpart = account.counterparts.get(props.counterpartJID);

	const [messagesData, setMessagesData] = useState<{messages: Message[]; messageMap: Map<string, Message>}>({
		messages: [],
		messageMap: new Map(),
	});

	const onMessage = useLatestCallback((evt: MessageEvent) => {
		if(
			evt.message.room === null && (
				evt.message.from.bare().toString() === props.counterpartJID ||
					evt.message.to?.bare().toString() === props.counterpartJID
			)
		) {
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

		appCtx.requestArchive(account.jid, account.jid, {with: counterpart!.jid}, nextPageRef.current ?? undefined)
			.then(value => {
				nextPageRef.current = value === null ? null : value.firstItem;
				setPageState(LoadState.wrapValue(value));
			})
			.catch(err => {
				setPageState(LoadState.wrapError(err));
			});
	});

	useEffect(() => {
		if(typeof counterpart !== "undefined" && pageState === null) {
			loadMore();
		}
	}, [pageState, loadMore, account.connected, counterpart]);

	const submitMessage = useLatestCallback(async (newMessage: string) => {
		await appCtx.sendMessageToCounterpart(account.jid, counterpart!.jid, {body: newMessage});
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
			{props.counterpartJID}
		</h1>
		<MessageList
			messages={messagesData.messages}
			loaderContent={loaderContent}
		/>
		<MessageInput submitMessage={submitMessage} autofocus />
	</div>;
}

