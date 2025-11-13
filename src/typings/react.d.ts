declare module "react" {
	export {
		ComponentProps,
		ComponentType,
		Context,
		CSSProperties,
		HTMLAttributes,
		HTMLProps,
		JSX,
		Key,
		MutableRefObject,
		ReactElement,
		ReactNode,
		Ref,
		RefAttributes,
		useRef,
		useState,
	} from "preact/compat";

	export type RefCallback<T> = (instance: T | null) => void;
}
