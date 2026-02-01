import xml, { Element } from "@xmpp/xml";
import MarkdownIt, { Token } from "markdown-it";

const parser = new MarkdownIt("zero", {
	breaks: true,
	xhtmlOut: true,
	linkify: true,
});
parser.enable([
	"blockquote",
	"code",
	"fence",
	"list",
	"backticks",
	"emphasis",
	"entity",
	"escape",
	"newline",
	"text",
	"strikethrough",
	"linkify",
]);

export function parseMarkdown(src: string) {
	return parser.parse(src, {});
}

export function renderMarkdownToXHTML(src: Token[]): Element {
	const result = renderMarkdownToXHTMLInner(src);

	if(result.children.length === 1 && result.children[0] instanceof Element && result.children[0].is("p")) {
		const p = result.children[0];
		result.children.splice(0, 1);
		result.children.push(...p.children);
	}

	return result;
}

function renderMarkdownToXHTMLInner(src: Token[]): Element {
	const stack = [xml("body", "http://www.w3.org/1999/xhtml")];

	for(let i = 0; i < src.length; i++) {
		const token = src[i];

		if(token.nesting > 0) {
			let tag = token.tag;

			if(token.type === "s_open") tag = "span";

			const elem = xml(tag);

			if(token.type === "s_open") {
				elem.attr("style", "text-decoration: line-through");
			}

			if(token.attrs !== null) {
				token.attrs.forEach(([key, value]) => {
					elem.attr(key, value);
				});
			}

			stack.push(elem);
		}
		else if(token.nesting < 0) {
			if(stack.length < 2) throw new Error("Tried to close body");

			const child = stack.pop()!;
			stack[stack.length - 1].children.push(child);
		}
		else {
			if(token.type === "code_inline") {
				stack[stack.length - 1].children.push(xml("code", {}, token.content));
			}
			else if(token.type === "fence") {
				stack[stack.length - 1].children.push(xml("pre", {}, xml("code", {}, token.content)));
			}
			else if(token.type === "inline") {
				if(token.children !== null) {
					stack[stack.length - 1].children.push(...renderMarkdownToXHTMLInner(token.children).children);
				}
			}
			else if(token.type === "text") {
				stack[stack.length - 1].children.push(token.content);
			}
			else {
				if(token.tag === "") {
					/* v8 ignore next -- @preserve */
					console.warn("Unknown token type", token);
				}
				else {
					const elem = xml(token.tag);

					if(token.attrs !== null) {
						token.attrs.forEach(([key, value]) => {
							elem.attr(key, value);
						});
					}

					stack[stack.length - 1].children.push(elem);
				}
			}
		}
	}

	if(stack.length > 1) throw new Error("Unclosed tag?");
	return stack[0];
}

export function renderMarkdownTo0393(src: Token[]) {
	const result = renderMarkdownTo0393Inner(src);
	return result.trimEnd();
}

function renderMarkdownTo0393Inner(src: Token[]) {
	let result = "";

	const listStack: Array<{type: "ordered" | "unordered"}> = [];

	for(let i = 0; i < src.length; i++) {
		const token = src[i];
		if(token.type === "paragraph_open") {
			// do nothing
		}
		else if(token.type === "blockquote_open") {
			const startIndex = i;
			for(; i < src.length; i++) {
				if(src[i].type === "blockquote_close") {
					break;
				}
			}

			if(i < src.length) {
				const content = renderMarkdownTo0393Inner(src.slice(startIndex + 1, i - 1)).trimEnd();
				result += "> " + content.replaceAll("\n", "\n> ") + "\n";
			}
			else {
				console.warn("didn't find blockquote end");
				i = startIndex;
			}
		}
		else if(token.type === "softbreak") result += "\n";
		else if(token.type === "bullet_list_close") listStack.pop();
		else if(token.type === "bullet_list_open") {
			listStack.push({type: "unordered"});
		}
		else if(token.type === "code_inline") {
			result += "`" + token.content + "`";
		}
		else if(token.type === "em_close" || token.type === "em_open") result += "_";
		else if(token.type === "fence") {
			result += "```\n" + token.content + "```\n";
		}
		else if(token.type === "inline") {
			if(token.children !== null) result += renderMarkdownTo0393Inner(token.children);
		}
		else if(token.type === "list_item_open") {
			if(listStack.length < 1) {
				console.warn("list item outside of list");
				continue;
			}

			const list = listStack[listStack.length - 1];
			if(list.type === "unordered") {
				result += "* ";
			}
			else if(list.type === "ordered") {
				result += token.info + ". ";
			}
			else {
				const _: never = list.type;
			}
		}
		else if(token.type === "ordered_list_close") listStack.pop();
		else if(token.type === "ordered_list_open") {
			listStack.push({type: "ordered"});
		}
		else if(token.type === "paragraph_close") {
			result += "\n";
		}
		else if(token.type === "s_close" || token.type === "s_open") result += "~";
		else if(token.type === "strong_close" || token.type === "strong_open") result += "*";
		else if(token.type === "text") {
			result += token.content;
		}
		else {
			console.warn("Unknown markdown token");
		}
	}

	return result;
}

export function markdownHasAnyFormatting(src: Token[]): boolean {
	let pCount = 0;

	for(const token of src) {
		if(token.type === "inline") {
			if(token.children === null) {
				// probably doesn't happen?
				return true;
			}

			for(const child of token.children) {
				if(child.type !== "text") {
					return true;
				}
			}
		}
		else if(token.type === "paragraph_close") {
			// this is fine
		}
		else if(token.type === "paragraph_open") {
			pCount++;
		}
		else {
			return true;
		}
	}

	if(pCount > 1) return true;
	else return false;
}
