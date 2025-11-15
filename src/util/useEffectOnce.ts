import { useEffect } from "preact/hooks";

export default function useEffectOnce(fn: () => void) {
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(fn, []);
}
