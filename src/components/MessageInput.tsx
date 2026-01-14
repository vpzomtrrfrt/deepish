import { css } from "@emotion/css";
import { mdiEmoticon, mdiSend } from "@mdi/js";
import { EmojiClickEvent } from "emoji-picker-element/shared";
import useLinkState from "linkstate/hook";
import { useCallback, useEffect, useRef } from "preact/hooks";

import useSubmitting from "../util/useSubmitting";
import EmojiPicker from "./EmojiPicker";
import Icon from "./Icon";
import IconButton from "./IconButton";
import Input from "./Input";
import Popover from "./Popover";

const styles = {
	messageInput: css({
		display: "flex",
		padding: ".5rem",
		gap: ".25rem",
		alignItems: "center",
	}),
};

export default function MessageInput(props: {
	submitMessage: (text: string) => Promise<void>;
	autofocus: boolean;

	onChangeComposing?(composing: boolean): void;
}) {
	const [newMessage, linkNewMessage, setNewMessage] = useLinkState("");

	const [submittingMessage, submitMessage] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		await props.submitMessage.call(undefined, newMessage);

		setNewMessage("");
	});

	const inputRef = useRef<HTMLInputElement>(null);

	const onEmojiClick = useCallback((evt: EmojiClickEvent) => {
		const emojiText = evt.detail.unicode!;

		const elem = inputRef.current!;

		if(elem.selectionStart === null || elem.selectionEnd === null) {
			elem.value += emojiText;
		}
		else {
			const newLocation = elem.selectionStart + emojiText.length;

			elem.value =
				elem.value.substring(0, elem.selectionStart) + emojiText + elem.value.substring(elem.selectionEnd);

			elem.selectionStart = newLocation;
			elem.selectionEnd = newLocation;
		}

		setNewMessage(elem.value);
	}, [setNewMessage]);

	const composing = newMessage !== "";

	useEffect(() => {
		props.onChangeComposing?.call(undefined, composing);
	}, [composing, props.onChangeComposing]);

	return <form onSubmit={submitMessage} class={styles.messageInput}>
		<Input
			type="text"
			value={newMessage}
			onChange={linkNewMessage}
			style={{flexGrow: 1}}
			autofocus={props.autofocus}
			ref={inputRef}
		/>
		<Popover icon={<Icon path={mdiEmoticon} />}>
			<EmojiPicker onEmojiClick={onEmojiClick} />
		</Popover>
		<IconButton type="submit" disabled={submittingMessage}>
			<Icon path={mdiSend} />
		</IconButton>
	</form>;
}
