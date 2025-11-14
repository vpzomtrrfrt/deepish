import { css } from "@emotion/css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { Message, MessageEvent, ResultSetInfo, useAppContext } from "../../..";
import useLatestCallback from "use-latest-callback";
import { List, ListImperativeAPI, RowComponentProps, useDynamicRowHeight, useListRef } from "react-window";
import { LoadState } from "../../../util/useData";
import { ComponentChild, VNode } from "preact";
import { DataNonDoneView } from "../../../components/DataView";
import { pushAtSortPosition } from "array-push-at-sort-position";

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

	const rowHeight = useDynamicRowHeight({defaultRowHeight: 54});

	const listRef = useRef<ListImperativeAPI>(null);
	const lastScrollHeightRef = useRef(0);
	useLayoutEffect(() => {
		const elem = listRef.current!.element;

		if(elem !== null) {
			const currentScrollLocation = elem.scrollTop;

			if(currentScrollLocation >= lastScrollHeightRef.current - elem.clientHeight) {
				elem.scrollTop = elem.scrollHeight;
			}

			lastScrollHeightRef.current = elem.scrollHeight;
		}
	});

	const loaderContent = pageState === null ?
		null :
		LoadState.ifDone(
			pageState,
			info => info === null ? null : <LoadMoreTriggerer loadMore={loadMore} />,
			pageState => <DataNonDoneView state={pageState} />,
		);

	const messages = messagesData.messages;

	return <div class={css({display: "flex", flexDirection: "column", flexGrow: 1})}>
		<h1>{props.roomJID}</h1>
		<List
			rowComponent={MessageRow}
			rowCount={messages.length + (loaderContent === null ? 0 : 1)}
			rowHeight={rowHeight}
			rowProps={{
				messages,
				loaderContent,
			}}
			listRef={listRef}
		/>
	</div>;
}

function MessageRow(props: RowComponentProps<{messages: Message[]; loaderContent: VNode | null}>) {
	let index;
	if(props.loaderContent === null) {
		index = props.index;
	}
	else {
		if(props.index === 0) {
			return props.loaderContent;
		}
		else {
			index = props.index - 1;
		}
	}

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
