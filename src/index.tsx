import * as xmppClient from "@xmpp/client";
import Connection from "@xmpp/connection";
import xid from "@xmpp/id";
import { JID, parse as parseJID } from "@xmpp/jid";
import xml, { Element } from "@xmpp/xml";
import toBase64 from "es-arraybuffer-base64/Uint8Array.prototype.toBase64";
import { createContext, h, render } from "preact";
import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import { Redirect, Route, useLocation } from "wouter-preact";

import ChatPage from "./pages/chat";
import LoginPage from "./pages/login";
import useEffectOnce from "./util/useEffectOnce";
import useLatestCallback from "use-latest-callback";

export interface Room {
	nick: string | null;
	connected: boolean;
}

export interface Account {
	jid: JID;
	client: xmppClient.Client;
	connected: boolean;

	rooms: Map<string, Room>;
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

		const features: string[] = [
			"urn:xmpp:bookmarks:1+notify",
		];

		genVerString(
			[{category: "client", type: "web", lang: "", name: "Deepish"}],
			features,
		)
			.then(ver => {
				return client.send(
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
			})
			.then(() => {
				return client.iqCaller.get(
					xml(
						"pubsub",
						{xmlns: "http://jabber.org/protocol/pubsub"},
						xml("items", {node: "urn:xmpp:bookmarks:1"}),
					),
				);
			})
			.then(initBookmarks => {
				if(typeof initBookmarks === "undefined") throw new Error("Got invalid result from bookmarks retrieval");

				const initBookmarksItems = initBookmarks.getChild("items");
				if(typeof initBookmarksItems === "undefined") {
					throw new Error("Got invalid result from bookmarks retrieval");
				}

				const targetRooms: Array<{
					jid: string;
					nick?: string;
				}> = [];

				initBookmarksItems.getChildren("item").forEach(item => {
					const jid = item.getAttr("id");

					const conf = item.getChild("conference", "urn:xmpp:bookmarks:1");
					if(typeof conf !== "undefined") {
						const autojoinValue = conf.getAttr("autojoin");
						if(autojoinValue === "true" || autojoinValue === "1") {
							const entry: typeof targetRooms[0] = {jid};

							const nickNode = conf.getChild("nick");
							if(typeof nickNode !== "undefined") {
								entry.nick = nickNode.getText();
							}

							targetRooms.push(entry);
						}
					}
				});

				setAccounts(current => {
					return current.map(item => {
						if(item.client === client) {
							const extraRooms = new Set<string>(item.rooms.keys());

							const rooms = new Map<string, Room>();

							targetRooms.forEach(entry => {
								if(extraRooms.delete(entry.jid)) {
									rooms.set(entry.jid, item.rooms.get(entry.jid)!);
								}
								else {
									rooms.set(entry.jid, {
										nick: null,
										connected: false,
									});
									connectMUC(client, entry.jid, entry.nick);
								}
							});

							return {
								...item,
								rooms,
							};
						}
						else return item;
					});
				});
			});
	});

	const onClientElement = useLatestCallback((client: xmppClient.Client, elem: Element) => {
		if(elem.getName() === "presence" && elem.getNS() === "jabber:client") {
			const srcJID = parseJID(elem.getAttr("from"));

			const userInfo = elem.getChild("x", "http://jabber.org/protocol/muc#user");
			if(typeof userInfo !== "undefined") {
				const statusElems = userInfo.getChildren("status");

				if(statusElems.length > 0) {
					// it's for this client

					let success = false;

					statusElems.forEach(statusElem => {
						if(statusElem.getAttr("code") === "110") {
							success = true;
						}
					});

					if(success) {
						setAccounts(current => {
							return current.map(item => {
								if(item.client === client) {
									const rooms = new Map(item.rooms);
									const oldInfo = rooms.get(srcJID.bare().toString());
									if(typeof oldInfo === "undefined") {
										console.log("Tried to update room missing in list");
										return item;
									}

									rooms.set(srcJID.bare().toString(), {
										...oldInfo,
										connected: true,
										nick: srcJID.resource,
									});

									return {
										...item,
										rooms,
									};
								}
								else return item;
							});
						});
					}
				}
			}
		}
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
							element: onClientElement,
						}),
						connected: false,
						rooms: new Map(),
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

	const onUnmount = useLatestCallback(() => {
		accounts.forEach(account => {
			account.client.stop();
		});
	});
	useEffect(() => {
		return onUnmount;
	}, [onUnmount]);

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

function connectMUC(client: xmppClient.Client, roomJID: string, preferredNick: string | undefined) {
	const nick = preferredNick ?? client.jid!.local;

	const roomJID_ = parseJID(roomJID);

	client.send(
		xml(
			"presence",
			{id: xid(), to: new JID(roomJID_.local, roomJID_.domain, nick)},
			xml(
				"x",
				{xmlns: "http://jabber.org/protocol/muc"},
			),
		),
	);
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
