import "./global.css";

import { Tooltip } from "@base-ui/react/tooltip";
import { css } from "@emotion/css";
import { IDBCache } from "@instructure/idb-cache";
import { Signal, signal, useComputed, useSignalEffect } from "@preact/signals";
import { useMediaQuery } from "@react-hook/media-query";
import { parse as parseJID } from "@xmpp/jid";
import { createContext, RefObject, render, VNode } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { defineMessage, IntlProvider, MessageDescriptor, MissingTranslationError, useIntl } from "react-intl";
import useLatestCallback from "use-latest-callback";
import { Redirect, Route, useLocation, useRoute } from "wouter-preact";

import DataView from "./components/DataView";
import DialogContainer, { DialogContainerRef } from "./components/DialogContainer";
import ChatPage from "./pages/chat";
import LoginPage from "./pages/login";
import { ConnectionContext, MessageContent, MessageEvent, NotificationLevel, useAccountSig, useConnectionContext, useCreateConnection } from "./util/connection";
import matchLocale from "./util/matchLocale";
import { maybeGetNickForCounterpart } from "./util/profileUtil";
import { useSignalMapKeysWhereValueMatches } from "./util/SignalMap";
import { themeCSS, themeVars } from "./util/theme";
import { NotificationCategory } from "./util/types";
import useData, { LoadState } from "./util/useData";
import useEffectOnce from "./util/useEffectOnce";
import useEventHandler from "./util/useEventHandler";

const SUPPORTED_LANGUAGES = ["en", "eo"];
const DEFAULT_LANGUAGE = "en";

const NOTIFICATIONS_CONTENT_TYPE_PRIORITY: Array<MessageContent["type"]> = ["xhtml", "0393", "plain"];

export type NotificationsSettings = Partial<Record<NotificationCategory, NotificationLevel>>;

export const DEFAULT_NOTIFICATIONS_SETTINGS: Record<NotificationCategory, NotificationLevel> = {
	[NotificationCategory.Direct]: NotificationLevel.Always,
	[NotificationCategory.Room]: NotificationLevel.Never,
};

export const NOTIFICATION_LEVEL_NAMES: Record<NotificationLevel.Never | NotificationLevel.Always, MessageDescriptor> = {
	[NotificationLevel.Never]: defineMessage({
		defaultMessage: "Never",
	}),
	[NotificationLevel.Always]: defineMessage({
		defaultMessage: "All Messages",
	}),
};

export interface AppContext {
	cache: IDBCache;
	notificationsPermissionState: LoadState<PermissionState>;
	notificationsSettings: NotificationsSettings;
	setNotificationsSettings(
		value: NotificationsSettings | ((current: NotificationsSettings) => NotificationsSettings),
	): void;

	portalContainerRef: RefObject<HTMLDivElement>;

	requestNotificationsPermission(): Promise<void>;
	showDialog(content: VNode): void;
}

export const AppContext = createContext<undefined | AppContext>(undefined);

export function useAppContext(): AppContext {
	const appCtx = useContext(AppContext);

	if(typeof appCtx === "undefined") throw new Error("useAppContext used outside App");

	return appCtx;
}

const styles = {
	appWrapper: css({
		width: "100vw",
		height: "100vh",
		backgroundColor: themeVars.bg0,
		color: themeVars.textOn1,
	}),
};

function App() {
	const [location] = useLocation();

	const cache = useMemo(() => new IDBCache({dbName: "deepish-cache", cacheBuster: "3", cacheKey: "dummy"}), []);

	const [notificationsPermissionState, setNotificationsPermissionState] = useState<LoadState<PermissionState>>(
		LoadState.loading,
	);

	useEffect(() => {
		Promise.resolve()
			.then(() => navigator.permissions.query({name: "notifications"}))
			.then(state => {
				setNotificationsPermissionState(LoadState.wrapValue(state.state));

				state.addEventListener("change", () => {
					setNotificationsPermissionState(LoadState.wrapValue(state.state));
				});
			})
			.catch(err => {
				setNotificationsPermissionState(LoadState.wrapError(err));
			});
	}, []);

	const portalContainerRef = useRef<HTMLDivElement>(null);
	const dialogContainerRef = useRef<DialogContainerRef>(null);

	const requestNotificationsPermission = useLatestCallback(async () => {
		await Notification.requestPermission();
	});

	const showDialog = useCallback((content: VNode) => {
		dialogContainerRef.current!.showDialog(content);
	}, []);

	const notificationsSettingsSig = useMemo<Signal<NotificationsSettings>>(() => {
		let value: NotificationsSettings = {};

		const str = localStorage.getItem("deepishNotifications");
		if(str !== null) {
			try {
				value = JSON.parse(str);
			}
			catch(err) {
				console.error(err);
			}
		}

		return signal(value);
	}, []);

	const setNotificationsSettings = useCallback((
		value: NotificationsSettings | ((current: NotificationsSettings) => NotificationsSettings),
	) => {
		const newValue = typeof value === "function" ? value(notificationsSettingsSig.value) : value;
		localStorage.setItem("deepishNotifications", JSON.stringify(newValue));
		notificationsSettingsSig.value = newValue;
	}, [notificationsSettingsSig]);

	const appCtx = useMemo(
		() => ({
			notificationsPermissionState,
			notificationsSettings: notificationsSettingsSig.value,
			setNotificationsSettings,
			portalContainerRef,
			cache,

			requestNotificationsPermission,
			showDialog,
		} satisfies AppContext),
		[
			cache,
			notificationsPermissionState,
			notificationsSettingsSig.value,
			requestNotificationsPermission,
			setNotificationsSettings,
			showDialog,
		],
	);

	useEffect(() => {
		if(dialogContainerRef.current !== null) dialogContainerRef.current.closeAll();
	}, [location]);

	const connection = useCreateConnection(cache, notificationsSettingsSig);

	const lang = useMemo(() => {
		// TODO check again on language change event

		return matchLocale(navigator.languages, SUPPORTED_LANGUAGES) ?? "en";
	}, []);

	const messagesState = useData(async () => {
		if(lang === DEFAULT_LANGUAGE) {
			return {};
		}

		const content = await import(`./lang/${lang}.json`);

		return content.default;
	}, [lang]);

	const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");

	// This used to trigger a lint warning but doesn't anymore for some reason
	(window as unknown as {deepishConnection: unknown}).deepishConnection = connection;

	if(!connection.inited) return null;

	return <AppContext.Provider value={appCtx}>
		<ConnectionContext.Provider value={connection}>
			<IntlProvider
				messages={LoadState.ifDone(messagesState, x => x, () => ({}))}
				locale={lang}
				onError={onIntlError}
			>
				<DataView state={messagesState}>
					{() => {
						return <div class={styles.appWrapper} style={prefersDark ? themeCSS.dark : themeCSS.light}>
							<Tooltip.Provider>
								<AppContent />
							</Tooltip.Provider>
							<DialogContainer ref={dialogContainerRef} />
							<div style={{position: "absolute"}} ref={portalContainerRef} />
						</div>
					}}
				</DataView>
			</IntlProvider>
		</ConnectionContext.Provider>
	</AppContext.Provider>;
}

