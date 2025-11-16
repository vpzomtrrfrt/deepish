import type * as csstype from "csstype";

const src = {
	bg1: {light: "#fff"},
	outline1: {light: "#ddd"},
	highlightOutline: {light: "#000"},
} satisfies Record<string, {light: csstype.DataType.Color}>;

const themeVars = {} as {
	[K in keyof typeof src]: string & {};
};

const themeCSS: {
	[K in "light"]: Record<string, string | number>;
} = {
	light: {},
};

for(const key in src) {
	themeVars[key as keyof typeof src] = "var(--" + key + ")";

	themeCSS.light["--" + key] = src[key as keyof typeof src].light;
}

export { themeCSS, themeVars };
