import { useComputed } from "@preact/signals";
import { JID } from "@xmpp/jid";
import { JSX } from "preact";
import { useCallback, useContext, useState } from "preact/hooks";
import { useIntl } from "react-intl";

import { RoomDiscoInfo, RoomEditParams, useAccountSig, useConnectionContext } from "../util/connection";
import useData from "../util/useData";
import useSubmitting from "../util/useSubmitting";
import Button from "./Button";
import DataView from "./DataView";
import Dialog, { DialogContext, DialogFooter } from "./Dialog";
import Field, { FieldLabel } from "./Field";
import Input from "./Input";

export default function EditRoomDialog(props: {room: JID}) {
	const account = useAccountSig();
	const conn = useConnectionContext();

	const accountJID = useComputed(() => account.value.jid).value;

	const infoState = useData(async () => {
		return conn.fetchRoomInfo(accountJID, props.room);
	}, []);

	return <Dialog>
		<DataView state={infoState}>
			{info => <Content room={props.room} info={info} />}
		</DataView>
	</Dialog>;
}

function Content(props: {room: JID; info: RoomDiscoInfo}) {
	const { $t } = useIntl();

	const conn = useConnectionContext();
	const accountSig = useAccountSig();

	const dialogCtx = useContext(DialogContext)!;

	const baseInfo = {
		name: props.info.name ?? props.room.local,
	};

	const [changes, setChanges] = useState<Partial<typeof baseInfo>>({});

	const onChangeName = useCallback((evt: JSX.TargetedEvent<HTMLInputElement>) => {
		setChanges(current => ({...current, name: evt.currentTarget.value}));
	}, []);

	const info = {...baseInfo, ...changes};

	const accountJID = useComputed(() => accountSig.value.jid).value;

	const [submitting, submit] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		const mainChanges: RoomEditParams = {};
		const calls = [];

		for(const key_ in changes) {
			const key = key_ as keyof typeof changes;

			if(key === "name") mainChanges.name = changes[key];
			else {
				const _: never = key;
				throw new Error("Unknown key");
			}
		}

		if(Object.keys(mainChanges).length > 0) calls.push(conn.changeRoomConfig(accountJID, props.room, mainChanges));

		await Promise.all(calls);

		dialogCtx.close();
	});

	return <form style={{display: "flex", flexDirection: "column"}} onSubmit={submit}>
		<div>
			<Field>
				<FieldLabel>{$t({defaultMessage: "Name"})}</FieldLabel>
				<Input autofocus value={info.name} onChange={onChangeName} />
			</Field>
			
		</div>
		<DialogFooter>
			<Button tier="secondary" onClick={dialogCtx.close}>{$t({defaultMessage: "Cancel"})}</Button>
			<Button type="submit" tier="primary" disabled={submitting}>
				{$t({defaultMessage: "Save"})}
			</Button>
		</DialogFooter>
	</form>;
}
