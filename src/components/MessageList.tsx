import { css, cx } from "@emotion/css";
import { mdiEmoticonPlus, mdiPencil } from "@mdi/js";
import { useComputed } from "@preact/signals";
import { useLiveSignal } from "@preact/signals/utils";
import { JID, parse as parseJID } from "@xmpp/jid";
import * as xml from "@xmpp/xml";
import { EmojiClickEvent } from "emoji-picker-element/shared";
import inlineStyleParser from "inline-style-parser";
import { ComponentChildren, h, JSX, VNode } from "preact";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { FormattedList, useIntl } from "react-intl";
import { List, ListImperativeAPI, RowComponentProps, useDynamicRowHeight } from "react-window";
import useLatestCallback from "use-latest-callback";

import { Message, MessageContent, useAccountSig } from "../util/connection";
import { parseMarkdown, renderMarkdownToXHTML } from "../util/markdown";
import { maybeGetNickForCounterpart } from "../util/profileUtil";
import { themeVars } from "../util/theme";
import { StanzaIDType } from "../util/xmpp/StanzaID";
import { parse0393, StylingBlock0393, StylingSpan0393 } from "../util/xmpp/styling";
import Avatar from "./Avatar";
import { ErrorAlert } from "./DataView";
import EmojiPicker from "./EmojiPicker";
import Icon from "./Icon";
import IconButton from "./IconButton";
import MessageInput from "./MessageInput";
import Popover, { PopoverActions } from "./Popover";
import WithTooltip from "./WithTooltip";

const DEFAULT_ROW_HEIGHT = 70;

// Not sure why this is necessary but it seems to fix initial load scrolling
const BOTTOM_TOLERANCE = 5;

const MESSAGE_MERGE_TIME = 1000 * 60;

const styles = {
	messageWrapper: css({
		paddingBlockStart: ".5rem",

		"&.merged": {
			paddingBlockStart: 0,
		},
	}),
	message: css({
		display: "flex",
		gap: ".5rem",
		paddingBlock: ".125rem",

		position: "relative",

		"&:hover": {
			backgroundColor: "rgba(127, 127, 127, 0.2)",

			"> .messageMenuArea": {
				display: "flex",
			},
		},
	}),
	messageContentArea: css({
		flexGrow: 1,

		"p, ul, ol": {
			marginBlockStart: 0,
			marginBlockEnd: ".5rem",
		},

		"a": {
			color: themeVars.link,
		},
	}),
	messageTimestamp: css({
		marginInlineStart: ".5em",
		color: "#888",
	}),
	messageMenuArea: cx("messageMenuArea", css({
		position: "absolute",
		right: 0,
		bottom: "calc(100% - 1rem)",

		backgroundColor: themeVars.bg1,
		borderStyle: "solid",
		borderWidth: "1px",
		borderColor: themeVars.outline1,
		borderRadius: "2rem",

		display: "none",
		alignItems: "flex-start",

		"&:focus-within, &.forceOpen": {
			display: "flex",
		},

		"> *": {
			flexShrink: 0,
		},
	})),
	typingIndicatorPlaceholder: css({
		height: "1.5rem",
	}),
	avatarSegment: css({
		width: "35px",
	}),
	reactionsArea: css({
		display: "flex",
		gap: ".5rem",
	}),
	reactionButton: css({
		borderColor: themeVars.outline1,
		borderStyle: "solid",
		borderWidth: "1px",
		borderRadius: ".5rem",

		padding: ".25rem",

		cursor: "pointer",

		"&.active": {
			backgroundColor: themeVars.active,
		},

		"&.disabled": {
			cursor: "not-allowed",
		},
	}),
};

