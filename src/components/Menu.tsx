import { Menu as BaseMenu } from "@base-ui-components/react/menu";
import { ComponentChildren } from "preact";
import IconButton from "./IconButton";
import { mdiDotsVertical } from "@mdi/js";
import Icon from "./Icon";
import unsignal from "../util/unsignal";
import { css, cx } from "@emotion/css";
import { themeVars } from "../util/theme";
import { useAppContext } from "..";

const styles = {
	popup: css({
		backgroundColor: themeVars.bg1,
		borderStyle: "solid",
		borderColor: themeVars.outline1,
		borderWidth: "1px",
		paddingBlock: ".25rem",
		borderRadius: ".25rem",
	}),
	item: css({
		paddingInline: ".5rem",
		paddingBlock: ".25rem",
		userSelect: "none",
		whiteSpace: "nowrap",

		"&[data-highlighted]": {
			backgroundColor: themeVars.hoverOverlay,
		},
	}),
};

export default function Menu(props: {
	children: ComponentChildren;
}) {
	const appCtx = useAppContext();

	return <BaseMenu.Root>
		<BaseMenu.Trigger render={IconButton}>
			<Icon path={mdiDotsVertical} />
		</BaseMenu.Trigger>
		<BaseMenu.Portal container={appCtx.portalContainerRef}>
			<BaseMenu.Positioner>
				<BaseMenu.Popup class={styles.popup}>
					{props.children}
				</BaseMenu.Popup>
			</BaseMenu.Positioner>
		</BaseMenu.Portal>
	</BaseMenu.Root>;
}

export function MenuItem(props: Omit<BaseMenu.Item.Props, "className">) {
	return <BaseMenu.Item {...props} className={cx(styles.item, unsignal(props.class))} />;
}
