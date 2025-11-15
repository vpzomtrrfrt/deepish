import { css } from "@emotion/css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { Message, MessageEvent, ResultSetInfo, useAppContext } from "../../..";
import useLatestCallback from "use-latest-callback";
import { List, ListImperativeAPI, RowComponentProps, useDynamicRowHeight, useListRef } from "react-window";
import { LoadState } from "../../../util/useData";
import { ComponentChild, JSX, VNode } from "preact";
import { DataNonDoneView } from "../../../components/DataView";
import { pushAtSortPosition } from "array-push-at-sort-position";
import useLinkState from "linkstate/hook";
import useSubmitting from "../../../util/useSubmitting";

export default function ChatRoomPage(props: {params: {roomJID: string}}) {
	const roomJID = decodeURIComponent(props.params.roomJID);

	return <ChatRoomPageInner roomJID={roomJID} key={roomJID} />;
}

const DEFAULT_ROW_HEIGHT = 70;

// Not sure why this is necessary but it seems to fix initial load scrolling
const BOTTOM_TOLERANCE = 5;

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
		appCtx.addEventListener("message", onMessage);

		return () => {
			appCtx.removeEventListener("message", onMessage);
		};
	}, [onMessage, appCtx.addEventListener, appCtx.removeEventListener]);

	const [pageState, setPageState] = useState<LoadState<ResultSetInfo | null> | null>(null);

	const nextPageRef = useRef<string | null>(null);

	const loadMore = useLatestCallback(() => {
		setPageState(LoadState.loading);

		appCtx.requestArchive(account.jid, room!.jid, nextPageRef.current ?? undefined)
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

	const messageListRef = useRef<HTMLDivElement>(null);

	const [newMessage, linkNewMessage, setNewMessage] = useLinkState("");

	const [submittingNewMessage, submitNewMessage] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		await appCtx.sendMessageToRoom(account.jid, room!.jid, {body: newMessage});

		setNewMessage("");
	});

	const rowHeight = useDynamicRowHeight({defaultRowHeight: DEFAULT_ROW_HEIGHT});

	const listRef = useRef<ListImperativeAPI>(null);
	const lastScrollHeightRef = useRef(0);

	const lastMessages = useRef<Message[]>([]);

	let lastCenterItem = null;
	let lastCenterItemPos = null;
	let lastCenterItemIndex = null;
	if(listRef.current !== null && listRef.current.element !== null && listRef.current.element.children.length > 0) {
		const centerItem = listRef.current.element.children[Math.floor(listRef.current.element.children.length / 2)] as HTMLElement;
		lastCenterItemPos = centerItem.getBoundingClientRect().top;
		lastCenterItemIndex = parseInt(centerItem.dataset.reactWindowIndex as string, 10);
		lastCenterItem = lastMessages.current[lastCenterItemIndex - 1] ?? null;
	}

	const messages = messagesData.messages;
	lastMessages.current = messages;

	const atBottomRef = useRef(true);

	useLayoutEffect(() => {
		const elem = listRef.current!.element;

		if(elem !== null) {
			const currentScrollLocation = elem.scrollTop;

			console.log("maybe adjusting scroll", currentScrollLocation, lastScrollHeightRef.current, elem.clientHeight, lastScrollHeightRef.current - elem.clientHeight, elem.scrollHeight);

			if(atBottomRef.current) {
				console.log("adjusting scroll to bottom");
				elem.scrollTop = elem.scrollHeight;
				console.log("scroll was to", elem.scrollTop, elem.scrollHeight - elem.clientHeight);
			}
			else {
				if(lastCenterItem !== null && lastCenterItemPos !== null) {
					const centerItemNewIndex = messages.indexOf(lastCenterItem) + 1;

					const topItem = elem.children[0] as HTMLElement;
					const topItemIndex = parseInt(topItem.dataset.reactWindowIndex as string, 10);

					console.log("lci", lastCenterItem, lastCenterItemPos, centerItemNewIndex, topItemIndex);

					if(lastCenterItemIndex !== null && centerItemNewIndex > lastCenterItemIndex) {
						console.log("adjusting scroll");
						elem.scrollTop += elem.scrollHeight - lastScrollHeightRef.current;
					}
				}
			}

			lastScrollHeightRef.current = elem.scrollHeight;
		}
	});

	const onResize = useCallback(() => {
		const elem = listRef.current!.element;

		if(elem !== null) {
			if(atBottomRef.current) {
				elem.scrollTop = elem.scrollHeight;
			}
		}
	}, []);

	const onScroll = useCallback((evt: JSX.TargetedEvent<HTMLDivElement>) => {
		atBottomRef.current =
			evt.currentTarget.scrollTop >= evt.currentTarget.scrollHeight - evt.currentTarget.clientHeight - BOTTOM_TOLERANCE;

		console.log("updated from scroll, atBottom=", atBottomRef.current, evt.currentTarget.scrollTop, evt.currentTarget.scrollHeight - evt.currentTarget.clientHeight);
	}, []);

	const loaderContent = pageState === null ?
		<p>Connecting…</p> :
		LoadState.ifDone(
			pageState,
			info => info === null ? <p>No more messages known.</p> : <LoadMoreTriggerer loadMore={loadMore} />,
			pageState => <DataNonDoneView state={pageState} />,
		);

	return <div class={css({display: "flex", flexDirection: "column", flexGrow: 1})}>
		<h1>{props.roomJID}</h1>
		<List
			rowComponent={MessageRow}
			rowCount={messages.length + 1}
			rowHeight={rowHeight}
			rowProps={{
				messages,
				loaderContent,
			}}
			listRef={listRef}
			onResize={onResize}
			onScroll={onScroll}
		/>
		<form onSubmit={submitNewMessage} class={css({display: "flex"})}>
			<input type="text" value={newMessage} onChange={linkNewMessage} style={{flexGrow: 1}} />
			<button type="submit" disabled={submittingNewMessage}>Send</button>
		</form>
	</div>;
}

function MessageRow(props: RowComponentProps<{messages: Message[]; loaderContent: VNode}>) {
	if(props.index === 0) {
		return props.loaderContent;
	}

	const index = props.index - 1;

	const message = props.messages[index];

	return <div style={props.style}>
		At {message.timestamp.toLocaleString()}, <em>{message.from.resource}</em> says:
		<blockquote>
			{message.content}
		</blockquote>
	</div>;
}

function LoadMoreTriggerer(props: {loadMore: () => void}) {
	const elemRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const observer = new IntersectionObserver(props.loadMore, {
			root: elemRef.current!.parentNode as Element,
		});

		observer.observe(elemRef.current!);

		return () => {
			observer.disconnect();
		};
	}, [props.loadMore]);

	return <div ref={elemRef} />;
}
