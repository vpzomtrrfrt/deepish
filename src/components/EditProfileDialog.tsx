import { JSX } from "preact";
import { useCallback, useContext, useState } from "preact/hooks";
import { useIntl } from "react-intl";

import { useAccount, useConnectionContext } from "../util/connection";
import useSubmitting from "../util/useSubmitting";
import Button from "./Button";
import Dialog, { DialogContext, DialogFooter } from "./Dialog";
import Field, { FieldLabel } from "./Field";
import Input from "./Input";

export default function EditProfileDialog() {
	const { $t } = useIntl();

	const connection = useConnectionContext();
	const account = useAccount();

	const dialogCtx = useContext(DialogContext)!;

	const selfCounterpart = account.counterparts.get(account.jid.toString());

	const baseInfo = {
		nick: selfCounterpart?.nick ?? account.jid.local,
	};

	const [changes, setChanges] = useState<Partial<typeof baseInfo>>({});

	const onChangeNick = useCallback((evt: JSX.TargetedEvent<HTMLInputElement>) => {
		setChanges(current => ({...current, nick: evt.currentTarget.value}));
	}, []);

	const info = {...baseInfo, ...changes};

	const [submitting, submit] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		await Promise.all(
			Object.keys(changes)
				.map(async (key_) => {
					const key = key_ as keyof typeof changes;

					if(key === "nick") {
						await connection.setNick(account.jid, changes[key]!);
					}
					else {
						const _: never = key;
						throw new Error("Unknown key");
					}
				}),
		);

		dialogCtx.close();
	});

	return <Dialog>
		<form style={{display: "flex", flexDirection: "column"}} onSubmit={submit}>
			<div>
				<Field>
					<FieldLabel>{$t({defaultMessage: "Nickname"})}</FieldLabel>
					<Input autofocus value={info.nick} onChange={onChangeNick} />
				</Field>
			</div>
			<DialogFooter>
				<Button tier="secondary" onClick={dialogCtx.close}>{$t({defaultMessage: "Cancel"})}</Button>
				<Button type="submit" tier="primary" disabled={submitting}>{$t({defaultMessage: "Save"})}</Button>
			</DialogFooter>
		</form>
	</Dialog>;
}