export default function MessageList(props: {
	messages: Message[];
	loaderContent: VNode;
	renderMenu(message: Message): ComponentChildren;
	submitEdit?: (text: string, replaces: string) => Promise<void>;
	canEdit?: (message: Message) => boolean;
	submitReactions?: (reactions: string[], message: Message) => Promise<void>;
}) {
	const messages = props.messages;

	const rowHeight = useDynamicRowHeight({defaultRowHeight: DEFAULT_ROW_HEIGHT});

	const listRef = useRef<ListImperativeAPI>(null);
	const lastScrollHeightRef = useRef(0);
	const lastClientHeightRef = useRef(0);

	const lastMessagesRef = useRef<Message[]>([]);

	const atBottomRef = useRef(true);

	useLayoutEffect(() => {
		let lastCenterItem = null;
		let lastCenterItemPos = null;
		let lastCenterItemIndex = null;
		if(listRef.current !== null && listRef.current.element !== null && listRef.current.element.children.length > 0) {
			const centerItem = listRef.current.element.children[Math.floor(listRef.current.element.children.length / 2)] as HTMLElement;
			lastCenterItemPos = centerItem.getBoundingClientRect().top;
			lastCenterItemIndex = parseInt(centerItem.dataset.reactWindowIndex as string, 10);
			lastCenterItem = lastMessagesRef.current[lastCenterItemIndex - 1] ?? null;
		}

		const elem = listRef.current!.element;

		if(elem !== null) {
			const currentScrollLocation = elem.scrollTop;

			console.log("maybe adjusting scroll", currentScrollLocation, lastScrollHeightRef.current, elem.clientHeight, lastScrollHeightRef.current - elem.clientHeight, elem.scrollHeight);

			if(atBottomRef.current) {
				console.log("adjusting scroll to bottom");
				elem.scrollTop = elem.scrollHeight;
				console.log("scroll was to", elem.scrollTop, elem.scrollHeight - elem.clientHeight);
			}
			else {
				if(lastCenterItem !== null && lastCenterItemPos !== null) {
					const centerItemNewIndex = messages.indexOf(lastCenterItem) + 1;

					const topItem = elem.children[0] as HTMLElement;
					const topItemIndex = parseInt(topItem.dataset.reactWindowIndex as string, 10);

					console.log("lci", lastCenterItem, lastCenterItemPos, centerItemNewIndex, topItemIndex);

					if(lastCenterItemIndex !== null && centerItemNewIndex > lastCenterItemIndex) {
						console.log("adjusting scroll");
						elem.scrollTop += elem.scrollHeight - lastScrollHeightRef.current;
					}
				}
			}

			lastScrollHeightRef.current = elem.scrollHeight;
			lastClientHeightRef.current = elem.clientHeight;
		}
	});

	useEffect(() => {
		lastMessagesRef.current = messages;
	}, [messages]);

	const onResize = useCallback(() => {
		const elem = listRef.current!.element;

		if(elem !== null) {
			if(atBottomRef.current) {
				elem.scrollTop = elem.scrollHeight;
			}
		}
	}, []);

	const onScroll = useCallback((evt: JSX.TargetedEvent<HTMLDivElement>) => {
		const elem = evt.currentTarget;

		const atBottom = elem.scrollTop >= elem.scrollHeight - elem.clientHeight - BOTTOM_TOLERANCE;

		if(
			atBottom || (
				lastScrollHeightRef.current === elem.scrollHeight && lastClientHeightRef.current === elem.clientHeight
			)
		) {
			atBottomRef.current = atBottom;

			console.log("updated from scroll, atBottom=", atBottomRef.current, elem.scrollTop, elem.scrollHeight - elem.clientHeight);
		}
		else {
			console.log("ignoring scroll as height has changed");
		}
	}, []);

	return <List
		rowComponent={MessageRow}
		rowCount={messages.length + 2}
		rowHeight={rowHeight}
		rowProps={{
			messages,
			loaderContent: props.loaderContent,
			renderMenu: props.renderMenu,
			submitEdit: props.submitEdit,
			canEdit: props.canEdit,
			submitReactions: props.submitReactions,
		}}
		listRef={listRef}
		onResize={onResize}
		onScroll={onScroll}
	/>;
}

function MessageRow(props: RowComponentProps<{
	messages: Message[];
	loaderContent: VNode;
	renderMenu(message: Message): ComponentChildren;
	submitEdit?: (text: string, replaces: string) => Promise<void>;
	canEdit?: (message: Message) => boolean;
	submitReactions?: (reactions: string[], message: Message) => Promise<void>;
}>) {
	if(props.index === 0) {
		return props.loaderContent;
	}

	if(props.index === props.messages.length + 1) {
		return <div class={styles.typingIndicatorPlaceholder} style={props.style} />;
	}

	const index = props.index - 1;

	const message = props.messages[index];

	let isMerged = false;
	if(index > 0) {
		const prevMessage = props.messages[index - 1];

		if(
			message.timestamp.getTime() - prevMessage.timestamp.getTime() < MESSAGE_MERGE_TIME &&
				// TODO show edited state somewhere else so we can merge them too
				message.editedAt === null
		) {
			if(message.room === null) {
				if(message.from.bare().equals(prevMessage.from.bare())) {
					isMerged = true;
				}
			}
			else {
				if(message.from.equals(prevMessage.from)) {
					isMerged = true;
				}
			}
		}
	}

	return <RealMessageRow {...props} message={message} key={message.ids[0].toString()} isMerged={isMerged} />;
}

