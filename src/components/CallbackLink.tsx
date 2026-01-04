import { JSX } from "preact";
import { useMemo } from "preact/hooks";

export default function CallbackLink<T>(props: Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> & {
	callback: (value: T, evt: JSX.TargetedEvent<HTMLAnchorElement>) => void;
	value: T;
}) {
	const onClick = useMemo(() => props.callback.bind(undefined, props.value), [props.callback, props.value]);

	return <a {...props} href="javascript:void(0)" onClick={onClick} />;
}
