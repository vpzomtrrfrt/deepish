import { css } from "@emotion/css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { Message, MessageEvent, useAppContext } from "../../..";
import useLatestCallback from "use-latest-callback";
import { List, ListImperativeAPI, RowComponentProps, useDynamicRowHeight, useListRef } from "react-window";

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

	useEffect(() => {
		if(room?.connected === true) {
			appCtx.requestArchive(account.jid, room.jid)
				.then(console.log);
		}
	}, [room?.connected]);

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

	return <div class={css({display: "flex", flexDirection: "column", flexGrow: 1})}>
		<h1>{props.roomJID}</h1>
		<List
			rowComponent={MessageRow}
			rowCount={messages.length}
			rowHeight={rowHeight}
			rowProps={{messages}}
			listRef={listRef}
		/>
	</div>;
}

function MessageRow(props: RowComponentProps<{messages: Message[]}>) {
	const message = props.messages[props.index];

	return <div style={props.style}>
		<em>{message.from.resource}</em> says:
		<blockquote>
			{message.content}
		</blockquote>
	</div>;
}
