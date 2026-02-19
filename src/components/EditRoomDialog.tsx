import { css } from "@emotion/css";
import { useComputed, useSignal } from "@preact/signals";
import { JID } from "@xmpp/jid";
import { JSX } from "preact";
import { memo } from "preact/compat";
import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import { useIntl } from "react-intl";

import { RoomConfig, RoomEditParams, useConnectionContext } from "../util/connection";
import { AVATAR_MAX_SIZE } from "../util/constants";
import convertImage, { ConvertImageResult } from "../util/convertImage";
import { publishingTypeNames } from "../util/langCommon";
import { RoomPublishing } from "../util/types";
import { LoadState, useDataSig } from "../util/useData";
import useSubmitting from "../util/useSubmitting";
import Avatar, { RawAvatar } from "./Avatar";
import Button from "./Button";
import DataView from "./DataView";
import Dialog, { DialogContext, DialogFooter } from "./Dialog";
import Field, { FieldLabel } from "./Field";
import Input from "./Input";
import Select from "./Select";

const styles = {
	avatarView: css({
		display: "flex",
		justifyContent: "space-around",
	}),
};

export default memo(function EditRoomDialog(props: {room: JID}) {
	const conn = useConnectionContext();

	const infoState = useDataSig(async () => {
		return conn.fetchRoomConfig(props.room);
	});

	return <Dialog>
		<DataView state={infoState}>
			{info => <Content room={props.room} info={info} />}
		</DataView>
	</Dialog>;
});

function Content(props: {room: JID; info: RoomConfig}) {
	const { $t } = useIntl();

	const conn = useConnectionContext();

	const dialogCtx = useContext(DialogContext)!;

	const baseInfo = {
		name: props.info.name ?? props.room.local,
		publishing: props.info.membersOnly ?
			RoomPublishing.Private :
			(props.info.publicRoom ? RoomPublishing.Public : RoomPublishing.Unlisted),
	};

	const [changes, setChanges] = useState<Partial<typeof baseInfo>>({});

	const onChangeName = useCallback((evt: JSX.TargetedEvent<HTMLInputElement>) => {
		setChanges(current => ({...current, name: evt.currentTarget.value}));
	}, []);

	const onChangePublishing = useCallback((evt: JSX.TargetedEvent<HTMLSelectElement>) => {
		setChanges(current => ({...current, publishing: evt.currentTarget.value as RoomPublishing}));
	}, []);

	const info = {...baseInfo, ...changes};

	const newAvatarSrcSig = useSignal<File | null>(null);

	const onChangeNewAvatar = useCallback((evt: JSX.TargetedEvent<HTMLInputElement>) => {
		newAvatarSrcSig.value = evt.currentTarget.files?.[0] ?? null;
	}, [newAvatarSrcSig]);

	const newAvatarState = useDataSig(async () => {
		if(newAvatarSrcSig.value === null) return null;

		return convertImage(newAvatarSrcSig.value, {maxSize: AVATAR_MAX_SIZE, square: true});
	});

	const [submitting, submit] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		const mainChanges: RoomEditParams = {};
		const calls = [];

		for(const key_ in changes) {
			const key = key_ as keyof typeof changes;

			if(key === "name") mainChanges.name = changes[key];
			else if(key === "publishing") {
				const value = changes[key];
				mainChanges.publicRoom = value === RoomPublishing.Public;
				mainChanges.membersOnly = value === RoomPublishing.Private;
			}
			else {
				const _: never = key;
				throw new Error("Unknown key");
			}
		}

		if(newAvatarSrcSig.value !== null) {
			calls.push(
				conn.setRoomAvatar(
					props.room,
					LoadState.assertDone(newAvatarState.value)!,
				),
			);
		}

		if(Object.keys(mainChanges).length > 0) calls.push(conn.changeRoomConfig(props.room, mainChanges));

		await Promise.all(calls);

		dialogCtx.close();
	});

	const saveDisabled = useComputed(() => submitting.value || newAvatarState.value.state !== "done");

	return <form style={{display: "flex", flexDirection: "column"}} onSubmit={submit}>
		<div>
			<Field>
				<FieldLabel>{$t({defaultMessage: "Name"})}</FieldLabel>
				<Input autofocus value={info.name} onChange={onChangeName} />
			</Field>
			<Field>
				<FieldLabel>{$t({defaultMessage: "Publishing"})}</FieldLabel>
				<Select value={info.publishing} onChange={onChangePublishing}>
					{
						Object.keys(publishingTypeNames).map(key_ => {
							const key = key_ as keyof typeof publishingTypeNames;
							return <option key={key} value={key}>{$t(publishingTypeNames[key])}</option>;
						})
					}
				</Select>
			</Field>
			<Field>
				<FieldLabel>{$t({defaultMessage: "Profile Picture"})}</FieldLabel>
				<Input type="file" onChange={onChangeNewAvatar} />
				<DataView state={newAvatarState}>
					{info => {
						return <AvatarView newInfo={info} roomJID={props.room} />;
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
	</form>;
}

function AvatarView(props: {newInfo: ConvertImageResult | null; roomJID: JID}) {
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
				<Avatar jid={props.roomJID} size="lg" /> :
				<RawAvatar src={newURL} size="lg" />
		}
	</div>;
}
