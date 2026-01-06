import { useCallback, useContext } from "preact/hooks";
import Dialog, { DialogContext, DialogFooter } from "./Dialog";
import { ComponentChildren } from "preact";

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
				<button type="button" onClick={dialogCtx.close}>Cancel</button>
				<button type="submit">{props.confirmText}</button>
			</DialogFooter>
		</form>
	</Dialog>;
}
