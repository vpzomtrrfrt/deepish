import { parse as parseJID } from "@xmpp/jid";
import useLinkState from "linkstate/hook";

import Block from "../../../components/Block";
import useSubmitting from "../../../util/useSubmitting";
import { useAppContext } from "../../..";
import Input from "../../../components/Input";
import { useLocation } from "wouter-preact";
import Button from "../../../components/Button";

export default function ChatRoomAddPage() {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0]!;

	const [, navigate] = useLocation();

	const [joinInput, linkJoinInput] = useLinkState("");

	const [submittingJoin, submitJoin] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		const room = parseJID(joinInput);

		await appCtx.joinRoom(account.jid, room);

		navigate("~/chat/rooms/" + encodeURIComponent(room.toString()));
	});

	return <Block>
		<h1>Join a Room</h1>
		<form onSubmit={submitJoin}>
			<Input value={joinInput} onChange={linkJoinInput} />
			<Button tier="primary" disabled={submittingJoin || joinInput === ""} type="submit">Join</Button>
		</form>
	</Block>;
}
