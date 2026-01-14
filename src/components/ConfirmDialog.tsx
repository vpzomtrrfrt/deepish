import { ComponentChildren } from "preact";
import { useCallback, useContext } from "preact/hooks";
import { useIntl } from "react-intl";

import { msgCancel } from "../util/langCommon";
import Button from "./Button";
import Dialog, { DialogContext, DialogFooter } from "./Dialog";

export default function ConfirmDialog(props: {onConfirm(): void; children: ComponentChildren; confirmText: string}) {
	const { $t } = useIntl();

	const dialogCtx = useContext(DialogContext)!;

	const onConfirm = useCallback((evt: Event) => {
		evt.preventDefault();

		props.onConfirm.call(undefined);

		dialogCtx.close.call(undefined);
	}, [dialogCtx.close, props.onConfirm]);

	return <Dialog>
		<form style={{display: "flex", flexDirection: "column"}} onSubmit={onConfirm}>
			<div>
				{props.children}
			</div>
			<DialogFooter>
				<Button tier="secondary" onClick={dialogCtx.close}>{$t(msgCancel)}</Button>
				<Button tier="primary" type="submit">{props.confirmText}</Button>
			</DialogFooter>
		</form>
	</Dialog>;
}
