import "./global.css";

import { Tooltip } from "@base-ui/react/tooltip";
import { css } from "@emotion/css";
import { IDBCache } from "@instructure/idb-cache";
import { useMediaQuery } from "@react-hook/media-query";
import { parse as parseJID } from "@xmpp/jid";
import { createContext, RefObject, render, VNode } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef } from "preact/hooks";
import { IntlProvider, MissingTranslationError } from "react-intl";
import { Redirect, Route, useLocation } from "wouter-preact";

import DataView from "./components/DataView";
import DialogContainer, { DialogContainerRef } from "./components/DialogContainer";
import ChatPage from "./pages/chat";
import LoginPage from "./pages/login";
import { ConnectionContext, useConnectionContext, useCreateConnection } from "./util/connection";
import matchLocale from "./util/matchLocale";
import { themeCSS, themeVars } from "./util/theme";
import useData, { LoadState } from "./util/useData";
import useEffectOnce from "./util/useEffectOnce";

const SUPPORTED_LANGUAGES = ["en", "eo"];
const DEFAULT_LANGUAGE = "en";

export interface AppContext {
	cache: IDBCache;

	portalContainerRef: RefObject<HTMLDivElement>;

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

	const portalContainerRef = useRef<HTMLDivElement>(null);
	const dialogContainerRef = useRef<DialogContainerRef>(null);

	const showDialog = useCallback((content: VNode) => {
		dialogContainerRef.current!.showDialog(content);
	}, []);

	const appCtx = useMemo(
		() => ({
			portalContainerRef,
			cache,

			showDialog,
		} satisfies AppContext),
		[cache, showDialog],
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
								<Route path="/" component={RootPage} />
								<Route path="/chat" component={ChatPage} nest />
								<Route path="/login" component={LoginPage} />
								<Route path="/logout/:jid" component={LogoutPage} />
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
