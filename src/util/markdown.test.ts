import xml, { Element } from "@xmpp/xml";
import { describe, expect, test } from "vitest";

import { parseMarkdown, renderMarkdownTo0393, renderMarkdownToXHTML } from "./markdown";

expect.addEqualityTesters([
	(a: unknown, b: unknown) => {
		if(a instanceof Element && b instanceof Element) {
			return a.toString() === b.toString();
		}
		else {
			return undefined;
		}
	},
]);

describe("renderMarkdownToXHTML", () => {
	test("simple text", () => {
		expect(renderMarkdownToXHTML(parseMarkdown("text"))).toEqual(
			xml(
				"body",
				"http://www.w3.org/1999/xhtml",
				"text",
			),
		);
	});

	test("multiple paragraphs", () => {
		expect(renderMarkdownToXHTML(parseMarkdown("text\n\nmore text"))).toEqual(
			xml(
				"body",
				"http://www.w3.org/1999/xhtml",
				xml("p", {}, "text"),
				xml("p", {}, "more text"),
			),
		);
	});

	test("strikethrough", () => {
		expect(renderMarkdownToXHTML(parseMarkdown("~~struck~~"))).toEqual(
			xml(
				"body",
				"http://www.w3.org/1999/xhtml",
				xml("span", {style: "text-decoration: line-through"}, "struck"),
			),
		);
	});

	test("ol", () => {
		expect(renderMarkdownToXHTML(parseMarkdown("1. first\n2. second"))).toEqual(
			xml(
				"body",
				"http://www.w3.org/1999/xhtml",
				xml(
					"ol",
					{},
					xml("li", {}, xml("p", {}, "first")),
					xml("li", {}, xml("p", {}, "second")),
				),
			),
		);
	});

	test("ol with non-1 start", () => {
		expect(renderMarkdownToXHTML(parseMarkdown("2. first\n3. second"))).toEqual(
			xml(
				"body",
				"http://www.w3.org/1999/xhtml",
				xml(
					"ol",
					{start: "2"},
					xml("li", {}, xml("p", {}, "first")),
					xml("li", {}, xml("p", {}, "second")),
				),
			),
		);
	});

	test("strong", () => {
		expect(renderMarkdownToXHTML(parseMarkdown("**AAAA**"))).toEqual(
			xml(
				"body",
				"http://www.w3.org/1999/xhtml",
				xml(
					"strong",
					{},
					"AAAA",
				),
			),
		);
	});

	test("em", () => {
		expect(renderMarkdownToXHTML(parseMarkdown("*ducks*"))).toEqual(
			xml(
				"body",
				"http://www.w3.org/1999/xhtml",
				xml(
					"em",
					{},
					"ducks",
				),
			),
		);
	});

	test("inline code", () => {
		expect(renderMarkdownToXHTML(parseMarkdown("`var`"))).toEqual(
			xml(
				"body",
				"http://www.w3.org/1999/xhtml",
				xml(
					"code",
					{},
					"var",
				),
			),
		);
	});

	test("newline", () => {
		expect(renderMarkdownToXHTML(parseMarkdown("a\nb"))).toEqual(
			xml(
				"body",
				"http://www.w3.org/1999/xhtml",
				"a",
				xml("br"),
				"b",
			),
		);
	});

	test("blockquote", () => {
		expect(renderMarkdownToXHTML(parseMarkdown("> quoted"))).toEqual(
			xml(
				"body",
				"http://www.w3.org/1999/xhtml",
				xml(
					"blockquote",
					{},
					xml(
						"p",
						{},
						"quoted",
					),
				),
			),
		);
	});

	test("code", () => {
		expect(renderMarkdownToXHTML(parseMarkdown("```\ncode\n```"))).toEqual(
			xml(
				"body",
				"http://www.w3.org/1999/xhtml",
				xml(
					"pre",
					{},
					xml(
						"code",
						{},
						"code\n",
					),
				),
			),
		);
	});

	test("linkify", () => {
		expect(renderMarkdownToXHTML(parseMarkdown("https://dogeon.xyz"))).toEqual(
			xml(
				"body",
				"http://www.w3.org/1999/xhtml",
				xml(
					"a",
					{href: "https://dogeon.xyz"},
					"https://dogeon.xyz",
				),
			),
		);
	});
});

describe("renderMarkdownTo0393", () => {
	test("text", () => {
		expect(renderMarkdownTo0393(parseMarkdown("text"))).toBe("text");
	});

	test("blockquote", () => {
		expect(renderMarkdownTo0393(parseMarkdown("> text"))).toBe("> text");
	});

	test("multiline blockquote", () => {
		expect(renderMarkdownTo0393(parseMarkdown("> text\n> more text"))).toBe("> text\n> more text");
	});

	test("ul", () => {
		expect(renderMarkdownTo0393(parseMarkdown("- a\n- list"))).toBe("* a\n* list");
	});

	test("ol", () => {
		expect(renderMarkdownTo0393(parseMarkdown("1. first\n2. second"))).toBe("1. first\n2. second");
	});

	test("ol with non-1 start", () => {
		expect(renderMarkdownTo0393(parseMarkdown("2. first\n3. second"))).toBe("2. first\n3. second");
	});

	test("code", () => {
		expect(renderMarkdownTo0393(parseMarkdown("```\n// do stuff\n```"))).toBe("```\n// do stuff\n```");
	});

	test("inline code", () => {
		expect(renderMarkdownTo0393(parseMarkdown("`var`"))).toBe("`var`");
	});

	test("em", () => {
		expect(renderMarkdownTo0393(parseMarkdown("*ducks*"))).toBe("_ducks_");
	});

	test("strong", () => {
		expect(renderMarkdownTo0393(parseMarkdown("**AAAA**"))).toBe("*AAAA*");
	});

	test("strikethrough", () => {
		expect(renderMarkdownTo0393(parseMarkdown("~~struck~~"))).toBe("~struck~");
	});
});
