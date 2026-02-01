import xml, { Element } from "@xmpp/xml";
import { describe, expect, test } from "vitest";

import { parseMarkdown, renderMarkdownToXHTML } from "./markdown";

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
});
