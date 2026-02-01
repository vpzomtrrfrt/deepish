import { expect, test } from "vitest";

import { parse0393 } from "./styling";

test("text", () => {
	expect(parse0393("text")).toEqual([{
		type: "plain",
		children: [{type: "plain", text: "text"}],
	}]);
});

test("no formatting between blocks", () => {
	expect(
		parse0393("There are three blocks in this body, one per line,\nbut there is no *formatting\nas spans* may not escape blocks."),
	).toEqual([
		{
			type: "plain",
			children: [{type: "plain", text: "There are three blocks in this body, one per line,"}],
		},
		{
			type: "plain",
			children: [
				{type: "plain", text: "but there is no "},
				{type: "plain", text: "*"},
				{type: "plain", text: "formatting"},
			],
		},
		{
			type: "plain",
			children: [{type: "plain", text: "as spans* may not escape blocks."}],
		},
	]);
});

test("strong", () => {
	expect(parse0393("*strong span*")).toEqual([
		{
			type: "plain",
			children: [{type: "strong", children: [{type: "plain", text: "strong span"}]}],
		},
	]);
});

test("em", () => {
	expect(parse0393("plain _emphasis_ plain")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "plain "},
				{type: "em", children: [{type: "plain", text: "emphasis"}]},
				{type: "plain", text: " plain"},
			],
		},
	]);
});

test("inline pre", () => {
	expect(parse0393("use `const`")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "use "},
				{type: "pre", text: "const"},
			],
		},
	]);
});

test("styled inline pre", () => {
	expect(parse0393("This is *`monospace and bold`*")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "This is "},
				{type: "strong", children: [{type: "pre", text: "monospace and bold"}]},
			],
		},
	]);

	expect(parse0393("This is `*monospace*`")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "This is "},
				{type: "pre", text: "*monospace*"},
			],
		},
	]);
});

test("strikethrough", () => {
	expect(parse0393("Everyone ~dis~likes cake.")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "Everyone "},
				{type: "strikethrough", children: [{type: "plain", text: "dis"}]},
				{type: "plain", text: "likes cake."},
			],
		},
	]);
});

test("unmatched", () => {
	expect(parse0393("not strong*")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "not strong*"},
			],
		},
	]);

	expect(parse0393("*not strong")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "*"},
				{type: "plain", text: "not strong"},
			],
		},
	]);
});

test("empty span", () => {
	expect(parse0393("**")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "**"},
			],
		},
	]);

	expect(parse0393("***")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "**"},
				{type: "plain", text: "*"},
			],
		},
	]);

	expect(parse0393("****")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "**"},
				{type: "plain", text: "**"},
			],
		},
	]);

	expect(parse0393("__")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "__"},
			],
		},
	]);

	expect(parse0393("_")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "_"},
			],
		},
	]);

	expect(parse0393("~")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "~"},
			],
		},
	]);

	expect(parse0393("`")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "`"},
			],
		},
	]);
});

test("space rules", () => {
	expect(parse0393("*not *strong")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "*"},
				{type: "plain", text: "not "},
				{type: "plain", text: "*"},
				{type: "plain", text: "strong"},
			],
		},
	]);

	expect(parse0393("* plain *strong*")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "* plain "},
				{type: "strong", children: [{type: "plain", text: "strong"}]}
			],
		},
	]);

	expect(parse0393("*strong*plain*")).toEqual([
		{
			type: "plain",
			children: [
				{type: "strong", children: [{type: "plain", text: "strong"}]},
				{type: "plain", text: "plain*"},
			],
		},
	]);

	expect(parse0393("that`s not the right character")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "that`s not the right character"},
			],
		},
	]);
});

test("nested styles", () => {
	expect(parse0393("_*WHOMST. CALL*_")).toEqual([
		{
			type: "plain",
			children: [
				{
					type: "em",
					children: [
						{type: "strong", children: [{type: "plain", text: "WHOMST. CALL"}]},
					],
				},
			],
		},
	]);
});

test("pre block", () => {
	expect(parse0393("```\nvar\n```")).toEqual([{
		type: "pre",
		text: "var",
	}]);
});

test("pre block with ignored info", () => {
	expect(
		parse0393("```ignored\n(println 'Hello, world!')\n```"),
	).toEqual([{
		type: "pre",
		text: "(println 'Hello, world!')",
	}]);
});

test("pre block terminated by root", () => {
	expect(
		parse0393("```\ncontent"),
	).toEqual([{
		type: "pre",
		text: "content",
	}]);
});

test("pre block terminated by parent", () => {
	expect(
		parse0393("> ```\n> content\n\noutside"),
	).toEqual([
		{
			type: "quote",
			children: [{
				type: "pre",
				text: "content\n",
			}],
		},
		{
			type: "plain",
			children: [],
		},
		{
			type: "plain",
			children: [{type: "plain", text: "outside"}],
		},
	]);
});

test("starting pre block at end", () => {
	expect(
		parse0393("```"),
	).toEqual([
		{
			type: "pre",
			text: "",
		},
	]);
});

test("pre block containing backticks", () => {
	expect(
		parse0393("```\n```not yet\n```"),
	).toEqual([
		{
			type: "pre",
			text: "```not yet",
		},
	]);
});

test("quote", () => {
	expect(parse0393("> lol")).toEqual([
		{
			type: "quote",
			children: [{type: "plain", children: [{type: "plain", text: "lol"}]}],
		},
	]);
});

test("nested quote", () => {
	expect(
		parse0393(
			"> > That that is, is.\n> Said the old hermit of Prague.\n\nWho?",
		),
	).toEqual([
		{
			type: "quote",
			children: [
				{
					type: "quote",
					children: [{type: "plain", children: [{type: "plain", text: "That that is, is."}]}],
				},
				{type: "plain", children: [{type: "plain", text: "Said the old hermit of Prague."}]},
			],
		},
		{
			type: "plain",
			children: [],
		},
		{
			type: "plain",
			children: [{type: "plain", text: "Who?"}],
		},
	]);
});

test("quote without space", () => {
	expect(parse0393(">lmao, even")).toEqual([
		{
			type: "quote",
			children: [{type: "plain", children: [{type: "plain", text: "lmao, even"}]}],
		},
	]);
});

test("linkify", () => {
	expect(parse0393("linking to https://dogeon.xyz")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "linking to "},
				{type: "link", href: "https://dogeon.xyz", text: "https://dogeon.xyz"},
			],
		},
	]);
});

test("formatted linkify", () => {
	expect(parse0393("linking to *https://dogeon.xyz*")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "linking to "},
				{
					type: "strong",
					children: [
						{type: "link", href: "https://dogeon.xyz", text: "https://dogeon.xyz"},
					],
				},
			],
		},
	]);
});

test("link with multibyte char", () => {
	expect(parse0393("linking to https://emojipedia.org/🙃")).toEqual([
		{
			type: "plain",
			children: [
				{type: "plain", text: "linking to "},
				{type: "link", href: "https://emojipedia.org/🙃", text: "https://emojipedia.org/🙃"},
			],
		},
	]);
});
