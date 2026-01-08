import { css } from "@emotion/css";
import { mdiClose } from "@mdi/js";
import { ComponentChildren, createContext } from "preact";
import { useContext } from "preact/hooks";

import { themeVars } from "../util/theme";
import Icon from "./Icon";
import IconButton from "./IconButton";

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
		marginBlockStart: ".5rem",
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
