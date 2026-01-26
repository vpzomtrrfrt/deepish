import { css } from "@emotion/css";
import { useComputed } from "@preact/signals";
import { JSX } from "preact";
import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import { useIntl } from "react-intl";

import { useAccountSig, useConnectionContext } from "../util/connection";
import { AVATAR_MAX_SIZE } from "../util/constants";
import convertImage, { ConvertImageResult } from "../util/convertImage";
import useData, { LoadState } from "../util/useData";
import useSubmitting from "../util/useSubmitting";
import Avatar, { RawAvatar } from "./Avatar";
import Button from "./Button";
import DataView from "./DataView";
import Dialog, { DialogContext, DialogFooter } from "./Dialog";
import Field, { FieldLabel } from "./Field";
import Input from "./Input";

const styles = {
	avatarView: css({
		display: "flex",
		justifyContent: "space-around",
	}),
};

export default function EditProfileDialog() {
	const { $t } = useIntl();

	const connection = useConnectionContext();
	const accountSig = useAccountSig();

	const dialogCtx = useContext(DialogContext)!;

	const selfCounterpart = useComputed(() => {
		return accountSig.value.counterparts.getSignal(accountSig.value.jid.toString());
	}).value.value;

	const baseInfo = {
		nick: selfCounterpart?.nick ?? accountSig.value.jid.local,
	};

	const [changes, setChanges] = useState<Partial<typeof baseInfo>>({});

	const onChangeNick = useCallback((evt: JSX.TargetedEvent<HTMLInputElement>) => {
		setChanges(current => ({...current, nick: evt.currentTarget.value}));
	}, []);

	const info = {...baseInfo, ...changes};

	const [newAvatarSrc, setNewAvatarSrc] = useState<File | null>(null);

	const onChangeNewAvatar = useCallback((evt: JSX.TargetedEvent<HTMLInputElement>) => {
		setNewAvatarSrc(evt.currentTarget.files?.[0] ?? null);
	}, []);

	const newAvatarState = useData(async () => {
		if(newAvatarSrc === null) return null;

		return convertImage(newAvatarSrc, {maxSize: AVATAR_MAX_SIZE, square: true});
	}, [newAvatarSrc]);

	const [submitting, submit] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		await Promise.all([
			Promise.all(
				Object.keys(changes)
					.map(async (key_) => {
						const key = key_ as keyof typeof changes;

						if(key === "nick") {
							await connection.setNick(accountSig.value.jid, changes[key]!);
						}
						else {
							const _: never = key;
							throw new Error("Unknown key");
						}
					}),
			),
			newAvatarSrc === null ?
				undefined :
				connection.setAvatar(accountSig.value.jid, LoadState.assertDone(newAvatarState)!)
		]);

		dialogCtx.close();
	});

	return <Dialog>
		<form style={{display: "flex", flexDirection: "column"}} onSubmit={submit}>
			<div>
				<Field>
					<FieldLabel>{$t({defaultMessage: "Nickname"})}</FieldLabel>
					<Input autofocus value={info.nick} onChange={onChangeNick} />
				</Field>
				<Field>
					<FieldLabel>{$t({defaultMessage: "Profile Picture"})}</FieldLabel>
					<Input type="file" onChange={onChangeNewAvatar} />
					<DataView state={newAvatarState}>
						{info => {
							return <AvatarView newInfo={info} />;
						}}
					</DataView>
				</Field>
			</div>
			<DialogFooter>
				<Button tier="secondary" onClick={dialogCtx.close}>{$t({defaultMessage: "Cancel"})}</Button>
				<Button type="submit" tier="primary" disabled={submitting || newAvatarState.state !== "done"}>
					{$t({defaultMessage: "Save"})}
				</Button>
			</DialogFooter>
		</form>
	</Dialog>;
}

function AvatarView(props: {newInfo: ConvertImageResult | null}) {
	const accountSig = useAccountSig();
	const accountJID = useComputed(() => accountSig.value.jid).value;

	const newURL = useMemo(() => {
		return props.newInfo === null ? null : URL.createObjectURL(props.newInfo.content);
	}, [props.newInfo]);

	useEffect(() => {
		if(newURL !== null) {
			return () => {
				URL.revokeObjectURL(newURL);
			};
		}
	}, [newURL]);

	return <div class={styles.avatarView}>
		{
			newURL === null ?
				<Avatar jid={accountJID} size="lg" /> :
				<RawAvatar src={newURL} size="lg" />
		}
	</div>;
}
