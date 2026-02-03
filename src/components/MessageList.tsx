import { css, cx, keyframes } from "@emotion/css";
import { mdiClose, mdiEmoticonPlus, mdiPencil, mdiReply } from "@mdi/js";
import { useComputed } from "@preact/signals";
import { useLiveSignal } from "@preact/signals/utils";
import { JID, parse as parseJID } from "@xmpp/jid";
import * as xml from "@xmpp/xml";
import { EmojiClickEvent } from "emoji-picker-element/shared";
import inlineStyleParser from "inline-style-parser";
import { stringify as stringifyXML } from "ltx";
import { ComponentChildren, h, JSX, VNode } from "preact";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { FormattedList, useIntl } from "react-intl";
import useLatestCallback from "use-latest-callback";

import * as commonStyles from "../util/commonStyles";
import { Message, MessageContent, Room, useAccountSig } from "../util/connection";
import { parseMarkdown, renderMarkdownToXHTML } from "../util/markdown";
import { MessageCache } from "../util/messageCache";
import { maybeGetNickForCounterpart } from "../util/profileUtil";
import { themeVars } from "../util/theme";
import StanzaID, { StanzaIDType } from "../util/xmpp/StanzaID";
import { parse0393, StylingBlock0393, StylingSpan0393 } from "../util/xmpp/styling";
import Avatar from "./Avatar";
import Block from "./Block";
import { ErrorAlert } from "./DataView";
import Dialog from "./Dialog";
import EmojiPicker from "./EmojiPicker";
import Icon from "./Icon";
import IconButton from "./IconButton";
import MessageInput from "./MessageInput";
import Popover, { PopoverActions } from "./Popover";
import WithTooltip from "./WithTooltip";

// Not sure why this is necessary but it seems to fix initial load scrolling
const BOTTOM_TOLERANCE = 5;

const MESSAGE_MERGE_TIME = 1000 * 60;

const flashHighlightAnimation = keyframes({
	"from, to": {
		backgroundColor: themeVars.bg0,
	},

	"12.5%": {
		backgroundColor: themeVars.active,
	},
});

