import { css } from "@emotion/css";
import { Link, Route } from "wouter-preact";

import { Account, useAppContext } from "../..";
import ChatRoomPage from "./rooms";
import { LoadState } from "../../util/useData";
import Avatar from "../../components/Avatar";
import WithTooltip from "../../components/WithTooltip";

const styles = {
	page: css({
		display: "flex",
		height: "100%",
		gap: ".5rem",
	}),
};

export default function ChatPage() {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0];
	if(typeof account === "undefined") throw new Error("Missing account");

	return <div class={styles.page}>
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
		<div>
			{
				Array.from(
					props.account.rooms,
					([roomJID, info]) => {
						const name = LoadState.ifDone(info.infoState, disco => disco.name, () => null) ?? roomJID;

						return <div key={roomJID}>
							<WithTooltip tooltip={name} side="inline-end">
								<Link to={"~/chat/rooms/" + encodeURIComponent(roomJID)}>
									<Avatar size="md" id={roomJID} />
								</Link>
							</WithTooltip>
						</div>;
					},
				)
			}
		</div>
	</div>;
}
