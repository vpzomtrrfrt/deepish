declare module "react" {
	import type * as pc from "preact/compat";
	export {
		AriaAttributes,
		ComponentProps,
		ComponentPropsWithoutRef,
		ComponentPropsWithRef,
		ComponentType,
		Context,
		CSSProperties,
		Dispatch,
		ElementType,
		FC,
		FocusEventHandler,
		ForwardRefExoticComponent,
		HTMLAttributeReferrerPolicy,
		HTMLProps,
		ImgHTMLAttributes,
		JSX,
		Key,
		MouseEventHandler,
		MutableRefObject,
		PureComponent,
		ReactElement,
		ReactNode,
		Ref,
		RefAttributes,
		RefObject,
		SetStateAction,
		useRef,
		useState,
	} from "preact/compat";

	export type DependencyList = unknown[];
	export type MouseEvent<T extends EventTarget = Element> = pc.MouseEvent<T>;
	export type ExoticComponent<P = object> = pc.FunctionComponent<P>;
	export type HTMLAttributes<T> = pc.HTMLAttributes<T extends EventTarget ? T : EventTarget>;
	export type KeyboardEvent<T extends EventTarget = Element> = pc.KeyboardEvent<T>;
	export type NamedExoticComponent<P = object> = ExoticComponent<P>;
	export type PointerEvent<T extends EventTarget = Element> = pc.PointerEvent<T>;
	export type RefCallback<T> = (instance: T | null) => void;
	export type SyntheticEvent<T extends Element = Element, E extends Event = Event> = pc.TargetedEvent<T, E>;
}