render(<App />, document.getElementById("root") as HTMLDivElement);

function AppContent() {
	const { $t } = useIntl();

	const connection = useConnectionContext();
	const accountSig = useAccountSig();

	const directMatch = useRoute("/chat/direct/:counterpartJID");
	const roomMatch = useRoute("/chat/rooms/:roomJID");

	const onMessage = useLatestCallback((evt: MessageEvent) => {
		if(evt.shouldNotify) {
			let contact = evt.message.from;
			if(evt.message.room === null) contact = contact.bare();

			let isActive = false;
			if(directMatch[0]) {
				if(decodeURIComponent(directMatch[1].counterpartJID) === contact.toString()) isActive = true;
			}
			if(roomMatch[0]) {
				if(
					evt.message.room !== null &&
						decodeURIComponent(roomMatch[1].roomJID) === evt.message.room.toString()
				) {
					isActive = true;
				}
			}

			if(!isActive) {
				console.log("notifying", evt);
				const account = connection.getAccount(evt.account);
				const counterpart = account.counterparts.get(contact.toString());

				let bestContent = evt.message.content[0];
				for(let i = 1; i < evt.message.content.length; i++) {
					const current = evt.message.content[i];

					if(
						NOTIFICATIONS_CONTENT_TYPE_PRIORITY.indexOf(current.type) >
							NOTIFICATIONS_CONTENT_TYPE_PRIORITY.indexOf(bestContent.type)
					) {
						bestContent = current;
					}
				}

				new Notification(
					$t(
						{defaultMessage: "New message from {name}"},
						{name: maybeGetNickForCounterpart(contact, counterpart)},
					),
					{
						body: bestContent.content.toString(),
					},
				);
			}
		}
	});

	useEventHandler(connection, "message", onMessage);

	const unreadConversationsSig = useSignalMapKeysWhereValueMatches(
		accountSig.value.counterparts,
		counterpart => {
			return counterpart.lastMessageIDForUnread !== null &&
				counterpart.lastReadMessageID !== counterpart.lastMessageIDForUnread &&
				counterpart.lastReadMessageID !== counterpart.lastMessageID;
		},
		true,
	);
	const hasUnreadConversationsSig = useComputed(() => unreadConversationsSig.value.length > 0);

	useSignalEffect(() => {
		document.title = "Deepish" + (hasUnreadConversationsSig.value ? " *" : "");
	});

	return <>
		<Route path="/" component={RootPage} />
		<Route path="/chat" component={ChatPage} nest />
		<Route path="/login" component={LoginPage} />
		<Route path="/logout/:jid" component={LogoutPage} />
	</>;
}

function RootPage() {
	const conn = useConnectionContext();

	const hasAccount = useComputed(() => conn.accountsSig.value.length > 0);

	if(hasAccount.value) {
		return <ChatPage />;
	}
	else {
		return <Redirect to="~/login" />;
	}
}

function LogoutPage(props: {params: {jid: string}}) {
	const [, navigate] = useLocation();
	const conn = useConnectionContext();

	useEffectOnce(() => {
		conn.logout(parseJID(decodeURIComponent(props.params.jid)));

		navigate("~/login");
	});

	return null;
}

function onIntlError(err: unknown) {
	if(err instanceof MissingTranslationError) {
		// This is fine, just fall back to default message
	}
	else {
		console.error(err);
	}
}
