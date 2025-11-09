import { h } from "preact";

import { useAppContext } from "../..";

export default function ChatPage() {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0];
	if(typeof account === "undefined") throw new Error("Missing account");

	return <div>
		{
			account.connected ?
				"chat" :
				"Connecting…"
		}
	</div>;
}
