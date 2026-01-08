import "./global.css";

import { IDBCache } from "@instructure/idb-cache";
import { createContext, RefObject, render, VNode } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef } from "preact/hooks";
import { useLocation } from "wouter-preact";

import AppContent from "./AppContent";
import DialogContainer, { DialogContainerRef } from "./components/DialogContainer";
import { ConnectionContext, useCreateConnection } from "./util/connection";

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
			<AppContent />
			<DialogContainer ref={dialogContainerRef} />
			<div style={{position: "absolute"}} ref={portalContainerRef} />
		</ConnectionContext.Provider>
	</AppContext.Provider>;
}

render(<App />, document.getElementById("root") as HTMLDivElement);