const styles = {
	messageList: css({
		flexGrow: 1,

		display: "flex",
		flexDirection: "column",
		overflowY: "auto",
	}),
	messageListMain: css({
		display: "flex",
		flexDirection: "column",
	}),
	messageWrapper: css({
		paddingBlockStart: ".5rem",

		"&.merged": {
			paddingBlockStart: 0,
		},

		"&[data-flash-highlight=true] > .message": {
			animation: flashHighlightAnimation + " 2s",
		},
	}),
	messageCommon: cx("message", css({
		display: "flex",
		gap: ".5rem",
		paddingBlock: ".125rem",

		position: "relative",
	})),
	messageRow: css({
		"&:hover": {
			backgroundColor: "rgba(127, 127, 127, 0.2)",

			"> .messageMenuArea": {
				display: "flex",
			},
		},
	}),
	pendingMessage: css({
		opacity: 0.5,
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
		flexShrink: 0,
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
	replyQuote: cx(commonStyles.hoverOverlay, css({
		margin: 0,
		marginBlockEnd: ".5rem",

		padding: ".25rem",

		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: themeVars.outline1,
		borderRadius: ".5rem",

		backgroundColor: themeVars.bg1,

		cursor: "pointer",
	})),
	replyingIndicatorWrapper: css({position: "relative"}),
	replyingIndicator: css({
		boxSizing: "border-box",

		position: "absolute",
		bottom: 0,
		left: ".5rem",
		width: "calc(100% - 1rem)",

		borderStyle: "solid",
		borderColor: themeVars.outline1,
		borderWidth: "1px",
		borderRadius: ".5rem",

		backgroundColor: themeVars.bg1,

		padding: ".25rem .5rem",
	}),
	replyingIndicatorHeading: css({
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",

		fontWeight: "bold",
	}),
};

export default function MessageList(props: {
	msgCache: MessageCache;
	loaderContent: VNode;
	pendingMessages?: Array<Pick<Message, "localID" | "content" | "timestamp">>;

	renderMenu(message: Message, setMenuOpen: (value: boolean) => void): ComponentChildren;
	startReply?: (message: Message) => void;
	submitEdit?: (text: string, replaces: string) => Promise<void>;
	canEdit?: (message: Message) => boolean;
	submitReactions?: (reactions: string[], message: Message) => Promise<void>;
}) {
	const accountSig = useAccountSig();

	const messages = props.msgCache.getMessages();

	const listRef = useRef<HTMLDivElement>(null);
	const listMainRef = useRef<HTMLDivElement>(null);

	const lastLastItemKeyRef = useRef<string | null>(null);
	const lastLastItemYRef = useRef<number | null>(null);

	const lastScrollHeightRef = useRef<number>(0);
	const lastClientHeightRef = useRef<number>(0);

	const atBottomRef = useRef(true);

	useLayoutEffect(() => {
		const elem = listRef.current;

		if(elem !== null) {
			if(atBottomRef.current) {
				console.log("adjusting scroll to bottom");
				elem.scrollTop = elem.scrollHeight;
				console.log("scroll was to", elem.scrollTop, elem.scrollHeight - elem.clientHeight);
			}
			else {
				const lastItem = listMainRef.current!.lastChild as HTMLElement | null;
				if(lastItem !== null) {
					const lastItemKey = lastItem.dataset.key!;
					const lastItemY = lastItem.offsetTop;

					console.log("maybe adjusting scroll", lastItemKey, lastLastItemKeyRef.current, lastLastItemYRef.current);

					if(lastItemKey === lastLastItemKeyRef.current) {
						const offset = lastItemY - lastLastItemYRef.current!;

						console.log("adjusting scroll by", offset);

						elem.scrollBy({top: offset, behavior: "instant"});
					}

					lastLastItemKeyRef.current = lastItemKey;
					lastLastItemYRef.current = lastItemY;
				}
			}

			lastScrollHeightRef.current = elem.scrollHeight;
			lastClientHeightRef.current = elem.clientHeight;
		}
	});

	const onResize = useCallback(() => {
		const elem = listRef.current;

		if(elem !== null) {
			if(atBottomRef.current) {
				elem.scrollTop = elem.scrollHeight;
			}
		}
	}, []);

	useEffect(() => {
		const observer = new ResizeObserver(onResize);
		observer.observe(listRef.current!);

		return () => {
			observer.disconnect();
		};
	}, [onResize]);

	const onScroll = useCallback((evt: JSX.TargetedEvent<HTMLDivElement>) => {
		const elem = evt.currentTarget;

		const atBottom = elem.scrollTop >= elem.scrollHeight - elem.clientHeight - BOTTOM_TOLERANCE;

		if(
			atBottom || (
				lastScrollHeightRef.current === elem.scrollHeight && lastClientHeightRef.current === elem.clientHeight
			)
		) {
			atBottomRef.current = atBottom;
		}
		else {
			console.log("ignoring scroll as height has changed");
		}
	}, []);

	const scrollToMessage = useLatestCallback((id: StanzaID) => {
		const message = props.msgCache.getMessage(id);

		if(typeof message === "undefined") {
			console.warn("Attempted to scroll to unknown message");
			return;
		}

		const elemID = "message-" + message.localID;
		const elem = document.getElementById(elemID);
		if(elem === null) {
			console.warn("Couldn't find message in list", elemID);
			return;
		}

		console.log("highlighting?");

		elem.scrollIntoView({behavior: "smooth", block: "center"});
		elem.dataset.flashHighlight = "true";
	});

	const accountJIDSig = useComputed(() => accountSig.value.jid);

	const roomSig = useComputed((): {value: Room | undefined} => {
		if(props.msgCache.container.type === "room") {
			return accountSig.value.rooms.getSignal(props.msgCache.container.jid.toString());
		}
		else {
			return {value: undefined};
		}
	}).value;

	const selfJIDInRoomSig = useComputed(() => {
		const room = roomSig.value;
		if(typeof room === "undefined") return undefined;

		return new JID(room.jid.local, room.jid.domain, room.nick ?? accountJIDSig.value.local);
	});

	const selfJIDHereSig = props.msgCache.container.type === "room" ? selfJIDInRoomSig : accountJIDSig;
	const counterpartSig = useComputed(() => {
		if(typeof selfJIDHereSig.value === "undefined") return {value: undefined};
		return accountSig.value.counterparts.getSignal(selfJIDHereSig.value.toString());
	}).value;
	const nickSig = useComputed(() => {
		if(typeof selfJIDHereSig.value === "undefined") return accountJIDSig.value.local;

		return maybeGetNickForCounterpart(selfJIDHereSig.value, counterpartSig.value);
	});

	return <div class={styles.messageList} ref={listRef} onScroll={onScroll}>
		<div style={{margin: "auto"}} />
		{props.loaderContent}
		<div class={styles.messageListMain} ref={listMainRef}>
			{messages.map((message, index) => {
				return <MessageRow
					key={message.localID}
					msgCache={props.msgCache}
					index={index}
					scrollToMessage={scrollToMessage}
					renderMenu={props.renderMenu}
					startReply={props.startReply}
					submitEdit={props.submitEdit}
					canEdit={props.canEdit}
					submitReactions={props.submitReactions}
				/>;
			})}
		</div>
		{props.pendingMessages?.map((message, index) => {
			let isMerged;
			if(index === 0) {
				const prevMessage = messages[messages.length - 1];

				if(message.timestamp.getTime() - prevMessage.timestamp.getTime() < MESSAGE_MERGE_TIME) {
					if(props.msgCache.container.type === "direct") {
						if(prevMessage.from.bare().equals(accountJIDSig.value)) {
							isMerged = true;
						}
					}
					else if(props.msgCache.container.type === "room") {
						if(typeof selfJIDInRoomSig.value !== "undefined" && prevMessage.from.equals(selfJIDInRoomSig.value)) {
							isMerged = true;
						}
					}
					else {
						const _: never = props.msgCache.container;
						isMerged = false;
					}
				}
			}
			else {
				isMerged = true;
			}

			return <div class={cx(styles.messageWrapper, isMerged && "merged")} key={message.localID}>
				<div class={cx(styles.messageCommon, styles.messageRow, styles.pendingMessage)}>
					<div class={styles.avatarSegment}>
						{!isMerged && typeof selfJIDHereSig.value !== "undefined" &&
							<Avatar size="md" jid={selfJIDHereSig.value} />
						}
					</div>
					<div class={styles.messageContentArea}>
						{!isMerged &&
							<div>
								<span>{nickSig}</span>
								<span class={styles.messageTimestamp}>
									{message.timestamp.toLocaleString()}
								</span>
							</div>
						}
						<div>
							<MessageContentView content={message.content} />
						</div>
					</div>
				</div>
			</div>
		})}
		<div class={styles.typingIndicatorPlaceholder} />
	</div>;
}

function MessageRow(props: {
	msgCache: MessageCache;
	index: number;
	scrollToMessage(id: StanzaID): void;

	renderMenu(message: Message, setMenuOpen: (value: boolean) => void): ComponentChildren;
	startReply?: (message: Message) => void;
	submitEdit?: (text: string, replaces: string) => Promise<void>;
	canEdit?: (message: Message) => boolean;
	submitReactions?: (reactions: string[], message: Message) => Promise<void>;
}) {
	const index = props.index;

	const messages = props.msgCache.getMessages();
	const message = messages[index];

	let isMerged = false;
	if(index > 0) {
		const prevMessage = messages[index - 1];

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

function RealMessageRow(props: {
	msgCache: MessageCache;
	message: Message;
	isMerged: boolean;

	scrollToMessage(id: StanzaID): void;

	renderMenu(message: Message, setMenuOpen: (value: boolean) => void): ComponentChildren;

	startReply?: (message: Message) => void;
	submitEdit?: (text: string, replaces: string) => Promise<void>;
	canEdit?: (message: Message) => boolean;
	submitReactions?: (reactions: string[], message: Message) => Promise<void>;
}) {
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

	const startReply = useMemo(() => {
		if(props.msgCache.container.type === "room") {
			if(!message.ids.some(x => x.type === StanzaIDType.Stanza && x.by?.equals(props.msgCache.container.jid))) {
				return undefined;
			}
		}
		else if(props.msgCache.container.type === "direct") {
			if(!message.ids.some(x => x.type === StanzaIDType.Element)) return undefined;
		}
		else {
			const _: never = props.msgCache.container;
		}

		return props.startReply?.bind(undefined, message);
	}, [message, props.msgCache.container, props.startReply]);

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

	const [menuOpen, setMenuOpen] = useState(false);

	const onEmojiClick = useCallback((evt: EmojiClickEvent) => {
		const text = evt.detail.unicode!;

		toggleReaction(text);
		emojiPopoverActionsRef.current!.close();
	}, [toggleReaction]);

	const myReactions = myReactionsSig.value;

	const scrollToReplyTarget = useLatestCallback(() => {
		if(message.replyingTo === null) return;

		props.scrollToMessage(message.replyingTo.id);
	});

	let replyContent;
	if(message.replyingTo === null) {
		replyContent = null;
	}
	else {
		const target = props.msgCache.getMessage(message.replyingTo.id);
		if(typeof target === "undefined") {
			replyContent = <MessageContentView content={message.replyingTo.fallbackContent} />;
		}
		else {
			replyContent = <blockquote class={styles.replyQuote} onClick={scrollToReplyTarget}>
				<MessageReplyQuoteContent message={target} />
			</blockquote>;
		}
	}

	const onAnimationEnd = useCallback((evt: JSX.TargetedEvent<HTMLDivElement>) => {
		evt.currentTarget.parentElement!.dataset.flashHighlight = undefined;
	}, []);

	return <div class={cx(styles.messageWrapper, props.isMerged && "merged")} id={"message-" + props.message.localID}>
		<div class={cx(styles.messageCommon, styles.messageRow)} onAnimationEnd={onAnimationEnd}>
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
					{replyContent}
					{
						editing ?
							<MessageEditArea message={message} submitEdit={submitEdit} cancel={cancelEdit} /> :
							(
								message.removal === null ?
									<MessageContentView content={message.content} /> :
									(
										message.removal.type === "moderate" ?
											<em>
												{$t({defaultMessage: "This message has been removed by a moderator"})}
											</em> :
											<em>{$t({defaultMessage: "This message has been deleted"})}</em>
									)
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
				<div class={cx(styles.messageMenuArea, (emojiPickerOpen || menuOpen) && "forceOpen")}>
					{typeof props.submitReactions !== "undefined" &&
						<Popover
							icon={<Icon path={mdiEmoticonPlus} />}
							actionsRef={emojiPopoverActionsRef}
							onOpenChange={setEmojiPickerOpen}
						>
							<EmojiPicker onEmojiClick={onEmojiClick} />
						</Popover>
					}
					{typeof startReply !== "undefined" &&
						<IconButton onClick={startReply}>
							<Icon path={mdiReply} />
						</IconButton>
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
					{props.renderMenu(message, setMenuOpen)}
				</div>
			}
		</div>
	</div>;
}

const LOAD_MORE_THRESHOLD = 0.5;

export function LoadMoreTriggerer(props: {loadMore: () => void}) {
	const elemRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const observer = new IntersectionObserver((entries) => {
			if(entries.some(x => x.intersectionRatio > LOAD_MORE_THRESHOLD)) {
				console.log("loading more because of", entries);

				props.loadMore.call(undefined);
			}
		}, {
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

export function MessageContentView(props: {content: MessageContent[] | MessageContent}) {
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
		if(["p", "em", "strong", "ul", "ol", "li", "blockquote", "div", "pre", "code"].includes(src.getName())) elem = src.getName();
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

export function MessageReplyQuoteContent(props: {message: Message}) {
	const message = props.message;
	const messageSig = useLiveSignal(message);

	const { $t } = useIntl();

	const accountSig = useAccountSig();

	const fromSig = useComputed(() => messageSig.value.room === null ? messageSig.value.from.bare() : messageSig.value.from);
	const counterpartSig = useComputed(() => accountSig.value.counterparts.getSignal(fromSig.value.toString())).value;
	const nickSig = useComputed(() => maybeGetNickForCounterpart(fromSig.value, counterpartSig.value));

	return <div class={styles.messageCommon}>
		<div class={styles.avatarSegment}>
			<Avatar size="md" jid={fromSig} />
		</div>
		<div class={styles.messageContentArea}>
			<div>
				<span>{nickSig}</span>
				<span class={styles.messageTimestamp}>
					{message.timestamp.toLocaleString()}
					{message.editedAt !== null && <>{" "}{$t({defaultMessage: "(edited)"})}</>}
				</span>
			</div>
			<div>
				{
					message.removal === null ?
						<MessageContentView content={message.content} /> :
						(
							message.removal.type === "moderate" ?
								<em>
									{$t({defaultMessage: "This message has been removed by a moderator"})}
								</em> :
								<em>{$t({defaultMessage: "This message has been deleted"})}</em>
						)
				}
			</div>
		</div>
	</div>;
}

export function MessageSourceDialog(props: {message: Message}) {
	const content = useMemo(() => {
		return stringifyXML(props.message.raw, 2);
	}, [props.message.raw]);

	return <Dialog size="md">
		<Block>
			<pre style={{overflowX: "auto"}}>
				<code>{content}</code>
			</pre>
		</Block>
	</Dialog>;
}

export function ReplyingIndicator(props: {message: Message; cancelReply(): void}) {
	const { $t } = useIntl();

	return <div class={styles.replyingIndicatorWrapper}>
		<div class={styles.replyingIndicator}>
			<div class={styles.replyingIndicatorHeading}>
				<span>{$t({defaultMessage: "Replying to:"})}</span>
				<IconButton onClick={props.cancelReply}><Icon path={mdiClose} /></IconButton>
			</div>
			<MessageReplyQuoteContent message={props.message} />
		</div>
	</div>;
}
