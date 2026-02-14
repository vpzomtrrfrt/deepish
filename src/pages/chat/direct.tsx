import { css } from "@emotion/css";
import { computed, effect, signal, useComputed } from "@preact/signals";
import { Show, useLiveSignal } from "@preact/signals/utils";
import { JID, parse as parseJID } from "@xmpp/jid";
import { createRef } from "preact";
import { useMemo } from "preact/hooks";
import { useIntl } from "react-intl";

import { useAppContext } from "../..";
import ConfirmTaskDialog from "../../components/ConfirmTaskDialog";
import { DataNonDoneView } from "../../components/DataView";
import Menu, { MenuItem } from "../../components/Menu";
import MessageInput from "../../components/MessageInput";
import MessageList, { LoadMoreTriggerer, MessageSourceDialog, ReplyingIndicator } from "../../components/MessageList";
import TypingIndicator from "../../components/TypingIndicator";
import { Message, ResultSetInfo, useAccountSig, useConnectionContext } from "../../util/connection";
import createComponent from "../../util/createComponent";
import { msgActionDelete } from "../../util/langCommon";
import { MessageCache } from "../../util/messageCache";
import { getNickForCounterpart } from "../../util/profileUtil";
import { LoadState } from "../../util/useData";
import { StanzaIDType } from "../../util/xmpp/StanzaID";

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
};

export default function DirectChatPage(props: {params: {counterpartJID: string}}) {
	const { $t } = useIntl();

	const counterpartJID = useMemo(() => {
		try {
			return parseJID(decodeURIComponent(props.params.counterpartJID))
		}
		catch(ex) {
			console.error(ex);
			return undefined;
		}
	}, [props.params.counterpartJID]);

	if(typeof counterpartJID === "undefined") {
		return <div>{$t({defaultMessage: "Invalid address"})}</div>;
	}

	return <DirectChatPageInner counterpartJID={counterpartJID} key={counterpartJID} />;
}

