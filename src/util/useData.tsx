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

	ifDone<T, O>(state: LoadState<T>, doneHandler: (value: T) => O, elseHandler: (state: LoadState<T> & {state: "error" | "loading"}) => O) {
		if(state.state === "done") return doneHandler(state.value);
		else return elseHandler(state);
	},

	wrapError<T>(error: unknown): LoadState<T> & {state: "error"} {
		return {state: "error", error};
	},

	wrapValue<T>(value: T): LoadState<T> & {state: "done"} {
		return {state: "done", value};
	},

	map<T, O>(state: LoadState<T>, fn: (value: T) => O): LoadState<O> {
		if(state.state === "done") {
			try {
				return LoadState.wrapValue(fn(state.value));
			}
			catch(ex) {
				return LoadState.wrapError(ex);
			}
		}
		else return state;
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

		// ignoring fn changing since it always will
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);

	return state;
}
