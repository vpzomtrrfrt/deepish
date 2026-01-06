import { css } from "@emotion/css";
import { ComponentChildren, createContext } from "preact";
import { themeVars } from "../util/theme";
import IconButton from "./IconButton";
import { mdiClose } from "@mdi/js";
import { useContext } from "preact/hooks";
import Icon from "./Icon";

export interface DialogContext {
	close(): void;
}

export const DialogContext = createContext<DialogContext | undefined>(undefined);

const styles = {
	dialog: css({
		minWidth: "10rem",
		backgroundColor: themeVars.bg1,
		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: themeVars.outline1,
		borderRadius: ".25rem",

		display: "flex",
		flexDirection: "column",
		padding: ".5rem",
	}),
	dialogHeader: css({
		display: "flex",
		justifyContent: "flex-end",
	}),
	dialogFooter: css({
		display: "flex",
		justifyContent: "flex-end",
		gap: ".5rem",
	}),
};

export default function Dialog(props: {children: ComponentChildren}) {
	const dialogCtx = useContext(DialogContext)!;

	return <div class={styles.dialog}>
		<div class={styles.dialogHeader}>
			<IconButton onClick={dialogCtx.close}><Icon path={mdiClose} /></IconButton>
		</div>
		{props.children}
	</div>;
}

export function DialogFooter(props: {children: ComponentChildren}) {
	return <div class={styles.dialogFooter}>{props.children}</div>;
}