function RealMessageRow(props: RowComponentProps<{
	message: Message;
	isMerged: boolean;

	renderMenu(message: Message): ComponentChildren;

	submitEdit?: (text: string, replaces: string) => Promise<void>;
	canEdit?: (message: Message) => boolean;
	submitReactions?: (reactions: string[], message: Message) => Promise<void>;
}>) {
	const message = props.message;
	const messageSig = useLiveSignal(message);

	const { $t } = useIntl();

	const accountSig = useAccountSig();

	const fromSig = useComputed(() => messageSig.value.room === null ? messageSig.value.from.bare() : messageSig.value.from);
	const counterpartSig = useComputed(() => accountSig.value.counterparts.getSignal(fromSig.value.toString())).value;
	const nickSig = useComputed(() => maybeGetNickForCounterpart(fromSig.value, counterpartSig.value));

	const [editing, setEditing] = useState(false);

	const edit = useCallback(() => {
		setEditing(true);
	}, []);

	const submitEdit = useCallback(async (text: string, replaces: string) => {
		await props.submitEdit!.call(undefined, text, replaces);
		setEditing(false);
	}, [props.submitEdit]);

	const cancelEdit = useCallback(() => {
		setEditing(false);
	}, []);

	const reactions = useMemo(() => {
		const result = new Map<string, Array<{jid: JID; occupantID: string | null}>>();

		message.reactions.forEach((set, key) => {
			const idx = key.lastIndexOf("/");

			const sender = {
				jid: parseJID(key.substring(0, idx)),
				occupantID: idx + 1 < key.length ? key.substring(idx + 1) : null,
			};

			set.reactions.forEach(value => {
				let list = result.get(value);
				if(typeof list === "undefined") {
					list = [];
					result.set(value, list);
				}
				list.push(sender);
			});
		});

		return result;
	}, [message.reactions]);

	const myReactionsSig = useComputed(() => {
		let key;
		if(messageSig.value.room === null) {
			key = accountSig.value.jid.toString() + "/";
		}
		else {
			const room = accountSig.value.rooms.get(messageSig.value.room.toString());
			if(typeof room === "undefined" || room.connectedNick === null) return null;

			const myJID = new JID(room.jid.local, room.jid.domain, room.connectedNick);
			const myCounterpart = accountSig.value.counterparts.get(myJID.toString());

			if(typeof myCounterpart === "undefined") return null;

			key = myJID.toString() + "/" +
				(myCounterpart.occupantID === null ? "" : encodeURIComponent(myCounterpart.occupantID));
		}

		const set = messageSig.value.reactions.get(key);
		if(typeof set === "undefined") return null;
		else return set.reactions;
	});

	const toggleReaction = useCallback((value: string) => {
		const newReactions = new Set(myReactionsSig.value ?? undefined);
		if(newReactions.has(value)) newReactions.delete(value);
		else newReactions.add(value);

		props.submitReactions!.call(undefined, Array.from(newReactions), messageSig.value);
	}, [messageSig, myReactionsSig, props.submitReactions]);

	const emojiPopoverActionsRef = useRef<PopoverActions | null>(null);
	const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

	const onEmojiClick = useCallback((evt: EmojiClickEvent) => {
		const text = evt.detail.unicode!;

		toggleReaction(text);
		emojiPopoverActionsRef.current!.close();
	}, [toggleReaction]);

	const myReactions = myReactionsSig.value;

	return <div style={props.style} class={cx(styles.messageWrapper, props.isMerged && "merged")}>
		<div class={styles.message}>
			<div class={styles.avatarSegment}>
				{!props.isMerged &&
					<Avatar size="md" jid={fromSig} />
				}
			</div>
			<div class={styles.messageContentArea}>
				{!props.isMerged &&
					<div>
						<span>{nickSig}</span>
						<span class={styles.messageTimestamp}>
							{message.timestamp.toLocaleString()}
							{message.editedAt !== null && <>{" "}{$t({defaultMessage: "(edited)"})}</>}
						</span>
					</div>
				}
				<div>
					{
						editing ?
							<MessageEditArea message={message} submitEdit={submitEdit} cancel={cancelEdit} /> :
							(
								message.removal === null ?
									<MessageContentView content={message.content} /> :
									<em>{$t({defaultMessage: "This message has been deleted"})}</em>
							)
					}
				</div>
				{reactions.size > 0 &&
					<ReactionsArea
						reactions={reactions}
						isRoom={props.message.room !== null}
						myReactions={myReactions}
						toggleReaction={typeof props.submitReactions === "undefined" ? undefined : toggleReaction}
					/>
				}
			</div>
			{!editing &&
				<div class={cx(styles.messageMenuArea, emojiPickerOpen && "forceOpen")}>
					{typeof props.submitReactions !== "undefined" &&
						<Popover
							icon={<Icon path={mdiEmoticonPlus} />}
							actionsRef={emojiPopoverActionsRef}
							onOpenChange={setEmojiPickerOpen}
						>
							<EmojiPicker onEmojiClick={onEmojiClick} />
						</Popover>
					}
					{(
						typeof props.submitEdit !== "undefined" &&
							message.removal === null &&
							message.ids.some(x => x.type === StanzaIDType.Element) &&
							props.canEdit?.(message) === true
					) &&
						<IconButton onClick={edit}>
							<Icon path={mdiPencil} />
						</IconButton>
					}
					{props.renderMenu(message)}
				</div>
			}
		</div>
	</div>;
}

