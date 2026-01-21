import MarkdownIt, { Token } from "markdown-it";

const parser = new MarkdownIt("zero", {
	breaks: true,
	xhtmlOut: true,
});
parser.enable(["blockquote", "code", "fence", "list", "backticks", "emphasis", "entity", "escape", "newline", "text"]);

export function parseMarkdown(src: string) {
	return parser.parse(src, {});
}

export function renderMarkdownToXHTML(src: Token[]) {
	return parser.renderer.render(src, parser.options, {});
}

export function renderMarkdownTo0393(src: Token[]) {
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
				const content = renderMarkdownTo0393(src.slice(startIndex + 1, i - 1)).trimEnd();
				result += "> " + content.replaceAll("\n", "\n> ") + "\n";
			}
			else {
				console.warn("didn't find blockquote end");
				i = startIndex;
			}
		}
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
			if(token.children !== null) result += renderMarkdownTo0393(token.children);
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
