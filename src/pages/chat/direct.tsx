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
		byID: Map<string, Message>;
		byLocalID: Map<string, Message>;
	}>({
		messages: [],
		byID: new Map(),
		byLocalID: new Map(),
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
				if(
					current.byLocalID.has(evt.message.localID) ||
						(evt.message.id !== null && current.byID.has(evt.message.id))
				) {
					// Already present, remove existing entry

					// TODO do this faster
					newMessages = current.messages.filter(message => {
						return !(
							message.id === null ?
								message.localID === evt.message.localID :
								message.id === evt.message.id
						);
					});
				}
				else {
					newMessages = current.messages.slice();
				}

				let newByID;
				if(evt.message.id === null) newByID = current.byID;
				else {
					newByID = new Map(current.byID);
					newByID.set(evt.message.id, evt.message);
				}

				const newByLocalID = new Map(current.byLocalID);
				newByLocalID.set(evt.message.localID, evt.message);

				pushAtSortPosition(
					newMessages,
					evt.message,
					(a, b) => (a.timestamp - b.timestamp) as (0 | 1 | -1), // it's not but should be fine
					0,
				);

				return {
					messages: newMessages,
					byID: newByID,
					byLocalID: newByLocalID,
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
				conn.markCounterpartAsRead.call(undefined, account.jid, counterpart.jid, lastMessage.id, false);
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