export function LoadMoreTriggerer(props: {loadMore: () => void}) {
	const elemRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const observer = new IntersectionObserver(props.loadMore, {
			root: elemRef.current!.parentNode as Element,
		});

		observer.observe(elemRef.current!);

		return () => {
			observer.disconnect();
		};
	}, [props.loadMore]);

	return <div ref={elemRef} />;
}

const MESSAGE_CONTENT_TYPE_PRIORITY: Array<MessageContent["type"]> = ["plain", "0393", "markdown", "xhtml"];

function MessageContentView(props: {content: MessageContent[] | MessageContent}) {
	const content = useMemo(() => {
		if(Array.isArray(props.content)) {
			let best = props.content[0];
			for(let i = 1; i < props.content.length; i++) {
				const current = props.content[i];

				if(
					MESSAGE_CONTENT_TYPE_PRIORITY.indexOf(current.type) >
						MESSAGE_CONTENT_TYPE_PRIORITY.indexOf(best.type)
				) {
					best = current;
				}
			}

			return best;
		}
		else {
			return props.content;
		}
	}, [props.content]);

	if(content.type === "plain") return <span>{content.content}</span>;
	else if(content.type === "0393") return <MessageContent0393 content={content.content} />;
	else if(content.type === "xhtml") return <MessageContentXHTMLIM content={content.content} />;
	else if(content.type === "markdown") return <MessageContentMarkdown content={content.content} />;
	else {
		const _: never = content;
		return <ErrorAlert error="Unknown content type" />;
	}
}

function MessageContent0393(props: {content: string}) {
	const children = useMemo(() => parse0393(props.content).map(convert0393BlockToNode), [props.content]);

	return children;
}

function convert0393BlockToNode(block: StylingBlock0393) {
	if(block.type === "plain") return <div>{block.children.map(convert0393SpanToNode)}</div>;
	else if(block.type === "pre") return <pre><code>{block.text}</code></pre>;
	else if(block.type === "quote") return <blockquote>{block.children.map(convert0393BlockToNode)}</blockquote>;
	else {
		const _: never = block;
		console.warn("Unknown block type");
		return <div />;
	}
}

function convert0393SpanToNode(span: StylingSpan0393) {
	if(span.type === "plain") return span.text;
	else if(span.type === "pre") return <code>`{span.text}`</code>;
	else if(span.type === "strikethrough") return <del>~{span.children.map(convert0393SpanToNode)}~</del>;
	else if(span.type === "strong") return <strong>*{span.children.map(convert0393SpanToNode)}*</strong>;
	else if(span.type === "em") return <em>_{span.children.map(convert0393SpanToNode)}_</em>;
	else if(span.type === "link") return <a href={span.href}>{span.text}</a>;
	else {
		const _: never = span.type;
		console.warn("Unknown span type");
		return <span />;
	}
}

function MessageContentXHTMLIM(props: {content: xml.Element}) {
	const children = useMemo(() => convertXHTMLIMNodeToNode(props.content), [props.content]);

	return children;
}

