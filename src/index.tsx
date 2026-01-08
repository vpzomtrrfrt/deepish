import "./global.css";

import { Tooltip } from "@base-ui-components/react/tooltip";
import { IDBCache } from "@instructure/idb-cache";
import { parse as parseJID } from "@xmpp/jid";
import { createContext, RefObject, render, VNode } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef } from "preact/hooks";
import { Redirect, Route, useLocation } from "wouter-preact";

import DialogContainer, { DialogContainerRef } from "./components/DialogContainer";
import ChatPage from "./pages/chat";
import LoginPage from "./pages/login";
import { ConnectionContext, useConnectionContext, useCreateConnection } from "./util/connection";
import { themeCSS } from "./util/theme";
import useEffectOnce from "./util/useEffectOnce";

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

	if(!connection.inited) return null;

	return <AppContext.Provider value={appCtx}>
		<ConnectionContext.Provider value={connection}>
			<div class="appWrapper" style={themeCSS.light}>
				<Tooltip.Provider>
					<Route path="/" component={RootPage} />
					<Route path="/chat" component={ChatPage} nest />
					<Route path="/login" component={LoginPage} />
					<Route path="/logout/:jid" component={LogoutPage} />
				</Tooltip.Provider>
				<DialogContainer ref={dialogContainerRef} />
				<div style={{position: "absolute"}} ref={portalContainerRef} />
			</div>
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
