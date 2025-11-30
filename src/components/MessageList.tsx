import { css } from "@emotion/css";
import { JSX, VNode } from "preact";
import { useCallback, useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { List, ListImperativeAPI, RowComponentProps, useDynamicRowHeight } from "react-window";

import { Message } from "..";
import Avatar from "./Avatar";

const DEFAULT_ROW_HEIGHT = 70;

// Not sure why this is necessary but it seems to fix initial load scrolling
const BOTTOM_TOLERANCE = 5;

const styles = {
	message: css({
		display: "flex",
		gap: ".5rem",
	}),
};

export default function MessageList(props: {messages: Message[]; loaderContent: VNode}) {
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
		rowCount={messages.length + 1}
		rowHeight={rowHeight}
		rowProps={{
			messages,
			loaderContent: props.loaderContent,
		}}
		listRef={listRef}
		onResize={onResize}
		onScroll={onScroll}
	/>;
}

function MessageRow(props: RowComponentProps<{messages: Message[]; loaderContent: VNode}>) {
	if(props.index === 0) {
		return props.loaderContent;
	}

	const index = props.index - 1;

	const message = props.messages[index];

	const from = message.room === null ? message.from.bare() : message.from;

	return <div style={props.style} class={styles.message}>
		<div>
			<Avatar size="md" jid={from} />
		</div>
		<div>
			<div>{message.timestamp.toLocaleString()}</div>
			<div>{from.resource === "" ? from.local : from.resource}</div>
			<blockquote>
				{message.content}
			</blockquote>
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
