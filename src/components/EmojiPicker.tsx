import "emoji-picker-element";

import { css } from "@emotion/css";
import { Picker } from "emoji-picker-element";
import { EmojiClickEvent } from "emoji-picker-element/shared";
import dataSource from "emoji-picker-element-data/en/emojibase/data.json?url";
import { useEffect, useRef } from "preact/hooks";

import { themeVars } from "../util/theme";

export { dataSource as emojiDataSource };

const styles = {
	picker: css({
		"--border-color": "transparent",
		"--input-border-color": themeVars.outline1,
		"--input-border-radius": ".25rem",
		"--input-border-size": "2px",
		"--input-padding": ".5rem",
		"--outline-color": themeVars.focusOutline,
	}),
};

export default function EmojiPicker(props: {
	onEmojiClick: (evt: EmojiClickEvent) => void;
}) {
	const ref = useRef<Picker>(null);

	useEffect(() => {
		const elem = ref.current!;

		elem.addEventListener("emoji-click", props.onEmojiClick);

		return () => {
			elem.removeEventListener("emoji-click", props.onEmojiClick);
		};
	}, [props.onEmojiClick]);

	return <emoji-picker dataSource={dataSource} ref={ref} class={styles.picker} />;
}
