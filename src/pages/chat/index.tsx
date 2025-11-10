import { h } from "preact";

import { Account, useAppContext } from "../..";

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
							{roomJID} - {info.connected ? ("Connected as " + info.nick!) : "Not Connected"}
						</li>;
					},
				)
			}
		</ul>
	</div>;
}
