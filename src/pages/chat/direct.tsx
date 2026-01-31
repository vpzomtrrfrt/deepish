import { css } from "@emotion/css";
import { useComputed } from "@preact/signals";
import { parse as parseJID } from "@xmpp/jid";
import { pushAtSortPosition } from "array-push-at-sort-position";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { useIntl } from "react-intl";
import useLatestCallback from "use-latest-callback";

import { useAppContext } from "../..";
import ConfirmTaskDialog from "../../components/ConfirmTaskDialog";
import { DataNonDoneView } from "../../components/DataView";
import Menu, { MenuItem } from "../../components/Menu";
import MessageInput from "../../components/MessageInput";
import MessageList, { LoadMoreTriggerer, MessageReplyQuoteContent } from "../../components/MessageList";
import TypingIndicator from "../../components/TypingIndicator";
import { Message, MessageEditEvent, messageEditIsAllowed, MessageEvent, MessageReactionsChangeEvent, MessageRemovalEvent, messageRemovalIsAllowed, ResultSetInfo, useAccountSig, useConnectionContext } from "../../util/connection";
import { msgActionDelete } from "../../util/langCommon";
import { getNickForCounterpart } from "../../util/profileUtil";
import { themeVars } from "../../util/theme";
import { LoadState } from "../../util/useData";
import useEventHandler from "../../util/useEventHandler";
import StanzaID, { StanzaIDType } from "../../util/xmpp/StanzaID";

const styles = {
	page: css({
		flexGrow: 1,
		marginInlineStart: ".5rem",

		display: "flex",
		flexDirection: "column",
	}),
	header: css({
		display: "flex",
		gap: ".5rem",
		alignItems: "center",

		"> h1": {
			margin: 0,
		},
	}),
	replyQuote: css({
		margin: 0,
		marginBlockEnd: ".5rem",

		padding: ".25rem",

		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: themeVars.outline1,
		borderRadius: ".5rem",

		backgroundColor: themeVars.bg1,
	}),
};

export default function DirectChatPage(props: {params: {counterpartJID: string}}) {
	const counterpartJID = decodeURIComponent(props.params.counterpartJID);

	return <DirectChatPageInner counterpartJID={counterpartJID} key={counterpartJID} />;
}

