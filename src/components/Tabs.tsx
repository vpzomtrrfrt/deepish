import { css, cx } from "@emotion/css";
import { ComponentChild, ComponentChildren, createContext } from "preact";
import { useContext, useMemo, useState } from "preact/hooks";
import CallbackLink from "./CallbackLink";
import { themeVars } from "../util/theme";

const styles = {
	tabsList: css({
		display: "flex",
		alignItems: "end",
		justifyContent: "flex-start",
		gap: ".5rem",
		padding: ".25rem",
	}),

	tabLink: css({
		padding: ".5rem",
		position: "relative",
		textDecoration: "none",

		"&::after": {
			content: "\"\"",
			position: "absolute",
			bottom: 0,
			left: 0,
			width: "100%",
			height: ".25rem",
			borderRadius: ".125rem",
			transition: "background-color 300ms",
		},

		"&:hover": {
			"&::after": {
				backgroundColor: "#7f7f7f",
			},
		},

		"&.active": {
			"&::after": {
				backgroundColor: themeVars.highlightOutline,
			},
		},
	}),
};

interface TabsContext {
	tab: unknown;
	setTab(value: unknown): void;
}

const TabsContext = createContext<TabsContext | undefined>(undefined);

export function InnerTabsContainer<T>(props: {children: ComponentChildren; defaultTab: T}) {
	const [tab, setTab] = useState(props.defaultTab);
	return <ManualTabsContainer tab={tab} setTab={setTab} children={props.children} />;
}

export function ManualTabsContainer<T>(props: {children: ComponentChildren; tab: T; setTab(value: T): void}) {
	const ctx = useMemo(() => ({
		tab: props.tab,
		setTab: props.setTab,
	}), [props.tab, props.setTab]);

	return <TabsContext.Provider value={ctx}>{props.children}</TabsContext.Provider>;
}

export function TabsList(props: {children: ComponentChildren}) {
	return <nav class={styles.tabsList}>
		{props.children}
	</nav>;
}

export function TabLink<T>(props: {tab: T; children: ComponentChildren}) {
	const ctx = useContext(TabsContext)!;

	return <CallbackLink
		callback={ctx.setTab}
		value={props.tab}
		class={cx(styles.tabLink, ctx.tab === props.tab && "active")}
	>
		{props.children}
	</CallbackLink>;
}

export function Tab<T>(props: {tab: T; children: ComponentChild}) {
	const ctx = useContext(TabsContext)!;

	if(ctx.tab === props.tab) return props.children;
	else return null;
}
