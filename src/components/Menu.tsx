import { Menu as BaseMenu } from "@base-ui/react/menu";
import { css, cx } from "@emotion/css";
import { mdiCheck, mdiDotsVertical } from "@mdi/js";
import { ComponentChildren } from "preact";

import { useAppContext } from "..";
import { themeVars } from "../util/theme";
import unsignal from "../util/unsignal";
import Icon from "./Icon";
import IconButton from "./IconButton";

export const styles = {
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
		whiteSpace: "nowrap",

		userSelect: "none",
		cursor: "pointer",

		display: "flex",
		alignItems: "center",
		lineHeight: 1.3,

		"&[data-highlighted]": {
			backgroundColor: themeVars.hoverOverlay,
		},
	}),
	itemRadioIndicatorArea: css({
		width: "1rem",
		marginInlineEnd: ".25rem",

		lineHeight: 0,
	}),
	groupLabel: css({
		paddingInline: ".5rem",
		fontWeight: "bold",
	}),
};

export default function Menu(props: {
	children: ComponentChildren;
	onOpenChange?(value: boolean): void;
}) {
	const appCtx = useAppContext();

	return <BaseMenu.Root onOpenChange={props.onOpenChange}>
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

export function Submenu(props: {
	children: ComponentChildren;
	label: ComponentChildren;
}) {
	const appCtx = useAppContext();

	return <BaseMenu.SubmenuRoot>
		<BaseMenu.SubmenuTrigger className={styles.item}>
			{props.label}
		</BaseMenu.SubmenuTrigger>
		<BaseMenu.Portal container={appCtx.portalContainerRef}>
			<BaseMenu.Positioner>
				<BaseMenu.Popup class={styles.popup}>
					{props.children}
				</BaseMenu.Popup>
			</BaseMenu.Positioner>
		</BaseMenu.Portal>
	</BaseMenu.SubmenuRoot>;
}

export function MenuItem(props: Omit<BaseMenu.Item.Props, "className">) {
	return <BaseMenu.Item {...props} className={cx(styles.item, unsignal(props.class))} />;
}

export function MenuRadioGroup(props: Omit<BaseMenu.RadioGroup.Props, "className" | "style">) {
	return <BaseMenu.Group {...props} render={<BaseMenu.RadioGroup />} />;
}

export function MenuRadioItem(props: Omit<BaseMenu.RadioItem.Props, "className">) {
	return <BaseMenu.RadioItem {...props} className={cx(styles.item, unsignal(props.class))}>
		<div class={styles.itemRadioIndicatorArea}>
			<BaseMenu.RadioItemIndicator>
				<Icon path={mdiCheck} />
			</BaseMenu.RadioItemIndicator>
		</div>
		{props.children}
	</BaseMenu.RadioItem>;
}

export function MenuGroupLabel(props: Omit<BaseMenu.GroupLabel.Props, "className">) {
	return <BaseMenu.GroupLabel {...props} className={cx(styles.groupLabel, unsignal(props.class))} />;
}
