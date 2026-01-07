import { css } from "@emotion/css";
import { VNode } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { forwardRef } from "preact/compat";
import { DialogContext } from "./Dialog";

export interface DialogContainerRef {
	showDialog(content: VNode): void;
	closeAll(): void;
}

interface DialogInfo {
	key: string;
	content: VNode;
}

const styles = {
	wrapper: css({
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		backgroundColor: "rgba(0, 0, 0, .5)",

		display: "flex",
		flexDirection: "column",
		justifyContent: "center",
		alignItems: "center",
	}),
};

export default forwardRef<DialogContainerRef>(function DialogContainer(_, ref) {
	const [dialogs, setDialogs] = useState<DialogInfo[]>([]);

	const close = useCallback((key: string) => {
		setDialogs(current => current.filter(x => x.key !== key));
	}, []);

	const refValue = useMemo((): DialogContainerRef => ({
		showDialog(content) {
			setDialogs(current => [...current, {key: Math.random().toString(), content}]);
		},
		closeAll() {
			setDialogs([]);
		},
	}), []);

	useEffect(() => {
		if(typeof ref === "function") {
			ref(refValue);
		}
		else if(ref !== null) {
			ref.current = refValue;
		}
	}, [refValue, ref]);

	return <div>
		{
			dialogs.map(info => {
				return <DialogWrapper dialog={info} close={close} />;
			})
		}
	</div>;
});

function DialogWrapper(props: {dialog: DialogInfo; close(key: string): void}) {
	const close = useMemo(() => props.close.bind(undefined, props.dialog.key), [props.close, props.dialog.key]);

	const ctx = useMemo((): DialogContext => ({
		close,
	}), [close]);

	const onClick = useCallback((evt: Event) => {
		if(evt.currentTarget === evt.target) {
			close();
		}
	}, [close]);

	return <div key={props.dialog.key} class={styles.wrapper} onClick={onClick}>
		<DialogContext.Provider value={ctx}>
			{props.dialog.content}
		</DialogContext.Provider>
	</div>;
}
