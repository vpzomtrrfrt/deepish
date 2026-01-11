import { css, cx } from "@emotion/css";
import { JID, parse as parseJID } from "@xmpp/jid";
import { pushAtSortPosition } from "array-push-at-sort-position";
import { useEffect, useRef, useState } from "preact/hooks";
import useLatestCallback from "use-latest-callback";

import { DataNonDoneView } from "../../components/DataView";
import MessageInput from "../../components/MessageInput";
import MessageList, { LoadMoreTriggerer } from "../../components/MessageList";
import { Message, MessageEvent, ResultSetInfo, useAccount, useConnectionContext } from "../../util/connection";
import { getNickForCounterpart } from "../../util/profileUtil";
import { themeVars } from "../../util/theme";
import { LoadState } from "../../util/useData";

const styles = {
	page: css({
		flexGrow: 1,
		marginInlineStart: ".5rem",

		display: "flex",
		flexDirection: "column",
	}),
	typingIndicatorWrapper: css({
		position: "relative",
	}),
	typingIndicator: css({
		position: "absolute",
		bottom: 0,
		width: "100%",
		height: "1.5rem",
		visibility: "hidden",
		backgroundColor: themeVars.bg1,

		"&.active": {
			visibility: "visible",
		},
	}),
	header: css({
		display: "flex",
		gap: ".5rem",
		alignItems: "center",

		"> h1": {
			margin: 0,
		},
	}),
};

export default function DirectChatPage(props: {params: {counterpartJID: string}}) {
	const counterpartJID = decodeURIComponent(props.params.counterpartJID);

	return <DirectChatPageInner counterpartJID={counterpartJID} key={counterpartJID} />;
}

function DirectChatPageInner(props: {counterpartJID: string}) {
	const conn = useConnectionContext();
	const account = useAccount();
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
		conn.addEventListener.call(undefined, "message", onMessage);

		return () => {
			conn.removeEventListener.call(undefined, "message", onMessage);
		};
	}, [onMessage, conn.addEventListener, conn.removeEventListener]);

	const [pageState, setPageState] = useState<LoadState<ResultSetInfo | null> | null>(null);

	const nextPageRef = useRef<string | null>(null);

	const loadMore = useLatestCallback(() => {
		setPageState(LoadState.loading);

		conn.requestArchive(account.jid, account.jid, {with: counterpart!.jid}, nextPageRef.current ?? undefined)
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

	useEffect(() => {
		if(typeof counterpart !== "undefined") {
			conn.markCounterpartAsVisible.call(undefined, account.jid, counterpart.jid);
		}
	}, [account.jid, conn.markCounterpartAsVisible, counterpart]);

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
				conn.markCounterpartAsRead.call(undefined, account.jid, counterpart.jid, lastMessage.id);
			}
		}
	}, [account.jid, conn.markCounterpartAsRead, counterpart, messagesData.messages, pageState]);

	const submitMessage = useLatestCallback(async (newMessage: string) => {
		await conn.sendMessageToCounterpart(account.jid, counterpart!.jid, {body: newMessage});
	});

	const onChangeComposing = useLatestCallback((composing: boolean) => {
		conn.setComposingToCounterpart(account.jid, parseJID(props.counterpartJID), composing);
	});

	useEffect(() => {
		return () => onChangeComposing(false);
	}, [onChangeComposing]);

	const loaderContent = pageState === null ?
		<p>Connecting…</p> :
		LoadState.ifDone(
			pageState,
			info => info === null ? <p>No more messages known.</p> : <LoadMoreTriggerer loadMore={loadMore} />,
			pageState => <DataNonDoneView state={pageState} />,
		);

	return <div class={styles.page}>
		<div class={styles.header}>
			{typeof counterpart !== "undefined" && <h1>
				{getNickForCounterpart(counterpart)}
			</h1>}
			<div>{props.counterpartJID}</div>
		</div>
		<MessageList
			messages={messagesData.messages}
			loaderContent={loaderContent}
		/>
		<TypingIndicator
			usersTyping={(typeof counterpart !== "undefined" && counterpart.composingFrom) ? [counterpart.jid] : []}
		/>
		<MessageInput submitMessage={submitMessage} autofocus onChangeComposing={onChangeComposing} />
	</div>;
}

function TypingIndicator(props: {usersTyping: JID[]}) {
	return <div class={styles.typingIndicatorWrapper}>
		<div class={cx(styles.typingIndicator, props.usersTyping.length > 0 && "active")}>
			{props.usersTyping.length > 0 && props.usersTyping[0].toString() + " is typing…"}
		</div>
	</div>;
}
