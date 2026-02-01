import { css, cx } from "@emotion/css";
import { mdiEmoticon, mdiSend } from "@mdi/js";
import { Database as EmojiDatabase } from "emoji-picker-element";
import { EmojiClickEvent, NativeEmoji } from "emoji-picker-element/shared";
import useLinkState from "linkstate/hook";
import { JSX } from "preact";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useIntl } from "react-intl";
import useLatestCallback from "use-latest-callback";

import { msgActionSend, msgCancel } from "../util/langCommon";
import useData, { LoadState } from "../util/useData";
import useSubmitting from "../util/useSubmitting";
import Button from "./Button";
import DataView from "./DataView";
import EmojiPicker, { emojiDataSource } from "./EmojiPicker";
import Icon from "./Icon";
import IconButton from "./IconButton";
import { styles as menuStyles } from "./Menu";
import Popover, { PopoverActions } from "./Popover";
import Textarea from "./Textarea";

const styles = {
	messageInput: css({
		display: "flex",
		flexDirection: "column",
		gap: ".25rem",
		padding: ".5rem",

		position: "relative",
	}),
	mainRow: css({
		display: "flex",
		gap: ".25rem",
		alignItems: "center",
	}),
	formButtonsRow: css({
		display: "flex",
		gap: ".5rem",
		justifyContent: "end",
	}),
	completionsMenu: cx(menuStyles.popup, css({
		position: "absolute",
		width: "calc(100% - .5rem * 2)",
		maxHeight: "10rem",
		bottom: "100%",
		left: 0,

		overflowY: "auto",
	})),
};

const emojiDatabase = new EmojiDatabase({dataSource: emojiDataSource});

