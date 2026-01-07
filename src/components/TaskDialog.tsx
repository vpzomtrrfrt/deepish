import { useContext, useEffect, useState } from "preact/hooks";
import Dialog, { DialogContext } from "./Dialog";
import { ComponentChildren } from "preact";
import useLatestCallback from "use-latest-callback";
import { ErrorAlert } from "./DataView";

export default function TaskDialog(props: {task: Promise<void>; children: ComponentChildren}) {
	const dialogCtx = useContext(DialogContext)!;

	const onComplete = useLatestCallback(() => {
		dialogCtx.close();
	});

	const [error, setError] = useState<unknown>(null);

	useEffect(() => {
		props.task
			.then(onComplete)
			.catch(err => {
				setError(err);
			});
	}, [onComplete, props.task]);

	return <Dialog>
		<div>
			{error === null ? props.children : <ErrorAlert error={error} />}
		</div>
	</Dialog>;
}
