import { effect } from "@preact/signals";
import { expect, test, vi } from "vitest";

import SignalMap from "./SignalMap";

test("should work like a map", () => {
	const map = new SignalMap();

	expect(Array.from(map.entries())).toHaveLength(0);
	expect(Array.from(map.keys())).toHaveLength(0);
	expect(Array.from(map.values())).toHaveLength(0);

	expect(map.has("foo")).toBe(false);
	expect(map.get("foo")).toBeUndefined();

	map.set("foo", "bar");

	expect(map.has("foo")).toBe(true);
	expect(map.get("foo")).toEqual("bar");
	expect(map.get("bar")).toBeUndefined();
	{
		const entries = Array.from(map.entries());
		expect(entries).toHaveLength(1);
		expect(entries[0][0]).toEqual("foo");
		expect(entries[0][1]).toEqual("bar");
	}
	expect(Array.from(map.keys())).toHaveLength(1);
	expect(Array.from(map.values())).toHaveLength(1);
});

test("should trigger signal updates", () => {
	const map = new SignalMap();
	map.set("key", 0);

	const fn = vi.fn();

	effect(() => {
		fn(map.get("key"));
	});

	map.set("key", 1);

	expect(fn).toHaveBeenCalledTimes(2);
	expect(fn).toHaveBeenNthCalledWith(1, 0);
	expect(fn).toHaveBeenNthCalledWith(2, 1);
});

test("should trigger signal updates when initially missing", () => {
	const map = new SignalMap();

	const fn = vi.fn();

	effect(() => {
		fn(map.get("key"));
	});

	map.set("key", 1);

	expect(fn).toHaveBeenCalledTimes(2);
	expect(fn).toHaveBeenNthCalledWith(1, undefined);
	expect(fn).toHaveBeenNthCalledWith(2, 1);
});

test("should trigger signal updates on has", () => {
	const map = new SignalMap();

	const fn = vi.fn();

	effect(() => {
		fn(map.has("key"));
	});

	map.set("key", 1);
	map.delete("key");

	expect(fn).toHaveBeenCalledTimes(3);
	expect(fn).toHaveBeenNthCalledWith(1, false);
	expect(fn).toHaveBeenNthCalledWith(2, true);
	expect(fn).toHaveBeenNthCalledWith(3, false);
});

test("should trigger signal updates on entries", () => {
	const map = new SignalMap();
	map.set("foo", "bar");

	const fn = vi.fn();

	effect(() => {
		fn(Array.from(map.entries()));
	});

	map.set("bar", "baz");
	map.delete("foo");

	expect(fn).toHaveBeenCalledTimes(3);
	expect(fn).toHaveBeenNthCalledWith(1, [["foo", "bar"]]);
	expect(fn).toHaveBeenNthCalledWith(2, [["foo", "bar"], ["bar", "baz"]]);
	expect(fn).toHaveBeenNthCalledWith(3, [["bar", "baz"]]);
});
