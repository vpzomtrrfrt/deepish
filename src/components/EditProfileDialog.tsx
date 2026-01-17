import { css } from "@emotion/css";
import { JSX } from "preact";
import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import { useIntl } from "react-intl";

import { useAccount, useConnectionContext } from "../util/connection";
import convertImage, { ConvertImageResult } from "../util/convertImage";
import useData, { LoadState } from "../util/useData";
import useSubmitting from "../util/useSubmitting";
import Avatar, { RawAvatar } from "./Avatar";
import Button from "./Button";
import DataView from "./DataView";
import Dialog, { DialogContext, DialogFooter } from "./Dialog";
import Field, { FieldLabel } from "./Field";
import Input from "./Input";

// Arbitrary number. Spec says 64x64 but that seems too small
const AVATAR_MAX_SIZE = 256;

const styles = {
	avatarView: css({
		display: "flex",
		justifyContent: "space-around",
	}),
};

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
							await connection.setNick(account.jid, changes[key]!);
						}
						else {
							const _: never = key;
							throw new Error("Unknown key");
						}
					}),
			),
			newAvatarSrc === null ?
				undefined :
				connection.setAvatar(account.jid, LoadState.assertDone(newAvatarState)!)
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
	const account = useAccount();

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
				<Avatar jid={account.jid} size="lg" /> :
				<RawAvatar src={newURL} size="lg" />
		}
	</div>;
}
