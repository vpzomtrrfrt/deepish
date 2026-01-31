import { css } from "@emotion/css";
import { useComputed } from "@preact/signals";
import { JID, parse as parseJID } from "@xmpp/jid";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useIntl } from "react-intl";
import useLatestCallback from "use-latest-callback";

import { useAppContext } from "../..";
import ConfirmTaskDialog from "../../components/ConfirmTaskDialog";
import { DataNonDoneView } from "../../components/DataView";
import Menu, { MenuItem } from "../../components/Menu";
import MessageInput from "../../components/MessageInput";
import MessageList, { LoadMoreTriggerer, MessageSourceDialog } from "../../components/MessageList";
import TypingIndicator from "../../components/TypingIndicator";
import { Message, ResultSetInfo, useAccountSig, useConnectionContext } from "../../util/connection";
import { msgActionDelete } from "../../util/langCommon";
import { useCreateMessageCache } from "../../util/messageCache";
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

function DirectChatPageInner(props: {counterpartJID: JID}) {
	const { $t } = useIntl();

	const appCtx = useAppContext();
	const conn = useConnectionContext();
	const accountSig = useAccountSig();
	const counterpart = useComputed(() => accountSig.value.counterparts.getSignal(props.counterpartJID.toString())).value.value;

	const msgCache = useCreateMessageCache(useMemo(() => ({type: "direct", jid: props.counterpartJID}), [props.counterpartJID]));
	const [pageState, setPageState] = useState<LoadState<ResultSetInfo | null> | null>(null);

	const nextPageRef = useRef<string | null>(null);

	const loadMore = useLatestCallback(() => {
		setPageState(LoadState.loading);

		conn.requestArchive(accountSig.value.jid, accountSig.value.jid, {with: props.counterpartJID}, nextPageRef.current ?? undefined)
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

	const messages = msgCache.getMessages();

	useEffect(() => {
		// TODO skip marking when scrolled up
		if(
			pageState !== null &&
				pageState.state === "done" &&
				messages.length > 0 &&
				typeof counterpart !== "undefined"
		) {
			const lastMessage = messages[messages.length - 1];
			const lastMessageID = lastMessage.ids.find(x => {
				return x.type === StanzaIDType.Stanza && x.by !== null && x.by.equals(accountSig.value.jid);
			});
			if(typeof lastMessageID !== "undefined" && counterpart.lastReadMessageID !== lastMessageID.id) {
				conn.markCounterpartAsRead.call(undefined, accountSig.value.jid, counterpart.jid, lastMessageID.id, false);
			}
		}
	}, [accountSig.value.jid, conn.markCounterpartAsRead, counterpart, messages, pageState]);

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
			props.counterpartJID,
			id.id,
			reactions,
		);
	});

	const onChangeComposing = useLatestCallback((composing: boolean) => {
		conn.setComposingToCounterpart(accountSig.value.jid, props.counterpartJID, composing);
	});

	const retractMessage = useCallback((messageID: string) => {
		appCtx.showDialog.call(
			undefined,
			<ConfirmTaskDialog
				submit={async () => {
					return conn.retractMessageToCounterpart.call(
						undefined,
						accountSig.value.jid,
						props.counterpartJID,
						messageID,
					);
				}}
				confirmText={$t(msgActionDelete)}
			>
				{$t({defaultMessage: "Are you sure you want to delete this message?"})}
			</ConfirmTaskDialog>
		);
	}, [$t, accountSig.value.jid, appCtx.showDialog, conn.retractMessageToCounterpart, props.counterpartJID]);

	const showSourceDialog = useCallback((message: Message) => {
		appCtx.showDialog.call(undefined, <MessageSourceDialog message={message} />);
	}, [appCtx.showDialog]);

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

		items.push(
			<MenuItem onClick={showSourceDialog.bind(undefined, message)}>
				{$t({defaultMessage: "View Source"})}
			</MenuItem>,
		);

		if(items.length < 1) return null;
		else {
			return <Menu onOpenChange={setMenuOpen}>{items}</Menu>;
		}
	}, [$t, accountSig.value.jid, retractMessage, showSourceDialog]);

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
			<div>{props.counterpartJID.toString()}</div>
		</div>
		<MessageList
			msgCache={msgCache}
			loaderContent={loaderContent}
			renderMenu={renderMenu}
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
