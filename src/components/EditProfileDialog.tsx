import { css } from "@emotion/css";
import { useComputed, useSignal } from "@preact/signals";
import { JSX } from "preact";
import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import { useIntl } from "react-intl";

import { useConnectionContext } from "../util/connection";
import { AVATAR_MAX_SIZE } from "../util/constants";
import convertImage, { ConvertImageResult } from "../util/convertImage";
import { LoadState, useDataSig } from "../util/useData";
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

	const conn = useConnectionContext();

	const dialogCtx = useContext(DialogContext)!;

	const selfCounterpart = useComputed(() => {
		return conn.counterparts.getSignal(conn.jid.toString());
	}).value.value;

	const baseInfo = {
		nick: selfCounterpart?.nick ?? conn.jid.local,
	};

	const [changes, setChanges] = useState<Partial<typeof baseInfo>>({});

	const onChangeNick = useCallback((evt: JSX.TargetedEvent<HTMLInputElement>) => {
		setChanges(current => ({...current, nick: evt.currentTarget.value}));
	}, []);

	const info = {...baseInfo, ...changes};

	const newAvatarSrcSig = useSignal<File | null>(null);

	const onChangeNewAvatar = useCallback((evt: JSX.TargetedEvent<HTMLInputElement>) => {
		newAvatarSrcSig.value = evt.currentTarget.files?.[0] ?? null;
	}, [newAvatarSrcSig]);

	const newAvatarSig = useDataSig(async () => {
		if(newAvatarSrcSig.value === null) return null;

		return convertImage(newAvatarSrcSig.value, {maxSize: AVATAR_MAX_SIZE, square: true});
	});

	const [submitting, submit] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		await Promise.all([
			Promise.all(
				Object.keys(changes)
					.map(async (key_) => {
						const key = key_ as keyof typeof changes;

						if(key === "nick") {
							await conn.setNick(changes[key]!);
						}
						else {
							const _: never = key;
							throw new Error("Unknown key");
						}
					}),
			),
			newAvatarSrcSig.value === null ?
				undefined :
				conn.setAvatar(LoadState.assertDone(newAvatarSig.value)!)
		]);

		dialogCtx.close();
	});

	const saveDisabled = useComputed(() => submitting.value || newAvatarSig.value.state !== "done");

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
					<DataView state={newAvatarSig}>
						{avatar => {
							return <AvatarView newInfo={avatar} />;
						}}
					</DataView>
				</Field>
			</div>
			<DialogFooter>
				<Button tier="secondary" onClick={dialogCtx.close}>{$t({defaultMessage: "Cancel"})}</Button>
				<Button type="submit" tier="primary" disabled={saveDisabled}>
					{$t({defaultMessage: "Save"})}
				</Button>
			</DialogFooter>
		</form>
	</Dialog>;
}

function AvatarView(props: {newInfo: ConvertImageResult | null}) {
	const conn = useConnectionContext();

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
				<Avatar jid={conn.jid} size="lg" /> :
				<RawAvatar src={newURL} size="lg" />
		}
	</div>;
}