function DirectChatPageInner(props: {counterpartJID: string}) {
	const { $t } = useIntl();

	const appCtx = useAppContext();
	const conn = useConnectionContext();
	const accountSig = useAccountSig();
	const counterpart = useComputed(() => accountSig.value.counterparts.getSignal(props.counterpartJID)).value.value;

	const [messagesData, setMessagesData] = useState<{
		messages: Message[];
		messageMap: Map<string, Message>;
	}>({
		messages: [],
		messageMap: new Map(),
	});

	const unresolvedFastensRef = useRef<Map<string,
		Array<
			{type: "messageRemove"; event: MessageRemovalEvent} |
				{type: "messageEdit"; event: MessageEditEvent} |
				{type: "messageReactionsChange"; event: MessageReactionsChangeEvent}
		>
	>>(new Map());

	const onMessage = useLatestCallback((evt: MessageEvent) => {
		if(
			evt.message.room === null && (
				evt.message.from.bare().toString() === props.counterpartJID ||
					evt.message.to?.bare().toString() === props.counterpartJID
			)
		) {
			setMessagesData(current => {
				let newMessages;
				{
					let existing = undefined;
					for(const id of evt.message.ids) {
						existing = current.messageMap.get(id.toString());
						if(typeof existing !== "undefined") break;
					}

					if(typeof existing !== "undefined") {
						// Already present, but we might need to add more IDs

						const newIDs = evt.message.ids.filter(newID => existing.ids.some(x => x.equals(newID)));
						if(newIDs.length > 0) {
							const newValue = {...existing, ids: [...existing.ids, ...newIDs]};
							newMessages = current.messages.map(x => {
								if(x === existing) return newValue;
								else return x;
							});

							const newMap = new Map(current.messageMap);
							newIDs.forEach(id => {
								newMap.set(id.toString(), newValue);
							});

							return {
								messages: newMessages,
								messageMap: newMap,
							};
						}
						else {
							return current;
						}
					}
					else {
						newMessages = current.messages.slice();
					}
				}

				let message = evt.message;
				evt.message.ids.forEach(id => {
					let list = unresolvedFastensRef.current.get(id.toString());

					if(id.type === StanzaIDType.Element) {
						const list2 = unresolvedFastensRef.current.get(new StanzaID(id.type, null, id.id).toString());
						if(typeof list2 !== "undefined") {
							if(typeof list === "undefined") list = list2;
							else list = [...list, ...list2];
						}
					}

					if(typeof list !== "undefined") {
						list.forEach(entry => {
							console.log("resolving unresolved fasten", id, entry.event.target, entry);
							if(entry.type === "messageRemove") {
								if(messageRemovalIsAllowed(evt.message, entry.event)) {
									message = {...message, removal: entry.event.removal};
								}
							}
							else if(entry.type === "messageEdit") {
								if(
									messageEditIsAllowed(evt.message, entry.event) && (
										message.editedAt === null ||
											message.editedAt.getTime() < entry.event.edit.timestamp.getTime()
									)
								) {
									message = {
										...message,
										content: entry.event.edit.content,
										editedAt: entry.event.edit.timestamp,
									};
								}
							}
							else if(entry.type === "messageReactionsChange") {
								const key = entry.event.from.jid.toString() + "/" + (
									typeof entry.event.from.occupantID === "undefined" ?
										"" :
										encodeURIComponent(entry.event.from.occupantID)
								);
								const reactionsEntry = message.reactions.get(key);

								if(
									typeof reactionsEntry === "undefined" ||
										reactionsEntry.timestamp.getTime() < entry.event.reactions.timestamp.getTime()
								) {
									const newReactions = new Map(message.reactions);
									newReactions.set(key, entry.event.reactions);

									message = {
										...message,
										reactions: newReactions,
									};
								}
							}
						});
						unresolvedFastensRef.current.delete(id.toString());
					}
				});

				const newMap = new Map(current.messageMap);
				evt.message.ids.forEach(id => {
					newMap.set(id.toString(), message);
				});

				pushAtSortPosition(
					newMessages,
					message,
					(a, b) => (a.timestamp - b.timestamp) as (0 | 1 | -1), // it's not but should be fine
					0,
				);

				return {
					messages: newMessages,
					messageMap: newMap,
				};
			});
		}
	});
	useEventHandler(conn, "message", onMessage);

	const onMessageRemove = useLatestCallback((evt: MessageRemovalEvent) => {
		if(evt.room !== null) return;

		setMessagesData(current => {
			const newMessageMap = new Map(current.messageMap);

			let anyHit = false;

			const newMessages = current.messages.map(message => {
				if(message.ids.some(x => x.equals(evt.target))) {
					if(messageRemovalIsAllowed(message, evt)) {
						const newValue: Message = {
							...message,
							removal: evt.removal,
						};

						message.ids.forEach(id => {
							newMessageMap.set(id.toString(), newValue);
						});

						anyHit = true;

						return newValue;
					}
				}

				return message;
			});

			if(anyHit) {
				return {messages: newMessages, messageMap: newMessageMap};
			}
			else {
				console.log("got unresolved removal", evt);

				let list = unresolvedFastensRef.current.get(evt.target.toString());
				if(typeof list === "undefined") {
					list = [];
					unresolvedFastensRef.current.set(evt.target.toString(), list);
				}
				list.push({type: "messageRemove", event: evt});

				return current;
			}
		});
	});
	useEventHandler(conn, "messageRemove", onMessageRemove);

	const onMessageEdit = useLatestCallback((evt: MessageEditEvent) => {
		if(evt.room !== null) return;

		setMessagesData(current => {
			const newMessageMap = new Map(current.messageMap);

			let anyHit = false;

			const newMessages = current.messages.map(message => {
				if(message.ids.some(x => x.equals(evt.target))) {
					if(messageEditIsAllowed(message, evt) && (
						message.editedAt === null ||
							message.editedAt.getTime() < evt.edit.timestamp.getTime()
					)) {
						const newValue: Message = {
							...message,
							content: evt.edit.content,
							editedAt: evt.edit.timestamp,
						};

						message.ids.forEach(id => {
							newMessageMap.set(id.toString(), newValue);
						});

						anyHit = true;

						return newValue;
					}
				}

				return message;
			});

			if(anyHit) {
				return {messages: newMessages, messageMap: newMessageMap};
			}
			else {
				console.log("got unresolved edit", evt.target, evt);

				let list = unresolvedFastensRef.current.get(evt.target.toString());
				if(typeof list === "undefined") {
					list = [];
					unresolvedFastensRef.current.set(evt.target.toString(), list);
				}
				list.push({type: "messageEdit", event: evt});

				return current;
			}
		});
	});
	useEventHandler(conn, "messageEdit", onMessageEdit);

	const onMessageReactionsChange = useLatestCallback((evt: MessageReactionsChangeEvent) => {
		if(evt.room !== null) return;

		setMessagesData(current => {
			const newMessageMap = new Map(current.messageMap);

			let anyHit = false;

			const newMessages = current.messages.map(message => {
				if(message.ids.some(x => x.equals(evt.target, true))) {
					const key = evt.from.jid.bare().toString() + "/";
					const entry = message.reactions.get(key);

					if(typeof entry === "undefined" || entry.timestamp.getTime() < evt.reactions.timestamp.getTime()) {
						const newReactions = new Map(message.reactions);
						newReactions.set(key, evt.reactions);

						const newValue: Message = {
							...message,
							reactions: newReactions,
						};

						message.ids.forEach(id => {
							newMessageMap.set(id.toString(), newValue);
						});

						anyHit = true;

						return newValue;
					}
				}

				return message;
			});

			if(anyHit) {
				return {messages: newMessages, messageMap: newMessageMap};
			}
			else {
				console.log("got unresolved edit", evt);

				let list = unresolvedFastensRef.current.get(evt.target.toString());
				if(typeof list === "undefined") {
					list = [];
					unresolvedFastensRef.current.set(evt.target.toString(), list);
				}
				list.push({type: "messageReactionsChange", event: evt});

				return current;
			}
		});
	});
	useEventHandler(conn, "messageReactionsChange", onMessageReactionsChange);

	const [pageState, setPageState] = useState<LoadState<ResultSetInfo | null> | null>(null);

	const nextPageRef = useRef<string | null>(null);

	const loadMore = useLatestCallback(() => {
		setPageState(LoadState.loading);

		conn.requestArchive(accountSig.value.jid, accountSig.value.jid, {with: counterpart!.jid}, nextPageRef.current ?? undefined)
			.then(value => {
				nextPageRef.current = value === null ? null : value.firstItem;
				setPageState(LoadState.wrapValue(value));
			})
			.catch(err => {
				setPageState(LoadState.wrapError(err));
			});
	});

	useEffect(() => {
		if(typeof counterpart !== "undefined" && pageState === null) {
			loadMore();
		}
	}, [pageState, loadMore, accountSig.value.connected, counterpart]);

	useEffect(() => {
		if(typeof counterpart !== "undefined") {
			conn.markCounterpartAsVisible.call(undefined, accountSig.value.jid, counterpart.jid);
		}
	}, [accountSig.value.jid, conn.markCounterpartAsVisible, counterpart]);

	useEffect(() => {
		// TODO skip marking when scrolled up
		if(
			pageState !== null &&
				pageState.state === "done" &&
				messagesData.messages.length > 0 &&
				typeof counterpart !== "undefined"
		) {
			const lastMessage = messagesData.messages[messagesData.messages.length - 1];
			const lastMessageID = lastMessage.ids.find(x => {
				return x.type === StanzaIDType.Stanza && x.by !== null && x.by.equals(accountSig.value.jid);
			});
			if(typeof lastMessageID !== "undefined" && counterpart.lastReadMessageID !== lastMessageID.id) {
				conn.markCounterpartAsRead.call(undefined, accountSig.value.jid, counterpart.jid, lastMessageID.id, false);
			}
		}
	}, [accountSig.value.jid, conn.markCounterpartAsRead, counterpart, messagesData.messages, pageState]);

	const submitMessage = useLatestCallback(async (newMessage: string, options?: {replaces?: string}) => {
		await conn.sendMessageToCounterpart(accountSig.value.jid, counterpart!.jid, {body: newMessage}, options);
	});

	const submitEdit = useLatestCallback(async (newMessage: string, replaces: string) => {
		return submitMessage(newMessage, {replaces});
	});

	const submitReactions = useLatestCallback(async (reactions: string[], message: Message) => {
		const id = message.ids.find(x => x.type === StanzaIDType.Element);
		if(typeof id === "undefined") throw new Error("Cannot react to this message");

		await conn.sendMessageReactionsToCounterpart.call(
			undefined,
			accountSig.value.jid,
			parseJID(props.counterpartJID),
			id.id,
			reactions,
		);
	});

	const onChangeComposing = useLatestCallback((composing: boolean) => {
		conn.setComposingToCounterpart(accountSig.value.jid, parseJID(props.counterpartJID), composing);
	});

	const retractMessage = useCallback((messageID: string) => {
		appCtx.showDialog.call(
			undefined,
			<ConfirmTaskDialog
				submit={async () => {
					return conn.retractMessageToCounterpart.call(
						undefined,
						accountSig.value.jid,
						parseJID(props.counterpartJID),
						messageID,
					);
				}}
				confirmText={$t(msgActionDelete)}
			>
				{$t({defaultMessage: "Are you sure you want to delete this message?"})}
			</ConfirmTaskDialog>
		);
	}, [$t, accountSig.value.jid, appCtx.showDialog, conn.retractMessageToCounterpart, props.counterpartJID]);

	const renderReply = useCallback((message: Message) => {
		if(message.replyingTo === null) return null;

		const target = messagesData.messageMap.get(message.replyingTo.id.toString());
		if(typeof target === "undefined") return null;

		return <blockquote class={styles.replyQuote}>
			<MessageReplyQuoteContent message={target} />
		</blockquote>;
	}, [messagesData.messageMap]);

	const renderMenu = useCallback((message: Message, setMenuOpen: (value: boolean) => void) => {
		const items = [];

		if(message.from.bare().equals(accountSig.value.jid)) {
			const id = message.ids.find(x => {
				return x.type === StanzaIDType.Element && x.by !== null && x.by.equals(accountSig.value.jid);
			});
			if(typeof id !== "undefined") {
				items.push(
					<MenuItem onClick={retractMessage.bind(undefined, id.id)}>{$t({defaultMessage: "Delete Message"})}</MenuItem>
				);
			}
		}

		if(items.length < 1) return null;
		else {
			return <Menu onOpenChange={setMenuOpen}>{items}</Menu>;
		}
	}, [$t, accountSig.value.jid, retractMessage]);

	const canEdit = useCallback((message: Message) => {
		if(message.from.bare().equals(accountSig.value.jid)) {
			const id = message.ids.find(x => {
				return x.type === StanzaIDType.Element && x.by !== null && x.by.equals(accountSig.value.jid);
			});
			if(typeof id !== "undefined") {
				return true;
			}
		}

		return false;
	}, [accountSig.value.jid]);

	useEffect(() => {
		return () => onChangeComposing(false);
	}, [onChangeComposing]);

	const loaderContent = pageState === null ?
		<p>{$t({defaultMessage: "Connecting…"})}</p> :
		LoadState.ifDone(
			pageState,
			info => info === null ?
				<p>{$t({defaultMessage: "No more messages known."})}</p> :
				<LoadMoreTriggerer loadMore={loadMore} />,
			pageState => <DataNonDoneView state={pageState} />,
		);

	return <div class={styles.page}>
		<div class={styles.header}>
			{typeof counterpart !== "undefined" && <h1>
				{getNickForCounterpart(counterpart)}
			</h1>}
			<div>{props.counterpartJID}</div>
		</div>
		<MessageList
			messages={messagesData.messages}
			loaderContent={loaderContent}
			renderMenu={renderMenu}
			renderReply={renderReply}
			submitEdit={submitEdit}
			canEdit={canEdit}
			submitReactions={submitReactions}
		/>
		<TypingIndicator
			usersTyping={(typeof counterpart !== "undefined" && counterpart.composingFrom) ? [counterpart.jid] : []}
			inRoom={false}
		/>
		<MessageInput submitMessage={submitMessage} autofocus onChangeComposing={onChangeComposing} />
	</div>;
}
