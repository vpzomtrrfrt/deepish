import { css } from "@emotion/css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { Message, MessageEvent, ResultSetInfo, useAppContext } from "../../..";
import useLatestCallback from "use-latest-callback";
import { List, ListImperativeAPI, RowComponentProps, useDynamicRowHeight, useListRef } from "react-window";
import { LoadState } from "../../../util/useData";
import { ComponentChild, VNode } from "preact";
import { DataNonDoneView } from "../../../components/DataView";

export default function ChatRoomPage(props: {params: {roomJID: string}}) {
	const roomJID = decodeURIComponent(props.params.roomJID);

	return <ChatRoomPageInner roomJID={roomJID} key={roomJID} />;
}

function ChatRoomPageInner(props: {roomJID: string}) {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0]!;
	const room = account.rooms.get(props.roomJID);

	const [messages, setMessages] = useState<Message[]>([]);

	const onMessage = useLatestCallback((evt: MessageEvent) => {
		console.log("room page got message", evt);

		if(evt.message.room !== null && evt.message.room.toString() === props.roomJID) {
			setMessages(current => [...current, evt.message]);
		}
	});

	useEffect(() => {
		appCtx.addEventListener("message", onMessage);

		return () => {
			appCtx.removeEventListener("message", onMessage);
		};
	}, [onMessage, appCtx.addEventListener, appCtx.removeEventListener]);

	const [pageState, setPageState] = useState<LoadState<ResultSetInfo | null> | null>(null);

	useEffect(() => {
		if(room?.connected === true && pageState === null) {
			setPageState(LoadState.loading);

			appCtx.requestArchive(account.jid, room.jid)
				.then(value => {
					setPageState(LoadState.wrapValue(value));
				})
				.catch(err => {
					setPageState(LoadState.wrapError(err));
				});
		}
	}, [room?.connected, pageState]);

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

	const loaderContent = (pageState === null || pageState.state === "done") ?
		null :
		<DataNonDoneView state={pageState} />;

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
		<em>{message.from.resource}</em> says:
		<blockquote>
			{message.content}
		</blockquote>
	</div>;
}
