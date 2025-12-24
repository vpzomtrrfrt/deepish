import { Signalish } from "preact";

export default function unsignal<T>(src: Signalish<T extends {value: unknown} ? never : T>): T {
	if(typeof src === "object" && src !== null && "value" in src) {
		return src.value as T;
	}
	else return src as T;
}
