import { useContext } from "preact/hooks";
import { useIntl } from "react-intl";

import { useAppContext } from "..";
import { msgClose } from "../util/langCommon";
import Button from "./Button";
import DataView, { ErrorAlert } from "./DataView";
import Dialog, { DialogContext, DialogFooter } from "./Dialog";

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
					return <div>
						{$t({defaultMessage: "Notifications are active."})}
					</div>;
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
