import { css } from "@emotion/css";
import { mdiSend } from "@mdi/js";
import useLinkState from "linkstate/hook";
import { useEffect } from "preact/hooks";

import useSubmitting from "../util/useSubmitting";
import Icon from "./Icon";
import IconButton from "./IconButton";
import Input from "./Input";

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
		/>
		<IconButton type="submit" disabled={submittingMessage}>
			<Icon path={mdiSend} />
		</IconButton>
	</form>;
}
