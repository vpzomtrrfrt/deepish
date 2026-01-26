import { Signal } from "@preact/signals";
import { ComponentChildren } from "preact";
import { useMemo } from "preact/hooks";

// Alternative to For from @preact/signals to work around preactjs/signals#853
export default function For<T>(props: {each: Signal<T[]>; children(item: T): ComponentChildren; static?: boolean}) {
	// Reset cache when renderer changes to ensure its referenced values are reflected, unless static is passed
	const cache = useMemo(() => {
		return new Map();

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, props.static === true ? [] : [props.children]);

	const unused = new Set(cache.keys());

	const content = props.each.value.map(value => {
		let child = cache.get(value);
		if(typeof child === "undefined") {
			child = props.children(value);
			cache.set(value, child);
		}
		else {
			unused.delete(value);
		}

		return child;
	});

	unused.forEach(key => {
		cache.delete(key);
	});

	return content;
}
