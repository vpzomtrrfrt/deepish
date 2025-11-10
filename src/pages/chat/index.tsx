import { h } from "preact";
import { Link, Route } from "wouter-preact";

import { Account, useAppContext } from "../..";
import ChatRoomPage from "./rooms";

export default function ChatPage() {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0];
	if(typeof account === "undefined") throw new Error("Missing account");

	return <div>
		{
			account.connected ?
				<ChatView account={account} /> :
				"Connecting…"
		}
		<Route path="/rooms/:roomJID" component={ChatRoomPage} />
	</div>;
}

function ChatView(props: {account: Account}) {
	return <div>
		chat
		<ul>
			{
				Array.from(
					props.account.rooms,
					([roomJID, info]) => {
						return <li key={roomJID}>
							<Link to={"~/chat/rooms/" + encodeURIComponent(roomJID)}>{roomJID}</Link> - {info.connected ? ("Connected as " + info.nick!) : "Not Connected"}
						</li>;
					},
				)
			}
		</ul>
	</div>;
}
