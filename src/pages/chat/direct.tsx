import { css } from "@emotion/css";
import { parse as parseJID } from "@xmpp/jid";
import { pushAtSortPosition } from "array-push-at-sort-position";
import { useEffect, useRef, useState } from "preact/hooks";
import { useIntl } from "react-intl";
import useLatestCallback from "use-latest-callback";

import { DataNonDoneView } from "../../components/DataView";
import MessageInput from "../../components/MessageInput";
import MessageList, { LoadMoreTriggerer } from "../../components/MessageList";
import TypingIndicator from "../../components/TypingIndicator";
import { Message, MessageEvent, ResultSetInfo, useAccount, useConnectionContext } from "../../util/connection";
import { getNickForCounterpart } from "../../util/profileUtil";
import { LoadState } from "../../util/useData";
import useEventHandler from "../../util/useEventHandler";
import { StanzaIDType } from "../../util/xmpp/StanzaID";

const styles = {
	page: css({
		flexGrow: 1,
		marginInlineStart: ".5rem",

		display: "flex",
		flexDirection: "column",
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
	const { $t } = useIntl();

	const conn = useConnectionContext();
	const account = useAccount();
	const counterpart = account.counterparts.get(props.counterpartJID);

	const [messagesData, setMessagesData] = useState<{
		messages: Message[];
		messageMap: Map<string, Message>;
	}>({
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
				let newMessages;
				if(evt.message.ids.some(x => current.messageMap.has(x.toString()))) {
					// Already present, remove existing entry

					// TODO do this faster
					newMessages = current.messages.filter(message => {
						return !message.ids.some(existing => evt.message.ids.some(x => x.equals(existing)));
					});
				}
				else {
					newMessages = current.messages.slice();
				}

				const newMap = new Map(current.messageMap);
				evt.message.ids.forEach(id => {
					newMap.set(id.toString(), evt.message);
				});

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

	useEventHandler(conn, "message", onMessage);

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
			const lastMessageID =
				lastMessage.ids.find(x => x.type === StanzaIDType.Stanza && x.by.equals(account.jid));
			if(typeof lastMessageID !== "undefined" && counterpart.lastReadMessageID !== lastMessageID.id) {
				conn.markCounterpartAsRead.call(undefined, account.jid, counterpart.jid, lastMessageID.id, false);
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
		<p>{$t({defaultMessage: "Connecting…"})}</p> :
		LoadState.ifDone(
			pageState,
			info => info === null ?
				<p>{$t({defaultMessage: "No more messages known."})}</p> :
				<LoadMoreTriggerer loadMore={loadMore} />,
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
			inRoom={false}
		/>
		<MessageInput submitMessage={submitMessage} autofocus onChangeComposing={onChangeComposing} />
	</div>;
}
