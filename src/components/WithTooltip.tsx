import { Tooltip } from "@base-ui/react/tooltip";
import { css } from "@emotion/css";
import { ComponentChildren, JSX } from "preact";

import { useAppContext } from "..";
import { themeVars } from "../util/theme";

const styles = {
	popup: css({
		display: "flex",
		flexDirection: "column",
		padding: "0.25rem 0.5rem",
		borderRadius: "0.375rem",
		backgroundColor: themeVars.bg1,
		borderColor: themeVars.outline1,
		borderStyle: "solid",
		borderWidth: "1px",
	}),
};

export default function WithTooltip(props: {
	children: JSX.Element;
	tooltip: ComponentChildren;

	instant?: boolean;
	side?: Tooltip.Positioner.Props["side"];
}) {
	const appCtx = useAppContext();

	return <Tooltip.Root>
		<Tooltip.Trigger render={<span>{props.children}</span>} delay={props.instant === false ? 600 : 0} />
		<Tooltip.Portal container={appCtx.portalContainerRef}>
			<Tooltip.Positioner side={props.side}>
				<Tooltip.Popup className={styles.popup}>
					{props.tooltip}
				</Tooltip.Popup>
			</Tooltip.Positioner>
		</Tooltip.Portal>
	</Tooltip.Root>;
}
