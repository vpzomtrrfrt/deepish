import { useCallback, useContext } from "preact/hooks";
import Dialog, { DialogContext, DialogFooter } from "./Dialog";
import { ComponentChildren } from "preact";
import Button from "./Button";

export default function ConfirmDialog(props: {onConfirm(): void; children: ComponentChildren; confirmText: string}) {
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
				<Button tier="secondary" onClick={dialogCtx.close}>Cancel</Button>
				<Button tier="primary" type="submit">{props.confirmText}</Button>
			</DialogFooter>
		</form>
	</Dialog>;
}