const DirectChatPageInner = createComponent(
	(props: {counterpartJID: JID}) => {
		const intlSig = useLiveSignal(useIntl());

		const appCtxSig = useLiveSignal(useAppContext());

		const conn = useConnectionContext();
		const accountSig = useAccountSig();
		const accountJID = useComputed(() => accountSig.value.jid).value;

		return useMemo(() => ({
			intlSig,

			appCtxSig,

			conn,
			accountSig,
			accountJID,

			counterpartJID: props.counterpartJID,
		}), [accountJID, accountSig, appCtxSig, conn, intlSig, props.counterpartJID]);
	},
	({intlSig, appCtxSig, conn, accountSig, accountJID, counterpartJID}) => {
		const counterpartSig = computed(() => accountSig.value.counterparts.get(counterpartJID.toString()));

		const msgCache = new MessageCache(accountJID, {type: "direct", jid: counterpartJID}, conn);
		const pageStateSig = signal<LoadState<ResultSetInfo | null> | null>(null);

		function loadMore() {
			pageStateSig.value = LoadState.loading;

			msgCache.loadMore()
				.then(value => {
					pageStateSig.value = LoadState.wrapValue(value);
				})
				.catch(err => {
					pageStateSig.value = LoadState.wrapError(err);
				});
		}

		effect(() => {
			if(typeof counterpartSig.value !== "undefined" && pageStateSig.value === null) {
				loadMore();
			}
		});

		effect(() => {
			if(typeof counterpartSig.value !== "undefined") {
				conn.markCounterpartAsVisible.call(undefined, accountJID, counterpartJID);
			}
		});

		effect(() => {
			const messages = msgCache.getMessages();

			// TODO skip marking when scrolled up
			if(
				pageStateSig.value !== null &&
					pageStateSig.value.state === "done" &&
					messages.length > 0 &&
					typeof counterpartSig.value !== "undefined"
			) {
				const lastMessage = messages[messages.length - 1];
				const lastMessageID = lastMessage.ids.find(x => {
					return x.type === StanzaIDType.Stanza && x.by !== null && x.by.equals(accountJID);
				});
				if(typeof lastMessageID !== "undefined" && counterpartSig.value.lastReadMessageID !== lastMessageID.id) {
					conn.markCounterpartAsRead.call(undefined, accountJID, counterpartJID, lastMessageID.id, false);
				}
			}
		});

		const replyingToSig = signal<Message | null>(null);

		function cancelReply() {
			replyingToSig.value = null;

			inputRef.current!.focus();
		}

		const inputRef = createRef<HTMLTextAreaElement>();

		function startReply(message: Message) {
			replyingToSig.value = message;

			inputRef.current!.focus();
		}

		function submitMessage(newMessage: string, options?: {replaces?: string}) {
			conn.sendMessageToCounterpart(
				accountJID,
				counterpartJID,
				{body: newMessage},
				{replyingTo: replyingToSig.value ?? undefined, ...options},
			);

			replyingToSig.value = null;
		}

		async function submitEdit(newMessage: string, replaces: string) {
			return submitMessage(newMessage, {replaces});
		}

		async function submitReactions(reactions: string[], message: Message) {
			const id = message.ids.find(x => x.type === StanzaIDType.Element);
			if(typeof id === "undefined") throw new Error("Cannot react to this message");

			await conn.sendMessageReactionsToCounterpart.call(
				undefined,
				accountJID,
				counterpartJID,
				id.id,
				reactions,
			);
		}

		function onChangeComposing(composing: boolean) {
			conn.setComposingToCounterpart(accountJID, counterpartJID, composing);
		}

		function retractMessage(messageID: string) {
			const { $t } = intlSig.value;

			appCtxSig.value.showDialog.call(
				undefined,
				<ConfirmTaskDialog
					submit={async () => {
						return conn.retractMessageToCounterpart.call(
							undefined,
							accountJID,
							counterpartJID,
							messageID,
						);
					}}
					confirmText={$t(msgActionDelete)}
				>
					{$t({defaultMessage: "Are you sure you want to delete this message?"})}
				</ConfirmTaskDialog>
			);
		}

		function showSourceDialog(message: Message) {
			appCtxSig.value.showDialog.call(undefined, <MessageSourceDialog message={message} />);
		}

		function renderMenu(message: Message, setMenuOpen: (value: boolean) => void) {
			const { $t } = intlSig.value;

			const items = [];

			if(message.from.bare().equals(accountJID)) {
				const id = message.ids.find(x => {
					return x.type === StanzaIDType.Element && x.by !== null && x.by.equals(accountJID);
				});
				if(typeof id !== "undefined") {
					items.push(
						<MenuItem onClick={retractMessage.bind(undefined, id.id)}>{$t({defaultMessage: "Delete Message"})}</MenuItem>
					);
				}
			}

			items.push(
				<MenuItem onClick={showSourceDialog.bind(undefined, message)}>
					{$t({defaultMessage: "View Source"})}
				</MenuItem>,
			);

			if(items.length < 1) return null;
			else {
				return <Menu onOpenChange={setMenuOpen}>{items}</Menu>;
			}
		}

		function canEdit(message: Message) {
			if(message.from.bare().equals(accountJID)) {
				const id = message.ids.find(x => {
					return x.type === StanzaIDType.Element && x.by !== null && x.by.equals(accountJID);
				});
				if(typeof id !== "undefined") {
					return true;
				}
			}

			return false;
		}

		function onInputKeyDown(evt: KeyboardEvent) {
			if(evt.code === "Escape") {
				if(replyingToSig.value !== null) {
					evt.preventDefault();
					cancelReply();
				}
			}
		}

		effect(() => {
			return () => onChangeComposing(false);
		});

		const loaderContent = computed(() => {
			const { $t } = intlSig.value;

			return pageStateSig.value === null ?
				<p>{$t({defaultMessage: "Connecting…"})}</p> :
				LoadState.ifDone(
					pageStateSig.value,
					info => info === null ?
						<p>{$t({defaultMessage: "No more messages known."})}</p> :
						<LoadMoreTriggerer loadMore={loadMore} />,
					pageState => <DataNonDoneView state={pageState} />,
				);
		});

		const nickSig = computed(() => {
			return typeof counterpartSig.value === "undefined" ?
				undefined :
				getNickForCounterpart(counterpartSig.value);
		});

		const usersTypingSig = computed(() => {
			return (typeof counterpartSig.value !== "undefined" && counterpartSig.value.composingFrom) ?
				[counterpartJID] :
				[];
		});

		return () => {
			return <div class={styles.page}>
				<div class={styles.header}>
					<Show when={nickSig}>
						<h1>{nickSig}</h1>
					</Show>
					<div>{counterpartJID.toString()}</div>
				</div>
				<MessageList
					msgCache={msgCache}
					loaderContent={loaderContent}
					renderMenu={renderMenu}
					submitEdit={submitEdit}
					canEdit={canEdit}
					submitReactions={submitReactions}
					startReply={startReply}
				/>
				<div onKeyDown={onInputKeyDown}>
					<TypingIndicator
						usersTyping={usersTypingSig}
						inRoom={false}
					/>
					<Show when={replyingToSig}>
						{replyingTo => <ReplyingIndicator message={replyingTo} cancelReply={cancelReply} />}
					</Show>
					<MessageInput submitMessage={submitMessage} autofocus onChangeComposing={onChangeComposing} ref={inputRef} />
				</div>
			</div>;
		};
	}
);
