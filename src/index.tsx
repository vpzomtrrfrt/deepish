import { Tooltip } from "@base-ui-components/react";
import * as xmppClient from "@xmpp/client";
import Connection from "@xmpp/connection";
import xid from "@xmpp/id";
import { JID, parse as parseJID } from "@xmpp/jid";
import xml, { Element } from "@xmpp/xml";
import toBase64 from "es-arraybuffer-base64/Uint8Array.prototype.toBase64";
import { createContext, RefObject, render } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Redirect, Route } from "wouter-preact";

import ChatPage from "./pages/chat";
import LoginPage from "./pages/login";
import { themeCSS } from "./util/theme";
import { LoadState } from "./util/useData";
import useEffectOnce from "./util/useEffectOnce";
import useLatestCallback from "use-latest-callback";

import "./global.css";

export interface Counterpart {
	jid: JID;
	inRoster: boolean;
}

export interface RoomDiscoInfo {
	name: string | null;
}

export interface Room {
	jid: JID;
	nick: string | null;
	connected: boolean;
	infoState: LoadState<RoomDiscoInfo>;
}

export interface Account {
	jid: JID;
	client: xmppClient.Client;
	connected: boolean;

	counterparts: Map<string, Counterpart>;
	rooms: Map<string, Room>;
}

export interface Message {
	room: JID | null;
	from: JID;
	content: string;
	id: string | null;
	timestamp: Date;
}

export interface MessageEvent {
	message: Message;
}

interface AppEventMap {
	message: MessageEvent;
}

export interface ResultSetInfo {
	firstItem: string;
	lastItem: string;
}

export interface AppContext {
	accounts: Account[];

	portalContainerRef: RefObject<HTMLDivElement>;

	saveToken(jid: JID, token: unknown, userAgent: string): void;
	addEventListener<K extends keyof AppEventMap>(
		event: K,
		listener: (evt: AppEventMap[K]) => void,
	): void;
	removeEventListener<K extends keyof AppEventMap>(
		event: K,
		listener: (evt: AppEventMap[K]) => void,
	): void;
	requestArchive(account: JID, entity: JID, before?: string): Promise<ResultSetInfo | null>;
	sendMessageToRoom(account: JID, room: JID, message: {body: string}): Promise<void>;
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

	const outgoingMessagesRef = useRef<Map<string, {resolve: () => void; reject: (err: unknown) => void}>>(new Map());

	const updateAccount = useCallback((identifier: xmppClient.Client | JID, fn: (current: Account) => Account) => {
		setAccounts(current => {
			return current.map(account => {
				if(identifier instanceof JID ? account.jid.equals(identifier) : account.client === identifier) {
					return fn(account);
				}
				else return account;
			});
		});
	}, []);

