import { createModel } from "@preact/signals";
import xid from "@xmpp/id";
import { ComponentChildren } from "preact";
import { memo } from "preact/compat";
import { useEffect, useMemo } from "preact/hooks";

export default function createComponent<P, K>(
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	getKeyProps: (K extends Function ? never : K) | ((props: P) => K),
	fn: (keyProps: K) => (props: P) => ComponentChildren,
) {
	return memo((props: P) => {
		const keyProps = typeof getKeyProps === "function" ? (getKeyProps as (props: P) => K)(props) : getKeyProps;

		const key = useMemo(() => {
			const _ = keyProps;

			return xid();
		}, [keyProps]);

		const renderModel = useMemo(() => {
			const Model = createModel(() => {
				const render = fn(keyProps);

				// createModel wraps functions in untracked, so use currying to sidestep that
				return {getRender: () => render};
			});

			return new Model();
		}, [keyProps]);

		useEffect(() => {
			return renderModel[Symbol.dispose];
		}, [renderModel]);

		return <Content key={key} render={renderModel.getRender()} props={props} />;
	});
}

function Content<P>(props: {props: P; render: (props: P) => ComponentChildren}) {
	return props.render(props.props);
}
