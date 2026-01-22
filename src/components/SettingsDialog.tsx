import { JSX } from "preact";
import { useCallback, useContext } from "preact/hooks";
import { useIntl } from "react-intl";

import { DEFAULT_NOTIFICATIONS_SETTINGS, NOTIFICATION_LEVEL_NAMES, useAppContext } from "..";
import { NotificationLevel } from "../util/connection";
import { msgClose } from "../util/langCommon";
import Button from "./Button";
import DataView, { ErrorAlert } from "./DataView";
import Dialog, { DialogContext, DialogFooter } from "./Dialog";
import Field, { FieldLabel } from "./Field";
import Select from "./Select";

export default function SettingsDialog() {
	const { $t } = useIntl();

	const appCtx = useAppContext();

	const dialogCtx = useContext(DialogContext)!;

	return <Dialog>
		<h1>{$t({defaultMessage: "Settings"})}</h1>
		<h2>{$t({defaultMessage: "Notifications"})}</h2>
		<DataView state={appCtx.notificationsPermissionState}>
			{state => {
				if(state === "prompt" || state === "denied") {
					return <div>
						<Button tier="secondary" onClick={appCtx.requestNotificationsPermission}>
							{$t({defaultMessage: "Enable Notifications"})}
						</Button>
					</div>;
				}
				else if(state === "granted") {
					return <NotificationsSettingsArea />;
				}
				else {
					return <ErrorAlert error="Unknown state" />;
				}
			}}
		</DataView>
		<DialogFooter>
			<Button tier="secondary" onClick={dialogCtx.close}>{$t(msgClose)}</Button>
		</DialogFooter>
	</Dialog>;
}

function NotificationsSettingsArea() {
	const { $t } = useIntl();

	const appCtx = useAppContext();

	const settings = {...DEFAULT_NOTIFICATIONS_SETTINGS, ...appCtx.notificationsSettings};

	const onChangeDirect = useCallback((evt: JSX.TargetedEvent<HTMLSelectElement>) => {
		const newValue = evt.currentTarget.value as NotificationLevel;
		appCtx.setNotificationsSettings.call(undefined, current => ({...current, direct: newValue}));
	}, [appCtx.setNotificationsSettings]);

	const onChangeRoom = useCallback((evt: JSX.TargetedEvent<HTMLSelectElement>) => {
		const newValue = evt.currentTarget.value as NotificationLevel;
		appCtx.setNotificationsSettings.call(undefined, current => ({...current, room: newValue}));
	}, [appCtx.setNotificationsSettings]);

	return <div>
		<Field>
			<FieldLabel>{$t({defaultMessage: "Direct Messages"})}</FieldLabel>
			<Select value={settings.direct} onChange={onChangeDirect}>
				<option value={NotificationLevel.Never}>{$t(NOTIFICATION_LEVEL_NAMES[NotificationLevel.Never])}</option>
				<option value={NotificationLevel.Always}>{$t(NOTIFICATION_LEVEL_NAMES[NotificationLevel.Always])}</option>
			</Select>
		</Field>
		<Field>
			<FieldLabel>{$t({defaultMessage: "Channels"})}</FieldLabel>
			<Select value={settings.room} onChange={onChangeRoom}>
				<option value={NotificationLevel.Never}>{$t(NOTIFICATION_LEVEL_NAMES[NotificationLevel.Never])}</option>
				<option value={NotificationLevel.Always}>{$t(NOTIFICATION_LEVEL_NAMES[NotificationLevel.Always])}</option>
			</Select>
		</Field>
	</div>;
}