	async function fetchBookmarks(client: xmppClient.Client) {
		const initBookmarks = await client.iqCaller.get(
			xml(
				"pubsub",
				{xmlns: "http://jabber.org/protocol/pubsub"},
				xml("items", {node: "urn:xmpp:bookmarks:1"}),
			),
		);

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

		updateAccount(client, item => {
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
						infoState: LoadState.loading,
					});
					connectMUC(client, jid, entry.nick);
				}
			});

			return {
				...item,
				rooms,
			};
		});
	}

	async function fetchRoster(client: xmppClient.Client) {
		const result = await client.iqCaller.get(xml("query", {xmlns: "jabber:iq:roster"}));
		if(typeof result === "undefined") throw new Error("Missing result from roster fetch");

		const items = result.getChildren("item", "jabber:iq:roster");

		const newContacts = new Set<string>();
		items.forEach(item => {
			const jid = item.getAttr("jid");
			if(typeof jid === "string") newContacts.add(jid);
		});

		if(newContacts.size > 0) {
			updateAccount(client, account => {
				const counterparts = new Map(account.counterparts);

				newContacts.forEach(contact => {
					const entry = counterparts.get(contact);
					if(typeof entry === "undefined") {
						counterparts.set(contact, {
							jid: parseJID(contact),
							inRoster: true,
						});
					}
					else if(!entry.inRoster) {
						counterparts.set(contact, {
							...entry,
							inRoster: true,
						});
					}
				});

				counterparts.forEach((value, key) => {
					if(value.inRoster && !newContacts.has(key)) {
						counterparts.set(key, {
							...value,
							inRoster: false,
						});
					}
				});

				return {
					...account,
					counterparts,
				};
			});
		}
	}

	const onClientOnline = useLatestCallback((client: xmppClient.Client) => {
		updateAccount(client, account => ({...account, connected: true}));

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
				return Promise.all([
					fetchBookmarks(client),
					fetchRoster(client),
				]);
			});
	});

	function handleMessageStanza(elem: Element, idFromWrapper?: string, timestampFromWrapper?: Date) {
		const fromStr = elem.getAttr("from");
		const from = typeof fromStr === "undefined" ? undefined : parseJID(fromStr);

		if(elem.getAttr("type") === "groupchat") {
			let id = idFromWrapper ?? null;

			const idElem = elem.getChild("stanza-id", "urn:xmpp:sid:0");
			if(typeof idElem !== "undefined") {
				const maybeID = idElem.getAttr("id");
				if(typeof maybeID !== "undefined" && maybeID !== null) id = maybeID;
			}

			let outgoingListener;
			if(id === null) {
				outgoingListener = undefined;
			}
			else {
				outgoingListener = outgoingMessagesRef.current.get(id);
				outgoingMessagesRef.current.delete(id);
			}

			const errorElem = elem.getChild("error");
			if(typeof errorElem !== "undefined") {
				if(typeof outgoingListener !== "undefined") {
					outgoingListener.reject(errorElem);
				}

				return;
			}

			const content = elem.getChildText("body");

			if(content !== null && typeof from !== "undefined") {
				let timestamp: Date | null = timestampFromWrapper ?? null;

				const delayElem = elem.getChild("delay", "urn:xmpp:delay");
				if(typeof delayElem !== "undefined") {
					timestamp = new Date(delayElem.getAttr("stamp"));
				}

				emit("message", {
					message: {
						room: from.bare(), // TODO is this correct for non-anonymous MUCs?
						from: from,
						content,
						id,
						timestamp: timestamp ?? new Date(),
					},
				});
			}

			outgoingListener?.resolve();
		}
		else {
			const mamResultElem = elem.getChild("result", "urn:xmpp:mam:2");
			if(typeof mamResultElem !== "undefined") {
				const id = mamResultElem.getAttr("id") ?? undefined;

				let timestamp: Date | undefined = undefined;

				const forwardedElem = mamResultElem.getChild("forwarded", "urn:xmpp:forward:0");
				if(typeof forwardedElem !== "undefined") {
					const delayElem = forwardedElem.getChild("delay", "urn:xmpp:delay");
					if(typeof delayElem !== "undefined") {
						timestamp = new Date(delayElem.getAttr("stamp"));
					}

					const messageElem = forwardedElem.getChild("message", "jabber:client");
					if(typeof messageElem !== "undefined") handleMessageStanza(messageElem, id, timestamp);
				}
			}
		}
	}

	const fetchRoomDisco = useLatestCallback((client: xmppClient.Client, roomJID: JID) => {
		updateAccount(client, account => {
			const info = account.rooms.get(roomJID.toString());
			if(typeof info === "undefined") {
				console.warn("trying to fetch disco for unknown room");
				return account;
			}

			if(info.infoState.state !== "done") {
				const newRooms = new Map(account.rooms);
				newRooms.set(roomJID.toString(), {...info, infoState: LoadState.loading});
				return {...account, rooms: newRooms};
			}
			else return account;
		});

		client.iqCaller.get(
			xml("query", {xmlns: "http://jabber.org/protocol/disco#info"}),
			roomJID.toString(),
		)
			.then((result): RoomDiscoInfo => {
				if(typeof result === "undefined") throw new Error("Missing result from MUC disco");

				const info: RoomDiscoInfo = {
					name: null,
				};

				const identityElem = result.getChild("identity");
				if(typeof identityElem !== "undefined") {
					const name = identityElem.getAttr("name");
					if(typeof name === "string") info.name = name;
				}

				return info;
			})
			.then(LoadState.wrapValue, LoadState.wrapError)
			.then(newState => {
				updateAccount(client, account => {
					const info = account.rooms.get(roomJID.toString());
					if(typeof info === "undefined") {
						return account;
					}

					const newRooms = new Map(account.rooms);
					newRooms.set(roomJID.toString(), {...info, infoState: newState});
					return {...account, rooms: newRooms};
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

						fetchRoomDisco(client, srcJID.bare());
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
						counterparts: new Map(),
						rooms: new Map(),
					},
				];
			});
		}

		setInited(true);
	}, [onClientElement, onClientOnline]);

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

	const requestArchive = useLatestCallback(async (accountJID: JID, entity: JID, before?: string) => {
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
						typeof before === "undefined" ?
							xml("before") :
							xml("before", {}, before),
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

	const sendMessageToRoom = useLatestCallback(async (accountJID: JID, roomJID: JID, message: {body: string}) => {
		const id = xid();

		const account = accounts.find(x => x.jid.equals(accountJID));
		if(typeof account === "undefined") throw new Error("No such account");

		const reflectDefer = Promise.withResolvers<void>();

		outgoingMessagesRef.current.set(id, reflectDefer);

		await account.client.send(
			xml(
				"message",
				{id, to: roomJID.toString(), type: "groupchat"},
				xml(
					"body",
					{},
					message.body,
				),
			),
		);

		await reflectDefer;
	});

	const portalContainerRef = useRef<HTMLDivElement>(null);

	const appCtx = useMemo(
		() => ({
			accounts,
			portalContainerRef,

			saveToken(jid, token, userAgent) {
				localStorage.setItem("deepishAccount", JSON.stringify({jid: jid.toString(), token, userAgent}));
				loadAccounts();
			},

			addEventListener,
			removeEventListener,

			requestArchive,
			sendMessageToRoom,
		} satisfies AppContext),
		[accounts, addEventListener, removeEventListener, loadAccounts, requestArchive, sendMessageToRoom],
	);

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
		<div class="appWrapper" style={themeCSS.light}>
			<Tooltip.Provider>
				<Route path="/" component={RootPage} />
				<Route path="/chat" component={ChatPage} nest />
				<Route path="/login" component={LoginPage} />
			</Tooltip.Provider>
			<div style={{position: "absolute"}} ref={portalContainerRef} />
		</div>
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

		// objects are messy
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
