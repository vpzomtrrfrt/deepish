import { css } from "@emotion/css";
import useLinkState from "linkstate/hook";

import useSubmitting from "../util/useSubmitting";
import Input from "./Input";
import IconButton from "./IconButton";
import { mdiSend } from "@mdi/js";
import Icon from "./Icon";

const styles = {
	messageInput: css({
		display: "flex",
		padding: ".5rem",
		gap: ".25rem",
		alignItems: "center",
	}),
};

export default function MessageInput(props: {submitMessage: (text: string) => Promise<void>; autofocus: boolean}) {
	const [newMessage, linkNewMessage, setNewMessage] = useLinkState("");

	const [submittingMessage, submitMessage] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		await props.submitMessage.call(undefined, newMessage);

		setNewMessage("");
	});

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
