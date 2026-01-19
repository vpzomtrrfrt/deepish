import { useEffect } from "preact/hooks";

import { StringLiteral } from "./typeUtil";

export default function useEventHandler<
	K,
	E,
	T extends {
		addEventListener(key: K, fn: (evt: E) => void): void;
		removeEventListener(key: K, fn: (evt: E) => void): void;
	}
>(src: T, key: StringLiteral<K>, fn: (evt: E) => void) {
	useEffect(() => {
		src.addEventListener(key, fn);

		return () => {
			src.removeEventListener(key, fn);
		};
	}, [src, key, fn]);
}
