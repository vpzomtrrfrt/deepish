import { useEffect, useRef, useState } from "preact/hooks";

export type LoadState<T> = {
	state: "loading";
} | {
	state: "error";
	error: unknown;
} | {
	state: "done";
	value: T;
};

export const LoadState = {
	loading: {state: "loading" as const},

	wrapError<T>(error: unknown): LoadState<T> {
		return {state: "error", error};
	},

	wrapValue<T>(value: T): LoadState<T> {
		return {state: "done", value};
	},
};

export default function useData<T>(fn: () => Promise<T>, deps: unknown[]) {
	const [state, setState] = useState<LoadState<T>>(LoadState.loading);
	const lastCallRef = useRef(0);

	useEffect(() => {
		setState(LoadState.loading);

		const thisCall = lastCallRef.current + 1;
		lastCallRef.current = thisCall;

		try {
			fn()
				.then(value => {
					if(thisCall === lastCallRef.current) {
						setState(LoadState.wrapValue(value));
					}
				})
				.catch(err => {
					if(thisCall === lastCallRef.current) {
						setState(LoadState.wrapError(err));
					}
				});
		}
		catch(err) {
			setState(LoadState.wrapError(err));
		}
	}, deps);
}
