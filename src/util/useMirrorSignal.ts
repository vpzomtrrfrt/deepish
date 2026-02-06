import { ReadonlySignal, useComputed } from "@preact/signals";
import { useLiveSignal } from "@preact/signals/utils";
import { Signalish } from "preact";

import unsignal from "./unsignal";

export default function useMirrorSignal<T>(
	src: Signalish<T extends {value: unknown; peek: unknown} ? never : T>,
): ReadonlySignal<T> {
	const srcSig = useLiveSignal(src);

	return useComputed(() => unsignal(srcSig.value));
}
