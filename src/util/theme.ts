import type * as csstype from "csstype";

enum Theme {
	Light = "light",
	Dark = "dark"
}

const src = {
	bg0: {light: "#fafafa", dark: "#1d1d1d"},
	bg1: {light: "#fff", dark: "#121212"},
	bg1Hover: {light: "#eee", dark: "#333"},
	outline1: {light: "#ddd", dark: "#444"},
	focusOutline: "#3949AB",
	highlightOutline: {light: "#000", dark: "#fff"},
	active: {light: "#aaa", dark: "#383838"},
	hoverOverlay: {light: "rgba(0, 0, 0, 0.25)", dark: "rgba(255, 255, 255, 0.12)"},
	textLight: "#fff",
	textOn1: {light: "#000", dark: "#eee"},
	link: {light: "#3F51B5", dark: "#7986CB"},
} satisfies Record<string, Record<Theme, csstype.DataType.Color> | csstype.DataType.Color>;

const themeVars = {} as {
	[K in keyof typeof src]: string & {};
};

const themeCSS: {
	[K in Theme]: Record<string, string | number>;
} = {
	light: {},
	dark: {},
};

for(const key in src) {
	themeVars[key as keyof typeof src] = "var(--" + key + ")";

	const value = src[key as keyof typeof src];

	themeCSS.light["--" + key] = typeof value === "object" ? value.light : value;
	themeCSS.dark["--" + key] = typeof value === "object" ? value.dark : value;
}

export { themeCSS, themeVars };
