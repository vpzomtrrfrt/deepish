import { Popover as BasePopover } from "@base-ui/react/popover";
import { css } from "@emotion/css";
import { ComponentChildren } from "preact";

import { useAppContext } from "..";
import { themeVars } from "../util/theme";
import IconButton from "./IconButton";

const styles = {
	popup: css({
		backgroundColor: themeVars.bg1,
		borderStyle: "solid",
		borderColor: themeVars.outline1,
		borderWidth: "1px",
		paddingBlock: ".25rem",
		borderRadius: ".25rem",
	}),
};

export default function Popover(props: {children: ComponentChildren; icon: ComponentChildren}) {
	const appCtx = useAppContext();

	return <BasePopover.Root>
		<BasePopover.Trigger render={IconButton}>
			{props.icon}
		</BasePopover.Trigger>
		<BasePopover.Portal container={appCtx.portalContainerRef}>
			<BasePopover.Positioner>
				<BasePopover.Popup class={styles.popup}>
					{props.children}
				</BasePopover.Popup>
			</BasePopover.Positioner>
		</BasePopover.Portal>
	</BasePopover.Root>;
}
