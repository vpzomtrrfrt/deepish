import { css } from "@emotion/css";
import { VNode } from "preact";
import { forwardRef } from "preact/compat";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";

import { DialogContext } from "./Dialog";

export interface DialogContainerRef {
	showDialog(content: VNode): void;
	closeAll(): void;
}

interface DialogInfo {
	key: string;
	content: VNode;
	lastFocusBefore: Element | null;
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
			setDialogs(current => {
				return [...current, {key: Math.random().toString(), content, lastFocusBefore: document.activeElement}];
			});
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
				return <DialogWrapper dialog={info} close={close} lastFocusBefore={info.lastFocusBefore} />;
			})
		}
	</div>;
});

function DialogWrapper(props: {dialog: DialogInfo; close(key: string): void; lastFocusBefore: Element | null}) {
	const close = useMemo(() => props.close.bind(undefined, props.dialog.key), [props.close, props.dialog.key]);

	const ctx = useMemo((): DialogContext => ({
		close,
	}), [close]);

	const onClick = useCallback((evt: Event) => {
		if(evt.currentTarget === evt.target) {
			close();
		}
	}, [close]);

	const onKeyDown = useCallback((evt: KeyboardEvent) => {
		console.log("dialog key down", evt);

		if(evt.code === "Escape" && !evt.defaultPrevented) {
			close();
		}
	}, [close]);

	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const elem = dialogRef.current!;
		const lastFocusBefore = props.lastFocusBefore;

		if(!elem.contains(document.activeElement)) {
			elem.focus();
		}

		return () => {
			console.log("last focus was", lastFocusBefore);

			if(
				(document.activeElement === null || elem.contains(document.activeElement)) &&
					lastFocusBefore !== null &&
					"focus" in lastFocusBefore
			) {
				setTimeout(() => {
					(lastFocusBefore as unknown as HTMLOrSVGElement).focus();
				});

			}
		};
	}, [props.lastFocusBefore]);

	return <div
		tabindex={-1}
		key={props.dialog.key}
		class={styles.wrapper}
		onClick={onClick}
		ref={dialogRef}
		onKeyDown={onKeyDown}
	>
		<DialogContext.Provider value={ctx}>
			{props.dialog.content}
		</DialogContext.Provider>
	</div>;
}
