import LinkifyIt, { Match } from "linkify-it";

const linkify = new LinkifyIt();

export type StylingBlock0393 = {
	type: "plain";
	children: StylingSpan0393[];
} | {
	type: "quote";
	children: StylingBlock0393[];
} | {
	type: "pre";
	text: string;
};

export type StylingSpan0393 = {
	type: "plain" | "pre";
	text: string;
} | {
	type: "em" | "strong" | "strikethrough";
	children: StylingSpan0393[];
} | {
	type: "link";
	href: string;
	text: string;
};

const IS_WHITESPACE_CHAR = /^[\p{White_Space}]$/u;

export function parse0393(src: string): StylingBlock0393[] {
	const linksMap = new Map<number, Match>();
	linkify.match(src)?.forEach(match => {
		linksMap.set(match.index, match);
	});

	const blocks: StylingBlock0393[] = [];

	let index = 0;

	while(index < src.length) {
		if(src.startsWith("```", index)) {
			const startLineEnd = src.indexOf("\n", index + 3);
			const end = startLineEnd === -1 ? -1 : src.indexOf("\n```", startLineEnd);
			if(end !== -1 && (src.length === end + 4 || src[end + 4] === "\n")) {
				blocks.push({
					type: "pre",
					text: src.substring(startLineEnd + 1, end),
				});

				index = end + 5;
				continue;
			}
		}

		if(src.startsWith(">", index)) {
			index++;

			let subContent = "";
			while(index < src.length) {
				const lineEnd = src.indexOf("\n", index);
				let lineStart = index;

				const firstChar = String.fromCodePoint(src.codePointAt(index)!);
				if(IS_WHITESPACE_CHAR.test(firstChar)) {
					lineStart += firstChar.length;
				}

				subContent += src.substring(lineStart, lineEnd === -1 ? undefined : (lineEnd + 1));

				if(lineEnd === -1) {
					index = src.length;
					break;
				}
				else {
					index = lineEnd + 1;

					if(src.startsWith(">", index)) {
						index++;
					}
					else {
						break;
					}
				}
			}

			blocks.push({
				type: "quote",
				children: parse0393(subContent),
			});

			continue;
		}

		// Still looking, must be a plain block

		{
			let lineEnd = src.indexOf("\n", index);
			if(lineEnd === -1) lineEnd = src.length;

			const block: StylingBlock0393 = {
				type: "plain",
				children: [],
			};
			blocks.push(block);

			const formattingStack: Array<
				{type: "em" | "strong" | "strikethrough"; children: StylingSpan0393[]; index: number}
			> = [];

			let lastChar: string | null = null;
			let restStartIndex = index;

			while(index < lineEnd) {
				const link = linksMap.get(index);
				if(typeof link !== "undefined") {
					const targetList = formattingStack.length < 1 ?
						block.children :
						formattingStack[formattingStack.length - 1].children;

					if(restStartIndex < index) {
						targetList.push({type: "plain", text: src.substring(restStartIndex, index)});
					}

					targetList
						.push({type: "link", href: link.url, text: src.substring(index, link.lastIndex)});

					index = link.lastIndex;
					restStartIndex = index;

					// probably correct?
					lastChar = String.fromCodePoint((src.codePointAt(index - 1) ?? src.codePointAt(index - 2))!);

					continue;
				}

				const thisChar = String.fromCodePoint(src.codePointAt(index)!);

				let formattingType: "em" | "strong" | "strikethrough" | null = null;
				if(thisChar === "_") formattingType = "em";
				else if(thisChar === "*") formattingType = "strong";
				else if(thisChar === "~") formattingType = "strikethrough";

				if(formattingType !== null) {
					let parentEntry: undefined | typeof formattingStack[0] = undefined;
					if(formattingStack.length > 0) {
						parentEntry = formattingStack[formattingStack.length - 1];
						if(parentEntry.type === formattingType) {
							// Might be an end

							if(!IS_WHITESPACE_CHAR.test(lastChar!)) {
								formattingStack.pop();

								let child: StylingSpan0393 = {
									type: parentEntry.type,
									children: parentEntry.children,
								};

								if(restStartIndex < index) {
									child.children.push({type: "plain", text: src.substring(restStartIndex, index)});
								}

								if(child.children.length < 1) {
									// Empty spans are not allowed, revert to raw text

									child = {
										type: "plain",
										text: thisChar + thisChar,
									};
								}

								if(formattingStack.length > 0) {
									formattingStack[formattingStack.length - 1].children.push(child);
								}
								else {
									block.children.push(child);
								}

								index += thisChar.length;
								restStartIndex = index;
								lastChar = thisChar;
								continue;
							}
						}
					}

					if(lastChar === null || IS_WHITESPACE_CHAR.test(lastChar) || parentEntry?.index === index - 1) {
						// Might be a start

						const nextChar = String.fromCharCode(src.charCodeAt(index + thisChar.length));
						if(!IS_WHITESPACE_CHAR.test(nextChar)) {
							if(restStartIndex < index) {
								(parentEntry?.children ?? block.children).push(
									{type: "plain", text: src.substring(restStartIndex, index)},
								);
							}

							formattingStack.push({
								type: formattingType,
								children: [],
								index,
							});

							index += thisChar.length;
							restStartIndex = index;
							lastChar = thisChar;
							continue;
						}
					}
				}

				if(thisChar === "`") {
					let parentEntry: undefined | typeof formattingStack[0] = undefined;
					if(formattingStack.length > 0) {
						parentEntry = formattingStack[formattingStack.length - 1];
					}

					if(lastChar === null || IS_WHITESPACE_CHAR.test(lastChar) || parentEntry?.index === index - 1) {
						// pre can't have styling inside, so just look for end

						const endIndex = src.indexOf("`", index + 1);
						if(endIndex !== -1 && endIndex < lineEnd) {
							if(restStartIndex < index) {
								(parentEntry?.children ?? block.children).push({
									type: "plain",
									text: src.substring(restStartIndex, index),
								});
							}

							(parentEntry?.children ?? block.children).push({
								type: "pre",
								text: src.substring(index + 1, endIndex),
							});

							index = endIndex + 1;
							restStartIndex = index;
							lastChar = "`";
							continue;
						}
					}
				}

				// No styling change, continue on as plain
				index += thisChar.length;
				lastChar = thisChar;
			}

			// Any unclosed spans are invalid, put them back as plain
			formattingStack.forEach(entry => {
				if(entry.type === "em") block.children.push({type: "plain", text: "_"});
				else if(entry.type === "strong") block.children.push({type: "plain", text: "*"});
				else if(entry.type === "strikethrough") block.children.push({type: "plain", text: "~"});
				else {
					const _: never = entry.type;
				}

				block.children.push(...entry.children);
			});

			if(restStartIndex < lineEnd) {
				block.children.push({type: "plain", text: src.substring(restStartIndex, lineEnd)});
			}

			index = lineEnd + 1;
		}
	}

	return blocks;
}
