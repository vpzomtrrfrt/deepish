import { ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { useIntl } from "react-intl";

import { msgCancel } from "../util/langCommon";
import useSubmitting from "../util/useSubmitting";
import Button from "./Button";
import Dialog, { DialogContext, DialogFooter } from "./Dialog";

export default function ConfirmTaskDialog(props: {
	submit(): Promise<void>;
	children: ComponentChildren;
	confirmText: string;
}) {
	const { $t } = useIntl();

	const dialogCtx = useContext(DialogContext)!;

	const [submitting, submit] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		await props.submit.call(undefined);
		dialogCtx.close.call(undefined);
	});

	return <Dialog>
		<form style={{display: "flex", flexDirection: "column"}} onSubmit={submit}>
			<div>
				{props.children}
			</div>
			<DialogFooter>
				<Button tier="secondary" onClick={dialogCtx.close}>{$t(msgCancel)}</Button>
				<Button tier="primary" type="submit" disabled={submitting}>{props.confirmText}</Button>
			</DialogFooter>
		</form>
	</Dialog>;
}
