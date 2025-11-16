import { Tooltip } from "@base-ui-components/react";
import { css } from "@emotion/css";
import { ComponentChildren, JSX } from "preact";

import { themeVars } from "../util/theme";
import { useAppContext } from "..";

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

	side?: Tooltip.Positioner.Props["side"];
}) {
	const appCtx = useAppContext();

	return <Tooltip.Root delay={0} hoverable={false}>
		<Tooltip.Trigger render={<span>{props.children}</span>} />
		<Tooltip.Portal container={appCtx.portalContainerRef}>
			<Tooltip.Positioner side={props.side}>
				<Tooltip.Popup className={styles.popup}>
					{props.tooltip}
				</Tooltip.Popup>
			</Tooltip.Positioner>
		</Tooltip.Portal>
	</Tooltip.Root>;
}
