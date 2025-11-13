import { LoadState } from "../util/useData";

export function Loading() {
	return <p>Loading…</p>;
}

export function ErrorAlert(props: {error: unknown}) {
	return <p>Error: {String(props.error)}</p>;
}

export function DataNonDoneView(props: {state: LoadState<never> & {state: "error" | "loading"}}) {
	if(props.state.state === "loading") {
		return <Loading />;
	}
	else {
		return <ErrorAlert error={props.state.error} />;
	}
}
