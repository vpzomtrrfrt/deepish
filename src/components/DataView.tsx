import { ComponentChild } from "preact";
import { useIntl } from "react-intl";

import { LoadState } from "../util/useData";

export function Loading() {
	const { $t } = useIntl();

	return <p>{$t({defaultMessage: "Loading…"})}</p>;
}

export function ErrorAlert(props: {error: unknown}) {
	const { $t } = useIntl();

	return <p>{$t({defaultMessage: "Error: {error}"}, {error: String(props.error)})}</p>;
}

export function DataNonDoneView(props: {state: LoadState<never> & {state: "error" | "loading"}}) {
	if(props.state.state === "loading") {
		return <Loading />;
	}
	else {
		return <ErrorAlert error={props.state.error} />;
	}
}

// TODO maybe this should be renamed? DataView already exists in the global scope
export default function DataView<T>(props: {state: LoadState<T>; children: (value: T) => ComponentChild}) {
	if(props.state.state === "done") return props.children(props.state.value);
	else return <DataNonDoneView state={props.state} />;
}
