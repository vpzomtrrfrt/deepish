import { Picker } from "emoji-picker-element";
import { PickerConstructorOptions } from "emoji-picker-element/shared";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { JSX } from "preact/jsx-runtime";

declare module "preact/jsx-runtime" {
	namespace JSX {
		interface IntrinsicElements {
			"emoji-picker": JSX.HTMLAttributes<Picker> & PickerConstructorOptions;
		}
	}
}