export default function MessageInput(props: {
	submitMessage: (text: string) => (Promise<void> | void);
	autofocus: boolean;

	initValue?: string;
	submitLabel?: string;

	onChangeComposing?(composing: boolean): void;
	cancel?(): void;
}) {
	const { $t } = useIntl();

	const [newMessage, linkNewMessage, setNewMessage] = useLinkState(props.initValue ?? "");

	const inputRef = useRef<HTMLTextAreaElement>(null);
	const emojiPopoverActionsRef = useRef<PopoverActions | null>(null);

	const updateInputSize = useCallback(() => {
		inputRef.current!.style.height = "auto";
		inputRef.current!.style.height = "calc(" +
			inputRef.current!.scrollHeight +
			"px + 2 * (" +
			getComputedStyle(inputRef.current!).borderWidth +
			"))";
	}, []);

	useLayoutEffect(() => {
		updateInputSize();
	}, [updateInputSize]);

	const [submittingMessage, submitMessage] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		await props.submitMessage.call(undefined, newMessage);

		setNewMessage("");
		setTimeout(updateInputSize);
	});

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
		elem.focus();

		emojiPopoverActionsRef.current!.close();
	}, [setNewMessage]);

	const [completionText, setCompletionText] = useState("");

	const onInput = useCallback((evt: JSX.TargetedEvent<HTMLTextAreaElement>) => {
		let result = "";

		const elem = evt.currentTarget;
		if(elem.selectionEnd !== null && elem.selectionStart !== null) {
			if(elem.selectionStart === elem.selectionEnd) {
				const endIndex = elem.selectionStart;
				for(let i = endIndex - 1; i >= 0; i--) {
					if(elem.value[i] === ":") {
						const text = elem.value.substring(i, endIndex);

						if(text.length >= 3) result = text;

						break;
					}
					else if(elem.value[i] === " ") break;
				}
			}
		}

		console.log("completionText", result);
		setCompletionText(result);

		updateInputSize();
	}, [updateInputSize]);

	const completionsState = useData(async () => {
		if(completionText.startsWith(":")) {
			const searchText = completionText.substring(1).toLowerCase();

			const list = await emojiDatabase.getEmojiBySearchQuery(searchText);

			console.log("list", list);

			return list
				.filter(entry => {
					if(typeof entry.shortcodes !== "undefined") {
						for(const shortcode of entry.shortcodes) {
							if(shortcode.includes(searchText)) return true;
						}
					}

					return false;
				})
				.map(entry => {
					const value = (entry as NativeEmoji).unicode;

					return {
						value,
						label: value + " " + (
							entry.shortcodes?.find(x => x.includes(searchText)) ?? entry.shortcodes?.[0] ?? entry.name
						),
					};
				});
		}

		return [];
	}, [completionText]);

	const [completionsSelectedIndex, setCompletionsSelectedIndex] = useState(0);

	useEffect(() => {
		setCompletionsSelectedIndex(0);
	}, [completionText]);

	const triggerCompletionInsert = useLatestCallback(() => {
		LoadState.ifDone(completionsState, list => {
			if(list.length > 0) {
				const entry = list[completionsSelectedIndex];

				const elem = inputRef.current!;

				if(elem.selectionStart !== null) {
					const start = elem.value.lastIndexOf(":", elem.selectionStart);
					const end = elem.selectionStart;

					elem.value = elem.value.substring(0, start) + entry.value + elem.value.substring(end);
					elem.selectionStart = start + entry.value.length;
					elem.selectionEnd = elem.selectionStart;

					setNewMessage(elem.value);
					setCompletionText("");

					inputRef.current!.focus();
				}
			}
		});
	});

	const onKeyDown = useLatestCallback((evt: JSX.TargetedKeyboardEvent<HTMLTextAreaElement>) => {
		if(evt.code === "ArrowDown") {
			evt.preventDefault();

			LoadState.ifDone(completionsState, list => {
				setCompletionsSelectedIndex(current => {
					if(current + 1 < list.length) return current + 1;
					return 0;
				});
			});
		}
		else if(evt.code === "ArrowUp") {
			evt.preventDefault();

			LoadState.ifDone(completionsState, list => {
				setCompletionsSelectedIndex(current => {
					if(current - 1 >= 0) return current - 1;
					return list.length - 1;
				});
			});
		}
		else if(evt.code === "Enter" || evt.code === "Tab") {
			LoadState.ifDone(completionsState, list => {
				if(list.length > 0) {
					evt.preventDefault();
					triggerCompletionInsert();
				}
			});

			if(evt.code === "Enter" && !evt.defaultPrevented && !evt.shiftKey && evt.currentTarget.form !== null) {
				evt.preventDefault();
				evt.currentTarget.form.requestSubmit();
			}
		}
	});

	const onHoverCompletion = useCallback((index: number) => {
		setCompletionsSelectedIndex(index);
	}, []);

	const completionsMenuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const child = completionsMenuRef.current!.children[completionsSelectedIndex];
		if(typeof child !== "undefined") scrollIntoViewIfNeeded(child as HTMLElement);
	}, [completionsSelectedIndex]);

	const composing = newMessage !== "";

	useEffect(() => {
		props.onChangeComposing?.call(undefined, composing);
	}, [composing, props.onChangeComposing]);

	return <form onSubmit={submitMessage} class={styles.messageInput}>
		<div class={styles.mainRow}>
			<Textarea
				value={newMessage}
				onChange={linkNewMessage}
				onInput={onInput}
				onKeyDown={onKeyDown}
				style={{flexGrow: 1, resize: "none", boxSizing: "border-box"}}
				autofocus={props.autofocus}
				ref={inputRef}
				rows={1}
			/>
			<Popover icon={<Icon path={mdiEmoticon} />} actionsRef={emojiPopoverActionsRef}>
				<EmojiPicker onEmojiClick={onEmojiClick} />
			</Popover>
			{typeof props.cancel === "undefined" &&
				<IconButton type="submit" disabled={submittingMessage}>
					<Icon path={mdiSend} />
				</IconButton>
			}
		</div>
		{typeof props.cancel !== "undefined" &&
			<div class={styles.formButtonsRow}>
				<Button tier="secondary" onClick={props.cancel}>{$t(msgCancel)}</Button>
				<Button tier="primary" type="submit" disabled={submittingMessage}>
					{props.submitLabel ?? $t(msgActionSend)}
				</Button>
			</div>
		}
		{LoadState.ifDone(completionsState, x => x.length > 0, () => true) &&
			<div class={styles.completionsMenu} ref={completionsMenuRef}>
				<DataView state={completionsState}>
					{list => {
						return list.map((entry, index) => {
							const selected = index === completionsSelectedIndex;
							return <div
								key={entry.value}
								class={menuStyles.item}
								data-highlighted={selected ? true : undefined}
								onMouseOver={onHoverCompletion.bind(undefined, index)}
								onClick={triggerCompletionInsert}
							>
								{entry.label}
							</div>;
						});
					}}
				</DataView>
			</div>
		}
	</form>;
}

function scrollIntoViewIfNeeded(elem: HTMLElement) {
	const parent = elem.offsetParent;
	if(parent !== null) {
		const minY = parent.scrollTop;
		const maxY = parent.scrollTop + parent.clientHeight;

		if(elem.offsetTop < minY) {
			elem.scrollIntoView(true);
		}
		else if(elem.offsetTop + elem.offsetHeight > maxY) {
			elem.scrollIntoView(false);
		}
	}
}
