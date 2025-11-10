import * as xmppClient from "@xmpp/client";
import Connection from "@xmpp/connection";
import xid from "@xmpp/id";
import { JID, parse as parseJID } from "@xmpp/jid";
import xml, { Element } from "@xmpp/xml";
import toBase64 from "es-arraybuffer-base64/Uint8Array.prototype.toBase64";
import { createContext, h, render } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Redirect, Route, useLocation } from "wouter-preact";

import ChatPage from "./pages/chat";
import LoginPage from "./pages/login";
import useEffectOnce from "./util/useEffectOnce";
import useLatestCallback from "use-latest-callback";

export interface Room {
	jid: JID;
	nick: string | null;
	connected: boolean;
}

export interface Account {
	jid: JID;
	client: xmppClient.Client;
	connected: boolean;

	rooms: Map<string, Room>;
}

export interface Message {
	room: JID | null;
	from: JID;
	content: string;
}

export interface MessageEvent {
	message: Message;
}

interface AppEventMap {
	message: MessageEvent;
}

interface ResultSetInfo {
	firstItem: string;
	lastItem: string;
}

export interface AppContext {
	accounts: Account[];

	saveToken(jid: JID, token: unknown, userAgent: string): void;
	addEventListener<K extends keyof AppEventMap>(
		event: K,
		listener: (evt: AppEventMap[K]) => void,
	): void;
	removeEventListener<K extends keyof AppEventMap>(
		event: K,
		listener: (evt: AppEventMap[K]) => void,
	): void;
	requestArchive(account: JID, entity: JID): Promise<ResultSetInfo | null>;
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
									const jid = parseJID(entry.jid);

									rooms.set(entry.jid, {
										jid,
										nick: null,
										connected: false,
									});
									connectMUC(client, jid, entry.nick);
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

	function handleMessageStanza(elem: Element) {
		const fromStr = elem.getAttr("from");
		const from = typeof fromStr === "undefined" ? undefined : parseJID(fromStr);

		if(elem.getAttr("type") === "groupchat") {
			const content = elem.getChildText("body");

			if(content !== null && typeof from !== "undefined") {
				emit("message", {
					message: {
						room: from.bare(), // TODO is this correct for non-anonymous MUCs?
						from: from,
						content,
					},
				});
			}
		}
		else {
			const mamResultElem = elem.getChild("result", "urn:xmpp:mam:2");
			if(typeof mamResultElem !== "undefined") {
				const forwardedElem = mamResultElem.getChild("forwarded", "urn:xmpp:forward:0");
				if(typeof forwardedElem !== "undefined") {
					const messageElem = forwardedElem.getChild("message", "jabber:client");
					if(typeof messageElem !== "undefined") handleMessageStanza(messageElem);
				}
			}
		}
	}

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
		else if(elem.getName() === "message") {
			handleMessageStanza(elem);
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

	const listenersRef = useRef<{
		[K in keyof AppEventMap]: Set<(evt: AppEventMap[K]) => void>;
	}>({
		message: new Set(),
	});

	const addEventListener = useCallback(
		<K extends keyof AppEventMap>(event: K, listener: (evt: AppEventMap[K]) => void) => {
			listenersRef.current[event].add(listener);
		},
		[],
	);

	const removeEventListener = useCallback(
		<K extends keyof AppEventMap>(event: K, listener: (evt: AppEventMap[K]) => void) => {
			listenersRef.current[event].delete(listener);
		},
		[],
	);

	const emit = useCallback(
		<K extends keyof AppEventMap>(eventType: K, event: AppEventMap[K]) => {
			listenersRef.current[eventType].forEach(listener => {
				try {
					listener(event);
				}
				catch(ex) {
					console.error(ex);
				}
			});
		},
		[],
	);

	const requestArchive = useLatestCallback(async (accountJID: JID, entity: JID) => {
		const account = accounts.find(x => x.jid.equals(accountJID));
		if(typeof account === "undefined") throw new Error("No such account");

		return account.client.iqCaller.request(
			xml(
				"iq",
				{type: "set", to: entity.toString()},
				xml(
					"query",
					{xmlns: "urn:xmpp:mam:2"},
					xml(
						"set",
						{xmlns: "http://jabber.org/protocol/rsm"},
						xml("max", {}, "10"),
						xml("before"),
					),
				),
			),
		)
			.then(result => {
				console.log("result is", result);

				const finElem = result.getChild("fin", "urn:xmpp:mam:2");

				if(typeof finElem === "undefined") {
					throw new Error("Unexpected result of MAM query");
				}

				const setElem = finElem.getChild("set", "http://jabber.org/protocol/rsm");
				if(typeof setElem === "undefined") throw new Error("Unexpected result of MAM query");

				const firstItem = setElem.getChildText("first");
				const lastItem = setElem.getChildText("last");

				if(firstItem === null && lastItem === null) {
					// There is nothing in the list
					return null;
				}

				return {
					firstItem: expectValue(firstItem),
					lastItem: expectValue(lastItem),
				} satisfies ResultSetInfo;
			});
	});

	const appCtx = useMemo(() => ({
		accounts,

		saveToken(jid, token, userAgent) {
			localStorage.setItem("deepishAccount", JSON.stringify({jid: jid.toString(), token, userAgent}));
			loadAccounts();
		},

		addEventListener,
		removeEventListener,

		requestArchive,
	} satisfies AppContext), [accounts, addEventListener, removeEventListener, loadAccounts, requestArchive]);

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
		<Route path="/chat" component={ChatPage} nest />
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

function connectMUC(client: xmppClient.Client, roomJID: JID, preferredNick: string | undefined) {
	const nick = preferredNick ?? client.jid!.local;

	client.send(
		xml(
			"presence",
			{id: xid(), to: new JID(roomJID.local, roomJID.domain, nick)},
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

function expectValue<T>(value: T | null | undefined): T {
	if(value === null) throw new Error("Unexpected null");
	else if(typeof value === "undefined") throw new Error("Unexpected undefined");
	else return value;
}
