import * as xmppClient from "@xmpp/client";
import { xml } from "@xmpp/client";
import { JID, parse as parseJID } from "@xmpp/jid";
import { createContext, h, render } from "preact";
import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import { Redirect, Route, useLocation } from "wouter-preact";

import ChatPage from "./pages/chat";
import LoginPage from "./pages/login";
import useEffectOnce from "./util/useEffectOnce";

interface Account {
	jid: JID;
	client: xmppClient.Client;
}

export interface AppContext {
	accounts: Account[];

	saveToken(jid: JID, token: unknown, userAgent: string): void;
}

export const AppContext = createContext<undefined | AppContext>(undefined);

export function useAppContext(): AppContext {
	const appCtx = useContext(AppContext);

	if(typeof appCtx === "undefined") throw new Error("useAppContext used outside App");

	return appCtx;
}

function App() {
	// eventually we might support multiple accounts
	// just one for now though
	const [accounts, setAccounts] = useState<Account[]>([]);

	const [inited, setInited] = useState(false);

	const loadAccounts = useCallback(() => {
		const infoStr = localStorage.getItem("deepishAccount");
		if(infoStr === null) {
			setAccounts([]);
		}
		else {
			const info = JSON.parse(infoStr) as {
				jid: string;
				token: unknown;
				userAgent: string;
			};

			const jid = parseJID(info.jid);

			setAccounts(current => {
				current.forEach(account => {
					account.client.stop();
				});

				return [
					{
						jid,
						client: createXMPPClientForAccount(jid, info.token, info.userAgent),
					},
				];
			});
		}

		setInited(true);
	}, []);

	const appCtx = useMemo(() => ({
		accounts,

		saveToken(jid, token, userAgent) {
			localStorage.setItem("deepishAccount", JSON.stringify({jid: jid.toString(), token, userAgent}));
			loadAccounts();
		},
	} satisfies AppContext), [accounts]);

	useEffectOnce(() => {
		loadAccounts();
	});

	if(!inited) return null;

	return <AppContext.Provider value={appCtx}>
		<Route path="/" component={RootPage} />
		<Route path="/login" component={LoginPage} />
	</AppContext.Provider>;
}

function RootPage() {
	const appCtx = useAppContext();

	if(appCtx.accounts.length > 0) {
		return <ChatPage />;
	}
	else {
		return <Redirect to="~/login" />;
	}
}

render(<App />, document.getElementById("root") as HTMLDivElement);

function createXMPPClientForAccount(jid: JID, token: unknown, userAgent: string) {
	const client = xmppClient.client({
		service: jid.domain,
		domain: jid.domain,
		username: jid.local,
		credentials: {
			username: jid.local,
			token,
		} as never, // TODO change after types are fixed
		...({
			userAgent: xml("user-agent", {id: userAgent}),
		}),
	});
	client.start();

	return client;
}
