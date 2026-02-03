import * as xml from "@xmpp/xml";
import inlineStyleParser from "inline-style-parser";
import { ComponentChildren, h, JSX } from "preact";
import { useMemo } from "preact/hooks";

import { MessageContent } from "../util/connection";
import { parseMarkdown, renderMarkdownToXHTML } from "../util/markdown";
import { parse0393, StylingBlock0393, StylingSpan0393 } from "../util/xmpp/styling";
import { ErrorAlert } from "./DataView";

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
	else if(span.type === "link") return <a href={span.href} target="_blank">{span.text}</a>;
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
