import * as xmppClient from "@xmpp/client";
import Connection from "@xmpp/connection";
import { xml } from "@xmpp/client";
import { JID, parse as parseJID } from "@xmpp/jid";
import toBase64 from "es-arraybuffer-base64/Uint8Array.prototype.toBase64";
import { createContext, h, render } from "preact";
import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import { Redirect, Route, useLocation } from "wouter-preact";

import ChatPage from "./pages/chat";
import LoginPage from "./pages/login";
import useEffectOnce from "./util/useEffectOnce";
import useLatestCallback from "use-latest-callback";

interface Account {
	jid: JID;
	client: xmppClient.Client;
	connected: boolean;
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

	const onClientOnline = useLatestCallback((client: xmppClient.Client) => {
		setAccounts(current => {
			return current.map(item => {
				if(item.client === client) {
					return {
						...item,
						connected: true,
					};
				}
				else return item;
			});
		});

		genVerString(
			[{category: "client", type: "web", lang: "", name: "Deepish"}],
			[],
		)
			.then(ver => {
				client.send(
					xml(
						"presence",
						undefined,
						xml(
							"c",
							{
								xmlns: "http://jabber.org/protocol/caps",
								hash: "sha-1",
								node: "https://deepish.vpzom.click",
								ver,
							},
						),
					),
				);
			});
	});

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
						client: createXMPPClientForAccount(jid, info.token, info.userAgent, {
							online: onClientOnline,
						}),
						connected: false,
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

function createXMPPClientForAccount(
	jid: JID,
	token: unknown,
	userAgent: string,
	listeners: {
		[K in keyof Connection.ConnectionEvents]?: Connection.ConnectionEvents[K] extends (...args: infer T) => infer O ?
			(client: xmppClient.Client, ...args: T) => O :
			never
	},
) {
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

	for(const key_ in listeners) {
		const key = key_ as keyof Connection.ConnectionEvents;
		if(typeof listeners[key] === "undefined") continue;

		client.on(key, (listeners[key] as any).bind(undefined, client));
	}

	client.start();

	return client;
}

async function genVerString(
	identities: Array<{
		category: string;
		type: string;
		lang: string;
		name: string;
	}>,
	features: string[],
) {
	let s = "";

	identities.toSorted((a, b) => {
		let result = a.category.localeCompare(b.category);
		if(result !== 0) return result;

		result = a.type.localeCompare(b.type);
		if(result !== 0) return result;

		return a.lang.localeCompare(b.lang);
	}).forEach(identity => {
		s += identity.category + "/" + identity.type + "/" + identity.lang + "/" + identity.name + "<";
	});

	features.toSorted().forEach(feature => {
		s += feature + "<";
	});

	const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));

	return toBase64(new Uint8Array(hash));
}
