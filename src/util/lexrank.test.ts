import { describe, expect, test } from "vitest";

import { compareRanks, genRankBetween } from "./lexrank";

describe("compareRanks", () => {
	test("single-character ranks", () => {
		expect(compareRanks("a", "b")).toBeLessThan(0);
		expect(compareRanks("b", "a")).toBeGreaterThan(0);
	});

	test("two-character ranks", () => {
		expect(compareRanks("AA", "BB")).toBeLessThan(0);
		expect(compareRanks("BB", "AA")).toBeGreaterThan(0);
		expect(compareRanks("AB", "AA")).toBeGreaterThan(0);
	});

	test("mixed-length ranks", () => {
		expect(compareRanks("A", "AA")).toBeLessThan(0);
		expect(compareRanks("B", "AA")).toBeGreaterThan(0);
		expect(compareRanks("AA", "A")).toBeGreaterThan(0);
		expect(compareRanks("AA", "B")).toBeLessThan(0);
	});

	test("zero-length rank", () => {
		expect(compareRanks("", "a")).toBeLessThan(0);
		expect(compareRanks("a", "")).toBeGreaterThan(0);
	});
});

describe("genRankBetween", () => {
	test("single-character ranks", () => {
		expect(genRankBetween("a", "e")).toBe("c");
	});

	test("same until last character", () => {
		expect(genRankBetween("Aa", "Ae")).toBe("Ac");
	});

	test("different first character", () => {
		expect(genRankBetween("Aa", "Ca")).toBe("B");
	});

	test("no start anchor", () => {
		expect(genRankBetween(null, "F")).toBe("C");
		expect(genRankBetween(null, "#")).toBe("\"");
	});

	test("no end anchor", () => {
		expect(genRankBetween("F", null)).toBe("b");
		expect(genRankBetween("#", null)).toBe("2");
	});

	test("mixed-length ranks", () => {
		expect(genRankBetween("AA", "C")).toBe("B");
		expect(genRankBetween("A", "CC")).toBe("B");
	});

	test("mixed-length ranks with same first character", () => {
		expect(genRankBetween("A", "AE")).toBe("A3");
	});

	test("quasi-adjacent ranks", () => {
		expect(genRankBetween("A", "B")).toBe("A@");
	});

	test("truly adjacent ranks", () => {
		expect(() => genRankBetween("A", "A\0")).toThrow();
	});

	test("bad arguments", () => {
		expect(() => genRankBetween(null, null)).toThrow();
		expect(() => genRankBetween("C", "A")).toThrow();
		expect(() => genRankBetween("Ac", "A")).toThrow();
	});
});
