import { css, cx } from "@emotion/css";
import * as xml from "@xmpp/xml";
import inlineStyleParser from "inline-style-parser";
import { ComponentChildren, h, JSX, VNode } from "preact";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { useIntl } from "react-intl";
import { List, ListImperativeAPI, RowComponentProps, useDynamicRowHeight } from "react-window";

import { Message, MessageContent, useAccount } from "../util/connection";
import { parseMarkdown, renderMarkdownToXHTML } from "../util/markdown";
import { maybeGetNickForCounterpart } from "../util/profileUtil";
import { parse0393, StylingBlock0393, StylingSpan0393 } from "../util/xmpp/styling";
import Avatar from "./Avatar";
import { ErrorAlert } from "./DataView";

const DEFAULT_ROW_HEIGHT = 70;

// Not sure why this is necessary but it seems to fix initial load scrolling
const BOTTOM_TOLERANCE = 5;

const styles = {
	message: css({
		display: "flex",
		gap: ".5rem",
		paddingBlock: ".5rem",

		"&:hover": {
			"> .messageMenuArea": {
				visibility: "visible",
			},
		},
	}),
	messageContentArea: css({
		flexGrow: 1,

		"p, ul, ol": {
			marginBlockStart: 0,
			marginBlockEnd: ".5rem",
		},
	}),
	messageTimestamp: css({
		marginInlineStart: ".5em",
		color: "#888",
	}),
	messageMenuArea: cx("messageMenuArea", css({
		visibility: "hidden",

		"&:focus-within": {
			visibility: "visible",
		},
	})),
	typingIndicatorPlaceholder: css({
		height: "1.5rem",
	}),
};

export default function MessageList(props: {
	messages: Message[];
	loaderContent: VNode;
	renderMenu(message: Message): ComponentChildren;
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
}>) {
	if(props.index === 0) {
		return props.loaderContent;
	}

	if(props.index === props.messages.length + 1) {
		return <div class={styles.typingIndicatorPlaceholder} style={props.style} />;
	}

	const index = props.index - 1;

	const message = props.messages[index];

	return <RealMessageRow {...props} message={message} />;
}

function RealMessageRow(props: RowComponentProps<{message: Message; renderMenu(message: Message): ComponentChildren}>) {
	const message = props.message;

	const { $t } = useIntl();

	const account = useAccount();

	const from = message.room === null ? message.from.bare() : message.from;
	const counterpart = account.counterparts.get(from.toString());

	return <div style={props.style} class={styles.message}>
		<div>
			<Avatar size="md" jid={from} />
		</div>
		<div class={styles.messageContentArea}>
			<div>
				<span>{maybeGetNickForCounterpart(from, counterpart)}</span>
				<span class={styles.messageTimestamp}>{message.timestamp.toLocaleString()}</span>
			</div>
			<div>
				{
					message.removal === null ?
						<MessageContentView content={message.content} /> :
						<em>{$t({defaultMessage: "This message has been deleted"})}</em>
				}
			</div>
		</div>
		<div class={styles.messageMenuArea}>
			{props.renderMenu(message)}
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

		let elem = "span";
		if(["p", "em", "strong", "ul", "ol", "li", "blockquote", "div"].includes(src.getName())) elem = src.getName();
		if(src.getName() === "body") elem = "div";

		return h(elem, {style}, src.children.map(convertXHTMLIMNodeToNode));
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
