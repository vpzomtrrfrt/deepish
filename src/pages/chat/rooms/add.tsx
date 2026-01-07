import { JID, parse as parseJID } from "@xmpp/jid";
import useLinkState from "linkstate/hook";

import Block from "../../../components/Block";
import useSubmitting from "../../../util/useSubmitting";
import { ServiceInfo, useAppContext } from "../../..";
import Input from "../../../components/Input";
import { useLocation } from "wouter-preact";
import Button from "../../../components/Button";
import { useCallback, useContext } from "preact/hooks";
import { LoadState } from "../../../util/useData";
import Dialog, { DialogContext, DialogFooter } from "../../../components/Dialog";
import { DataNonDoneView } from "../../../components/DataView";
import Field, { FieldLabel } from "../../../components/Field";

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

	const createRoom = useCallback(() => {
		appCtx.showDialog.call(undefined, <CreateRoomDialog />);
	}, [appCtx.showDialog]);

	return <div>
		<Block>
			<Button tier="secondary" onClick={createRoom}>Create a Room</Button>
		</Block>

		<Block>
			<h1>Join a Room</h1>
			<form onSubmit={submitJoin}>
				<Input value={joinInput} onChange={linkJoinInput} />
				{" "}
				<Button tier="primary" disabled={submittingJoin || joinInput === ""} type="submit">Join</Button>
			</form>
		</Block>
	</div>;
}

function CreateRoomDialog() {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0]!;

	const dialogCtx = useContext(DialogContext)!;

	const mucServiceState = LoadState.map(account.servicesState, services => {
		const result = services.find(x => x.features.includes("http://jabber.org/protocol/muc") && x.jid.local === "");

		if(typeof result === "undefined") throw new Error("Your server does not offer this feature");
		return result;
	});

	if(mucServiceState.state === "done") {
		return <CreateRoomDialogInner service={mucServiceState.value} />;
	}
	else {
		return <Dialog>
			<div>
				<DataNonDoneView state={mucServiceState} />
			</div>
			<DialogFooter>
				<Button tier="secondary" onClick={dialogCtx.close}>Cancel</Button>
			</DialogFooter>
		</Dialog>;
	}
}

function CreateRoomDialogInner(props: {service: ServiceInfo}) {
	const appCtx = useAppContext();
	const account = appCtx.accounts[0]!;

	const [, navigate] = useLocation();

	const dialogCtx = useContext(DialogContext)!;

	const [local, linkLocal] = useLinkState("");
	const [name, linkName] = useLinkState("");
	const [publishing, linkPublishing] = useLinkState("private");

	const [submitting, submit] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		const roomJID = new JID(local, props.service.jid.domain);

		await appCtx.createRoom(
			account.jid,
			roomJID,
			{
				persistent: true,
				name,
				publicRoom: publishing === "public",
				membersOnly: publishing === "private",
			},
		);

		console.log("created room");

		await appCtx.joinRoom(account.jid, roomJID);

		navigate("~/chat/rooms/" + encodeURIComponent(roomJID.toString()));
	});

	return <Dialog>
		<form onSubmit={submit}>
			<Field>
				<FieldLabel>Address</FieldLabel>
				<div style={{display: "flex", alignItems: "center"}}>
					<Input value={local} onChange={linkLocal} style={{flexGrow: 1}} />
					@{props.service.jid.domain}
				</div>
			</Field>

			<Field>
				<FieldLabel>Name</FieldLabel>
				<Input value={name} onChange={linkName} />
			</Field>

			<Field>
				<FieldLabel>Publishing</FieldLabel>
				<select value={publishing} onChange={linkPublishing}>
					<option value="private">Private</option>
					<option value="unlisted">Unlisted</option>
					<option value="public">Public</option>
				</select>
			</Field>

			<DialogFooter>
				<Button tier="secondary" onClick={dialogCtx.close}>Cancel</Button>
				<Button tier="primary" type="submit" disabled={submitting}>Create</Button>
			</DialogFooter>
		</form>
	</Dialog>;
}
