import "./global.css";

import { Tooltip } from "@base-ui/react/tooltip";
import { css } from "@emotion/css";
import { IDBCache } from "@instructure/idb-cache";
import { useMediaQuery } from "@react-hook/media-query";
import { parse as parseJID } from "@xmpp/jid";
import { createContext, RefObject, render, VNode } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { IntlProvider, MissingTranslationError, useIntl } from "react-intl";
import useLatestCallback from "use-latest-callback";
import { Redirect, Route, useLocation, useRoute } from "wouter-preact";

import DataView from "./components/DataView";
import DialogContainer, { DialogContainerRef } from "./components/DialogContainer";
import ChatPage from "./pages/chat";
import LoginPage from "./pages/login";
import { ConnectionContext, MessageEvent, useConnectionContext, useCreateConnection } from "./util/connection";
import matchLocale from "./util/matchLocale";
import { maybeGetNickForCounterpart } from "./util/profileUtil";
import { themeCSS, themeVars } from "./util/theme";
import useData, { LoadState } from "./util/useData";
import useEffectOnce from "./util/useEffectOnce";
import useEventHandler from "./util/useEventHandler";

const SUPPORTED_LANGUAGES = ["en", "eo"];
const DEFAULT_LANGUAGE = "en";

export interface AppContext {
	cache: IDBCache;
	notificationsPermissionState: LoadState<string>;

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

	const appCtx = useMemo(
		() => ({
			notificationsPermissionState,
			portalContainerRef,
			cache,

			requestNotificationsPermission,
			showDialog,
		} satisfies AppContext),
		[cache, notificationsPermissionState, requestNotificationsPermission, showDialog],
	);

	useEffect(() => {
		if(dialogContainerRef.current !== null) dialogContainerRef.current.closeAll();
	}, [location]);

	const connection = useCreateConnection(cache);

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
							<Tooltip.Provider delay={0}>
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

	const directMatch = useRoute("/chat/direct/:counterpartJID");

	const onMessage = useLatestCallback((evt: MessageEvent) => {
		if(evt.shouldNotify) {
			let contact = evt.message.from;
			if(evt.message.room === null) contact = contact.bare();

			let isActive = false;
			if(directMatch[0]) {
				if(decodeURIComponent(directMatch[1].counterpartJID) === contact.toString()) isActive = true;
			}

			if(!isActive) {
				console.log("notifying", evt);
				const account = connection.accounts.find(x => x.jid.equals(evt.account));
				if(typeof account !== "undefined") {
					const counterpart = account.counterparts.get(contact.toString());

					new Notification(
						$t(
							{defaultMessage: "New message from {name}"},
							{name: maybeGetNickForCounterpart(contact, counterpart)},
						),
						{
							body: evt.message.content,
						},
					);
				}
			}
		}
	});

	useEventHandler(connection, "message", onMessage);

	return <>
		<Route path="/" component={RootPage} />
		<Route path="/chat" component={ChatPage} nest />
		<Route path="/login" component={LoginPage} />
		<Route path="/logout/:jid" component={LogoutPage} />
	</>;
}

function RootPage() {
	const conn = useConnectionContext();

	if(conn.accounts.length > 0) {
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
