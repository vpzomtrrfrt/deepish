import { expect, test } from "vitest";

import matchLocale from "./matchLocale";

test("no wants", () => {
	expect(matchLocale([], ["eo-UY"])).toBe(null);
});

test("exact match", () => {
	expect(matchLocale(["eo-UY"], ["eo-UY", "en"])).toBe("eo-UY");
});

test("non-variant", () => {
	expect(matchLocale(["eo-UY"], ["eo", "en"])).toBe("eo");
});

test("only variant", () => {
	expect(matchLocale(["eo"], ["eo-UY", "en"])).toBe("eo-UY");
});

test("no match", () => {
	expect(matchLocale(["eo-UY"], ["en"])).toBe(null);
});
