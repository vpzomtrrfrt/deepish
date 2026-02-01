import { describe, expect, test } from "vitest";

import { compareRanks } from "./lexrank";

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
