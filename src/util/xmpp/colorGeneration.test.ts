import { expect, test } from "vitest";

import { generateColorForID } from "./colorGeneration";

test("juliet@capulet.lit", () => {
	expect(generateColorForID("juliet@capulet.lit")).toBe("#00bcd1");
});
