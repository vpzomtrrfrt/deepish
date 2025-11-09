import { useEffect } from "preact/hooks";

export default function useEffectOnce(fn: () => void) {
	useEffect(fn, []);
}
