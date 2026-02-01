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
