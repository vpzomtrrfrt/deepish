import { JID, parse as parseJID } from "@xmpp/jid";
import useLinkState from "linkstate/hook";
import { useCallback, useContext } from "preact/hooks";
import { useIntl } from "react-intl";
import { useLocation } from "wouter-preact";

import { useAppContext } from "../../..";
import Block from "../../../components/Block";
import Button from "../../../components/Button";
import { DataNonDoneView } from "../../../components/DataView";
import Dialog, { DialogContext, DialogFooter } from "../../../components/Dialog";
import Field, { FieldLabel } from "../../../components/Field";
import FieldList from "../../../components/FieldList";
import Input, { InputSuffixWrapper } from "../../../components/Input";
import Select from "../../../components/Select";
import { RoomDiscoInfo, ServiceInfo, useAccountSig, useConnectionContext } from "../../../util/connection";
import { msgActionCreate, msgCancel, msgJIDShort, publishingTypeNames } from "../../../util/langCommon";
import { LoadState } from "../../../util/useData";
import useSubmitting from "../../../util/useSubmitting";

export default function ChatRoomAddPage() {
	const { $t } = useIntl();

	const appCtx = useAppContext();
	const conn = useConnectionContext();
	const accountSig = useAccountSig();

	const [joinInput, linkJoinInput] = useLinkState("");

	const [submittingJoin, submitJoin] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		let roomStr = joinInput;
		if(joinInput.startsWith("xmpp:")) {
			try {
				const url = new URL(joinInput);
				if(url.search === "" || url.search === "?join") {
					roomStr = url.pathname;
				}
			}
			catch {
				// not a valid URL, don't try to do URI things
			}
		}

		const room = parseJID(roomStr);

		const info = await conn.fetchRoomInfo(accountSig.value.jid, room);

		appCtx.showDialog(<JoinRoomDialog roomJID={room} roomInfo={info} />);
	});

	const createRoom = useCallback(() => {
		appCtx.showDialog.call(undefined, <CreateRoomDialog />);
	}, [appCtx.showDialog]);

	return <div>
		<Block>
			<Button tier="secondary" onClick={createRoom}>{$t({defaultMessage: "Create Channel"})}</Button>
		</Block>

		<Block>
			<h1>{$t({defaultMessage: "Join a Channel"})}</h1>
			<form onSubmit={submitJoin}>
				<Input value={joinInput} onChange={linkJoinInput} />
				{" "}
				<Button tier="primary" disabled={submittingJoin.value || joinInput === ""} type="submit">
					{$t({defaultMessage: "Join"})}
				</Button>
			</form>
		</Block>
	</div>;
}

function CreateRoomDialog() {
	const { $t } = useIntl();

	const account = useAccountSig().value;

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
				<Button tier="secondary" onClick={dialogCtx.close}>{$t(msgCancel)}</Button>
			</DialogFooter>
		</Dialog>;
	}
}

function CreateRoomDialogInner(props: {service: ServiceInfo}) {
	const { $t } = useIntl();

	const conn = useConnectionContext();
	const accountSig = useAccountSig();

	const [, navigate] = useLocation();

	const dialogCtx = useContext(DialogContext)!;

	const [local, linkLocal] = useLinkState("");
	const [name, linkName] = useLinkState("");
	const [publishing, linkPublishing] = useLinkState("private");

	const [submitting, submit] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		const roomJID = new JID(local, props.service.jid.domain);

		await conn.createRoom(
			accountSig.value.jid,
			roomJID,
			{
				persistent: true,
				name,
				publicRoom: publishing === "public",
				membersOnly: publishing === "private",
			},
		);

		console.log("created room");

		await conn.joinRoom(accountSig.value.jid, roomJID);

		navigate("~/chat/rooms/" + encodeURIComponent(roomJID.toString()));
	});

	return <Dialog>
		<form onSubmit={submit}>
			<FieldList>
				<Field>
					<FieldLabel>{$t(msgJIDShort)}</FieldLabel>
					<InputSuffixWrapper
						suffix={"@" + props.service.jid.domain}
						inputProps={{
							value: local,
							onChange: linkLocal,
							style: {flexGrow: 1},
							autofocus: true,
						}}
					/>
				</Field>

				<Field>
					<FieldLabel>{$t({defaultMessage: "Name"})}</FieldLabel>
					<Input value={name} onChange={linkName} />
				</Field>

				<Field>
					<FieldLabel>{$t({defaultMessage: "Publishing"})}</FieldLabel>
					<Select value={publishing} onChange={linkPublishing}>
						{
							Object.keys(publishingTypeNames).map(key_ => {
								const key = key_ as keyof typeof publishingTypeNames;
								return <option key={key} value={key}>{$t(publishingTypeNames[key])}</option>;
							})
						}
					</Select>
				</Field>
			</FieldList>

			<DialogFooter>
				<Button tier="secondary" onClick={dialogCtx.close}>{$t(msgCancel)}</Button>
				<Button tier="primary" type="submit" disabled={submitting}>{$t(msgActionCreate)}</Button>
			</DialogFooter>
		</form>
	</Dialog>;
}

function JoinRoomDialog(props: {roomJID: JID; roomInfo: RoomDiscoInfo}) {
	const { $t } = useIntl();

	const conn = useConnectionContext();
	const accountSig = useAccountSig();

	const [, navigate] = useLocation();

	const dialogCtx = useContext(DialogContext)!;

	const [nick, linkNick] = useLinkState(accountSig.peek().jid.local);

	const [submitting, submit] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		await conn.joinRoom(accountSig.value.jid, props.roomJID, nick);

		navigate("~/chat/rooms/" + encodeURIComponent(props.roomJID.toString()));
	});

	return <Dialog>
		<form onSubmit={submit}>
			<h1>{props.roomInfo.name}</h1>
			<p>{props.roomJID.toString()}</p>

			<FieldList>
				<Field>
					<FieldLabel>{$t({defaultMessage: "Nickname"})}</FieldLabel>
					<Input value={nick} onChange={linkNick} />
				</Field>
			</FieldList>

			<DialogFooter>
				<Button tier="secondary" onClick={dialogCtx.close}>{$t(msgCancel)}</Button>
				<Button tier="primary" type="submit" disabled={submitting}>{$t({defaultMessage: "Join"})}</Button>
			</DialogFooter>
		</form>
	</Dialog>;
}
