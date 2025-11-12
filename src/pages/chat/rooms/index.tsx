import { css } from "@emotion/css";
import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Message, MessageEvent, useAppContext } from "../../..";
import useLatestCallback from "use-latest-callback";

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

	return <div class={css({display: "flex", flexDirection: "column", flexGrow: 1})}>
		<h1>{props.roomJID}</h1>
		<div class={css({overflowY: "auto"})}>
			{
				messages.map(message => {
					return <div>
						<em>{message.from.resource}</em> says:
						<blockquote>
							{message.content}
						</blockquote>
					</div>;
				})
			}
		</div>
	</div>;
}
