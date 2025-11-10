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


	return <div>
		<h1>{props.roomJID}</h1>
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
	</div>;
}