function convertXHTMLIMNodeToNode(src: xml.Node): ComponentChildren {
	// We implement a rather conservative subset of XHTML.

	if(typeof src === "string") {
		return src;
	}
	else if(src instanceof xml.Element) {
		const style: JSX.CSSProperties = {};
		try {
			const srcStyleStr = src.getAttr("style");
			const srcStyle = typeof srcStyleStr === "string" ?
				inlineStyleParser(srcStyleStr) :
				[];

			srcStyle.forEach(entry => {
				if(entry.type === "declaration") {
					if(entry.property === "font-style") {
						if(["normal", "italic", "oblique"].includes(entry.value)) {
							style.fontStyle = entry.value;
						}
					}
					else if(entry.property === "font-weight") {
						// We only care about normal and bold, map other values to those

						if(entry.value === "normal" || entry.value === "lighter") {
							style.fontWeight = "normal";
						}
						else if(entry.value === "bold" || entry.value === "bolder") {
							style.fontWeight = "bold";
						}
						else {
							const valueNum = Number(entry.value);
							if(!isNaN(valueNum)) {
								style.fontWeight = valueNum < 500 ? "normal" : "bold";
							}
						}
					}
					else if(entry.property === "text-decoration") {
						if(entry.value === "line-through") {
							style.textDecoration = entry.value;
						}
					}
				}
			});
		}
		catch(err) {
			console.log("Failed to parse incoming style:", err);
		}

		if(src.is("br")) return <br />;

		const content = src.children.map(convertXHTMLIMNodeToNode);

		const attrs = {style};

		if(src.is("a")) {
			const href = src.getAttr("href");
			try {
				const url = new URL(href);
				if(["https:", "http:", "ftp:", "mailto:"].includes(url.protocol)) {
					return <a {...attrs} href={url.toString()} target="_blank">{content}</a>;
				}
			}
			catch {
				// ignore
			}
		}

		let elem = "span";
		if(["p", "em", "strong", "ul", "ol", "li", "blockquote", "div"].includes(src.getName())) elem = src.getName();
		if(src.getName() === "body") elem = "div";

		return h(elem, attrs, content);
	}
	else {
		console.warn("Unexpected node type:", src);
		return null;
	}
}

function MessageContentMarkdown(props: {content: string}) {
	const content = useMemo(() => {
		return renderMarkdownToXHTML(parseMarkdown(props.content));
	}, [props.content]);

	return <MessageContentXHTMLIM content={content} />;
}

const MESSAGE_EDIT_CONTENT_TYPE_PRIORITY: Array<MessageContent["type"]> = ["xhtml", "plain", "0393", "markdown"];

function MessageEditArea(props: {
	message: Message;
	submitEdit(newMessage: string, replaces: string): Promise<void>;
	cancel(): void;
}) {
	const content = useMemo(() => {
		let best = props.message.content[0];
		for(let i = 1; i < props.message.content.length; i++) {
			const current = props.message.content[i];

			if(
				MESSAGE_EDIT_CONTENT_TYPE_PRIORITY.indexOf(current.type) >
					MESSAGE_EDIT_CONTENT_TYPE_PRIORITY.indexOf(best.type)
			) {
				best = current;
			}
		}

		return best;
	}, [props.message.content]);

	const submit = useLatestCallback(async (value: string) => {
		const id = props.message.ids.find(x => x.type === StanzaIDType.Element);
		if(typeof id === "undefined") throw new Error("Missing ID for edit");

		return props.submitEdit.call(undefined, value, id.id);
	});

	return <MessageInput
		submitMessage={submit}
		autofocus
		initValue={content.content.toString()}
		cancel={props.cancel}
	/>;
}

function ReactionsArea(props: {
	isRoom: boolean;
	reactions: Map<string, Array<{jid: JID; occupantID: string | null}>>;
	myReactions: Set<string> | null;
	toggleReaction?: (value: string) => void;
}) {
	const { $t } = useIntl();

	const accountSig = useAccountSig();

	return <div class={styles.reactionsArea}>
		{
			Array.from(props.reactions.entries()).map(([value, senders]) => {
				return <WithTooltip
					key={value}
					instant={false}
					tooltip={$t(
						{defaultMessage: "{list} reacted with {text}"},
						{
							text: value,
							list: <FormattedList
								value={senders.map(sender => {
									const from = props.isRoom ? sender.jid : sender.jid.bare();

									const counterpart = accountSig.value.counterparts.get(from.toString());

									return maybeGetNickForCounterpart(from, counterpart);
								})}
								type="conjunction"
							/>
						},
					)}
				>
					<div
						class={cx(
							styles.reactionButton,
							props.myReactions?.has(value) && "active",
							typeof props.toggleReaction === "undefined" && "disabled",
						)}
						onClick={props.toggleReaction?.bind(undefined, value)}
					>
						{value} {senders.length}
					</div>
				</WithTooltip>;
			})
		}
	</div>;
}
