import { IDBCache } from "@instructure/idb-cache";
import { useSignal } from "@preact/signals";
import Connection from "@xmpp/connection";
import xid from "@xmpp/id";
import { JID, parse as parseJID } from "@xmpp/jid";
import StanzaError from "@xmpp/middleware/lib/StanzaError";
import SASLError from "@xmpp/sasl/lib/SASLError";
import xml, { Element } from "@xmpp/xml";
import fromBase64 from "es-arraybuffer-base64/Uint8Array.fromBase64";
import toBase64 from "es-arraybuffer-base64/Uint8Array.prototype.toBase64";
import toHex from "es-arraybuffer-base64/Uint8Array.prototype.toHex";
import { createContext } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import useLatestCallback from "use-latest-callback";

import { Counterpart, Presence, PresenceShowType, RosterEntry } from "./types";
import { LoadState } from "./useData";
import useEffectOnce from "./useEffectOnce";
import useIdle, { IdleState } from "./useIdle";
import * as xmppClient from "./xmpp/client";
import { fetchPubsubItems, publishPubsubItem, PubsubItemInfo, PubsubPublishOptions, retractPubsubItem } from "./xmpp/pubsub";
import StanzaID, { StanzaIDType } from "./xmpp/StanzaID";

const FEATURES: string[] = [
	"urn:xmpp:bookmarks:1+notify",
	"urn:xmpp:avatar:metadata+notify",
	"urn:xmpp:mds:displayed:0+notify",
	"http://jabber.org/protocol/nick+notify",
	"http://jabber.org/protocol/chatstates",
	"urn:xmpp:message-retract:1",
];
const IDENTITY = {category: "client", type: "web", lang: "", name: "Deepish"};
const NODE_URL = "https://deepish.vpzom.click";

const DEFAULT_COUNTERPART_INFO: Omit<Counterpart, "jid"> = {
	rosterEntry: null,
	requestingMySubscription: false,
	lastMessageID: null,
	lastMessageTimestamp: null,
	lastMessageTimestampFromInbox: null,
	overrideVisibleTimestamp: null,
	avatarHashes: [],
	presences: null,
	lastReportedComposing: false,
	composingFrom: null,
	nick: null,

	lastReadMessageID: null,
};

export interface RoomDiscoInfo {
	name: string | null;
	avatarHashes: string[];
}

export interface Room {
	jid: JID;
	nick: string | null;
	connected: boolean;
	error: unknown;
	infoState: LoadState<RoomDiscoInfo>;
	lastReportedComposing: boolean;
}

export interface ServiceInfo {
	jid: JID;
	features: string[];
}

export interface Account {
	jid: JID;
	client: xmppClient.Client;
	connected: boolean;
	lastError: unknown;
	stopped: boolean;

	counterparts: Map<string, Counterpart>;
	rooms: Map<string, Room>;

	avatarStates: Map<string, LoadState<string>>;
	servicesState: LoadState<ServiceInfo[]>;
}

export type MessageRemoval = {
	"type": "retract";
};

export interface Message {
	room: JID | null;
	from: JID;
	to: JID | null;
	content: string;
	ids: StanzaID[];
	localID: string;
	timestamp: Date;
	removal: null | MessageRemoval;
}

export interface MessageEvent {
	account: JID;
	message: Message;
	isNew: boolean;
	shouldNotify: boolean;
}

export interface MessageRemovalEvent {
	removal: MessageRemoval;
	room: JID | null;
	target: StanzaID;
	from: JID;
}

interface AppEventMap {
	message: MessageEvent;
	messageRemove: MessageRemovalEvent;
}

export interface ResultSetInfo {
	firstItem: string;
	lastItem: string;
}

export interface AvatarImageCacheEntry {
	contentB64: string;
	type: string;
}

export interface RoomCreateParams {
	name: string;
	membersOnly: boolean;
	publicRoom: boolean;
	persistent: boolean;
}

interface RoomJoinCallbackInfo {
	statuses: string[];
}

interface ImageInfo {
	content: Blob;
	width: number;
	height: number;
}

export interface ConnectionContext {
	accounts: Account[];
	inited: boolean;
	idle: IdleState;

	saveToken(jid: JID, token: unknown, userAgent: string, resource: string): void;
	logout(jid: JID): void;
	addEventListener<K extends keyof AppEventMap>(
		event: K,
		listener: (evt: AppEventMap[K]) => void,
	): void;
	removeEventListener<K extends keyof AppEventMap>(
		event: K,
		listener: (evt: AppEventMap[K]) => void,
	): void;
	requestArchive(account: JID, entity: JID, params: {with?: JID}, before?: string): Promise<ResultSetInfo | null>;
	sendMessageToRoom(account: JID, room: JID, message: {body: string}): Promise<void>;
	sendMessageToCounterpart(account: JID, target: JID, message: {body: string}): Promise<void>;
	markCounterpartAsVisible(account: JID, target: JID): void;
	acceptFriendRequest(account: JID, target: JID): void;
	rejectFriendRequest(account: JID, target: JID): void;
	removeFriend(account: JID, target: JID): void;
	sendFriendRequest(account: JID, target: JID): void;
	setComposingToCounterpart(account: JID, target: JID, composing: boolean): void;
	setComposingToRoom(account: JID, room: JID, composing: boolean): void;
	joinRoom(account: JID, room: JID, nick?: string): Promise<void>;
	leaveRoom(account: JID, room: JID): Promise<void>;
	createRoom(account: JID, room: JID, params: RoomCreateParams): void;
	fetchRoomInfo(account: JID, room: JID): Promise<RoomDiscoInfo>;
	markCounterpartAsRead(account: JID, target: JID, lastReadMessageID: string, isRoom: boolean): void;
	setNick(account: JID, value: string): Promise<void>;
	setAvatar(account: JID, info: ImageInfo): Promise<void>;
}

export const ConnectionContext = createContext<ConnectionContext | undefined>(undefined);

const BOOKMARKS_PUBLISH_OPTIONS: PubsubPublishOptions = {
	persistItems: true,
	maxItems: "max",
	sendLastPublishedItem: "never",
	accessModel: "whitelist",
};

export function useCreateConnection(cache: IDBCache): ConnectionContext {
	// eventually we might support multiple accounts
	// just one for now though
	const accountsSig = useSignal<Account[]>([]);
	const accounts = accountsSig.value;

	const [inited, setInited] = useState(false);

	const idle = useIdle();

	const outgoingMessagesRef = useRef<Map<string, {resolve: () => void; reject: (err: unknown) => void}>>(new Map());

	const newRoomsRef = useRef<Map<string, {resolve: (value: RoomJoinCallbackInfo) => void; reject: (err: unknown) => void}>>(new Map());

	const updateAccount = useCallback((identifier: xmppClient.Client | JID, fn: (current: Account) => Account) => {
		accountsSig.value = accountsSig.value.map(account => {
			if(identifier instanceof JID ? account.jid.equals(identifier) : account.client === identifier) {
				return fn(account);
			}
			else return account;
		});
	}, [accountsSig]);

	const upsertCounterpart = useCallback(
		(accountIdentifier: xmppClient.Client | JID, counterpartJID: JID, fn: (current: Counterpart) => Counterpart) => {
			updateAccount(accountIdentifier, account => {
				const counterparts = new Map(account.counterparts);

				counterparts.set(counterpartJID.toString(), fn(
					counterparts.get(counterpartJID.toString()) ??
						{...DEFAULT_COUNTERPART_INFO, jid: counterpartJID}
				));

				return {...account, counterparts};
			});
		},
		[updateAccount],
	);

	const handleBookmarksUpdate = useLatestCallback((
		client: xmppClient.Client,
		mode: "add" | "remove" | "all",
		newItems?: PubsubItemInfo[],
		removedItems?: string[],
	) => {
		const wantedRooms: Array<{
			jid: string;
			nick?: string;
		}> = [];

		if(typeof newItems !== "undefined") {
			newItems.forEach(item => {
				const jid = item.id;

				const conf = item.element.getChild("conference", "urn:xmpp:bookmarks:1");
				if(typeof conf !== "undefined") {
					const autojoinValue = conf.getAttr("autojoin");
					if(autojoinValue === "true" || autojoinValue === "1") {
						const entry: typeof wantedRooms[0] = {jid};

						const nickNode = conf.getChild("nick");
						if(typeof nickNode !== "undefined") {
							entry.nick = nickNode.getText();
						}

						wantedRooms.push(entry);
					}
				}
			});
		}

		updateAccount(client, account => {
			const extraRooms = new Set<string>(account.rooms.keys());

			const rooms = new Map<string, Room>(account.rooms);

			wantedRooms.forEach(entry => {
				if(!extraRooms.delete(entry.jid)) {
					const jid = parseJID(entry.jid);

					rooms.set(entry.jid, {
						jid,
						nick: null,
						connected: false,
						error: null,
						infoState: LoadState.loading,
						lastReportedComposing: false,
					});
					connectMUC(client, jid, entry.nick);
				}
			});

			let unwantedRooms: string[];
			if(mode === "add") unwantedRooms = [];
			else if(mode === "remove") unwantedRooms = removedItems ?? [];
			else if(mode === "all") unwantedRooms = Array.from(extraRooms)
			else {
				const _: never = mode;

				throw new Error("Unknown mode");
			}

			if(unwantedRooms.length > 0) {
				unwantedRooms.forEach(roomJID => {
					const entry = rooms.get(roomJID);
					if(typeof entry !== "undefined") {
						rooms.delete(roomJID);
						disconnectRoom(account, entry);
					}
				});
			}

			return {
				...account,
				rooms,
			};
		});
	});

	async function fetchBookmarks(client: xmppClient.Client) {
		const initBookmarks = await fetchPubsubItems(client, "urn:xmpp:bookmarks:1");

		handleBookmarksUpdate(client, "all", initBookmarks.items);
	}

	const handleRosterUpdate = useCallback((accountJID: JID, items: Element[], isAll: boolean) => {
		const newContacts = new Map<string, RosterEntry>();
		items.forEach(item => {
			const jid = item.getAttr("jid");
			if(typeof jid === "string") {
				let subscriptionTo = false;
				let subscriptionFrom = false;

				const subscriptionState = item.getAttr("subscription");
				if(subscriptionState === "to") {
					subscriptionTo = true;
				}
				else if(subscriptionState === "both") {
					subscriptionTo = true;
					subscriptionFrom = true;
				}
				else if(subscriptionState === "from") {
					subscriptionFrom = true;
				}
				else if(subscriptionState === "none") {
					// no subscription
				}
				else {
					console.warn("Unknown subscription state:", subscriptionState);
				}

				newContacts.set(jid, {
					subscriptionTo,
					requestingSubscriptionTo: item.getAttr("ask") === "subscribe",
					subscriptionFrom,
				});
			}
		});

		if(newContacts.size > 0 || isAll) {
			updateAccount(accountJID, account => {
				const counterparts = new Map(account.counterparts);

				newContacts.forEach((info, contact) => {
					const entry = counterparts.get(contact);
					if(typeof entry === "undefined") {
						counterparts.set(contact, {
							...DEFAULT_COUNTERPART_INFO,
							jid: parseJID(contact),
							rosterEntry: info,
						});
					}
					else {
						counterparts.set(contact, {
							...entry,
							rosterEntry: info,
							requestingMySubscription: entry.requestingMySubscription && !info.subscriptionFrom,
						});
					}
				});

				if(isAll) {
					counterparts.forEach((value, key) => {
						if(value.rosterEntry !== null && !newContacts.has(key)) {
							counterparts.set(key, {
								...value,
								rosterEntry: null,
							});
						}
					});
				}

				return {
					...account,
					counterparts,
				};
			});
		}
	}, [updateAccount]);

	async function fetchRoster(client: xmppClient.Client) {
		const result = await client.iqCaller.get(xml("query", {xmlns: "jabber:iq:roster"}));
		if(typeof result === "undefined") throw new Error("Missing result from roster fetch");

		const items = result.getChildren("item", "jabber:iq:roster");
		handleRosterUpdate(client.jid!.bare(), items, true);
	}

	async function fetchInbox(client: xmppClient.Client) {
		const result = await client.iqCaller.get(xml("summary", {xmlns: "xmpp:prosody.im/mod_map"}));
		if(typeof result === "undefined") throw new Error("Missing result from summary");

		console.log("inbox", result);

		// technically these might not be "real" messages, but maybe close enough?

		const newLastMessageTimestamps = new Map<string, Date>();
		result.getChildren("item").forEach(item => {
			const itemJID = parseJID(item.getAttr("jid"));

			const end = item.getChildText("end");
			if(end !== null) {
				const endDate = new Date(end);
				if(!isNaN(endDate.getTime())) newLastMessageTimestamps.set(itemJID.toString(), endDate);
			}
		});

		if(newLastMessageTimestamps.size > 0) {
			updateAccount(client, account => {
				const counterparts = new Map(account.counterparts);

				newLastMessageTimestamps.forEach((timestamp, itemJID) => {
					counterparts.set(itemJID, {
						...(counterparts.get(itemJID) ?? {...DEFAULT_COUNTERPART_INFO, jid: parseJID(itemJID)}),
						lastMessageTimestampFromInbox: timestamp,
					});
				});

				return {...account, counterparts};
			});

			// Fetch recent messages from MAM to populate lastMessageID
			const remaining = new Map<string, string | null>();
			newLastMessageTimestamps.forEach((_, itemJID) => {
				remaining.set(itemJID, null);
			});
			while(true) {
				{
					const accounts = accountsSig.value;
					const account = accounts.find(x => x.client === client);
					if(typeof account === "undefined") break;

					remaining.forEach((_, itemJID) => {
						const counterpart = account.counterparts.get(itemJID);
						if(typeof counterpart !== "undefined" && counterpart.lastMessageID !== null) {
							remaining.delete(itemJID);
						}
					});
				}

				console.log("need last message from", remaining);

				if(remaining.size < 1) break;

				const account = accountsSig.value.find(x => x.client === client);
				if(typeof account === "undefined") break;

				await Promise.all(
					Array.from(remaining, async ([key, value]) => {
						try {
							const isRoom = account.rooms.has(key);

							const fin = await requestArchive(
								client.jid!.bare(),
								isRoom ? parseJID(key) : account.jid,
								{with: isRoom ? undefined : parseJID(key)},
								value === null ? undefined : value,
							);

							if(fin === null) {
								remaining.delete(key);
							}
							else {
								remaining.set(key, fin.lastItem);
							}
						}
						catch(ex) {
							console.error(ex);

							// Stop trying for this one
							remaining.delete(key);
						}
					}),
				);
			}
		}
	}

	async function fetchServices(client: xmppClient.Client) {
		try {
			const listResult = await client.iqCaller.get(
				xml(
					"query",
					{xmlns: "http://jabber.org/protocol/disco#items"},
				),
				client.jid!.domain,
			);

			if(typeof listResult === "undefined") throw new Error("Missing result");

			const serviceJIDs: JID[] = [];

			listResult.getChildren("item").forEach(itemElem => {
				const jid = itemElem.getAttr("jid");
				if(typeof jid === "string") serviceJIDs.push(parseJID(jid));
			});

			const results = await Promise.all(
				serviceJIDs.map(async (serviceJID) => {
					const result = await client.iqCaller.get(
						xml(
							"query",
							{xmlns: "http://jabber.org/protocol/disco#info"},
						),
						serviceJID.toString(),
					);

					if(typeof result === "undefined") throw new Error("Missing result");

					const features: string[] = [];

					result.getChildren("feature").forEach(elem => {
						const key = elem.getAttr("var");
						if(typeof key === "string") features.push(key);
					});

					return {
						jid: serviceJID,
						features,
					} satisfies ServiceInfo;
				}),
			);

			updateAccount(client, account => {
				return {...account, servicesState: LoadState.wrapValue(results)};
			});
		}
		catch(ex) {
			updateAccount(client, account => {
				return {...account, servicesState: LoadState.wrapError(ex)};
			});
		}
	}

	const handlePubsubItem = useLatestCallback(
		(client: xmppClient.Client, from: JID | undefined, node: string, item: PubsubItemInfo) => {
			console.log("handling pubsub item", from, node, item);

			const isMe = typeof from === "undefined" || from.bare().equals(client.jid!.bare());

			if(node === "http://jabber.org/protocol/nick") {
				if(typeof from !== "undefined") {
					const nickElem = item.element.getChild("nick", "http://jabber.org/protocol/nick");
					if(typeof nickElem !== "undefined") {
						const nick = nickElem.getText();

						upsertCounterpart(client, from, current => ({
							...current,
							nick,
						}));
					}
				}
			}
			else if(node === "urn:xmpp:avatar:metadata") {
				const avatarHashes: string[] = [item.id]; // TODO Fetch other hashes from metadata

				if(typeof from !== "undefined") {
					const contact = from;

					upsertCounterpart(client, contact, current => ({
						...current,
						avatarHashes,
					}));

					startRequestingAvatar(client, contact, avatarHashes);
				}
			}
			else if(node === "urn:xmpp:bookmarks:1") {
				if(isMe) handleBookmarksUpdate(client, "add", [item]);
			}
			else if(node === "urn:xmpp:mds:displayed:0") {
				if(isMe) {
					const jid = parseJID(item.id);

					const displayedElem = item.element.getChild("displayed", "urn:xmpp:mds:displayed:0");
					if(typeof displayedElem !== "undefined") {
						const stanzaIDElem = displayedElem.getChild("stanza-id", "urn:xmpp:sid:0");
						if(typeof stanzaIDElem !== "undefined") {
							const messageID = stanzaIDElem.getAttr("id");
							if(typeof messageID === "string") {
								upsertCounterpart(client, jid, current => ({
									...current,
									lastReadMessageID: messageID,
								}));
							}
						}
					}
				}
			}
		},
	);

	async function catchupPubsub(client: xmppClient.Client, node: string) {
		try {
			const items = await fetchPubsubItems(client, node);

			items.items.forEach(item => {
				handlePubsubItem(client, undefined, node, item);
			});
		}
		catch(ex) {
			if(ex instanceof StanzaError && ex.condition === "item-not-found") {
				// no items
			}
			else {
				throw ex;
			}
		}
	}

	const sendMyPresence = useLatestCallback(async (client: xmppClient.Client) => {
		console.log("sending my presence", idle);

		const ver = await genVerString(
			[IDENTITY],
			FEATURES,
		);

		await client.send(
			xml(
				"presence",
				undefined,
				xml(
					"c",
					{
						xmlns: "http://jabber.org/protocol/caps",
						hash: "sha-1",
						node: NODE_URL,
						ver,
					},
				),
				...(
					idle.idle ?
						[xml("show", {}, "away")] :
						[]
				),
			),
		);
	});

	const sendMyPresences = useLatestCallback(() => {
		accounts.forEach(account => {
			if(account.client.status === "online" || account.client.status === "open") {
				sendMyPresence(account.client);
			}
		});
	});

	useEffect(() => {
		sendMyPresences();
	}, [sendMyPresences, idle]);

	const onClientOnline = useLatestCallback((client: xmppClient.Client) => {
		sendMyPresence(client)
			.then(() => {
				return Promise.all([
					fetchBookmarks(client),
					fetchRoster(client),
					fetchInbox(client),
					fetchServices(client),
					catchupPubsub(client, "urn:xmpp:mds:displayed:0"),
					client.iqCaller.set(xml("enable", {xmlns: "urn:xmpp:carbons:2"})),
				]);
			})
			.then(() => undefined);
	});

	const onClientStatusChanged = useLatestCallback((
		client: xmppClient.Client,
		status: keyof Connection.StatusEvents,
		..._args: unknown[]
	) => {
		// seems to only sometimes go to "online"?
		if(status === "online" || (status === "open" && client.jid !== null && client.jid.resource !== "")) {
			updateAccount(client, account => ({...account, connected: true}));
		}
		else {
			updateAccount(client, account => ({...account, connected: false}));
		}
	});

	const onClientError = useLatestCallback((client: xmppClient.Client, err: unknown) => {
		console.error(err);

		const stop = err instanceof SASLError;

		if(stop) client.stop();

		updateAccount(client, account => ({...account, lastError: err, stopped: stop}));
	});

	function handlePubsubRetract(client: xmppClient.Client, from: JID | undefined, node: string, itemID: string) {
		if(node === "urn:xmpp:bookmarks:1") {
			handleBookmarksUpdate(client, "remove", undefined, [itemID]);
		}
	}

	function handleChatStateUpdate(client: xmppClient.Client, elem: Element, from: JID) {
		const composing =
			(
				typeof elem.getChild("composing", "http://jabber.org/protocol/chatstates") !== "undefined" ||
					typeof elem.getChild("paused", "http://jabber.org/protocol/chatstates") !== "undefined"
			) ?
				true :
				(
					(
						typeof elem.getChild("active", "http://jabber.org/protocol/chatstates") !== "undefined" ||
							typeof elem.getChild("inactive", "http://jabber.org/protocol/chatstates") !== "undefined" ||
							typeof elem.getChild("gone", "http://jabber.org/protocol/chatstates") !== "undefined"
					) ?
						false :
						null
				);

		if(composing !== null) {
			console.log("updating composing from", from, composing, elem);

			upsertCounterpart(client, from, current => ({
				...current,
				composingFrom: composing,
			}));
		}
	}

	function handleMessageStanza(client: xmppClient.Client, elem: Element, idFromWrapper?: StanzaID, timestampFromWrapper?: Date) {
		const fromStr = elem.getAttr("from");
		const from = typeof fromStr === "undefined" ? undefined : parseJID(fromStr);

		const toStr = elem.getAttr("to");
		const to = typeof toStr === "undefined" ? undefined : parseJID(toStr);

		if(elem.getAttr("type") === "groupchat") {
			if(typeof from !== "undefined") {
				const room = from.bare();

				let archiveID = (idFromWrapper?.type === StanzaIDType.Stanza && idFromWrapper.by.equals(room)) ?
					idFromWrapper.id :
					null;

				const idElem = elem.getChild("stanza-id", "urn:xmpp:sid:0");
				if(typeof idElem !== "undefined") {
					const maybeID = idElem.getAttr("id");
					const maybeBy = idElem.getAttr("by");
					if(typeof maybeID === "string" && maybeBy === room.toString()) {
						archiveID = maybeID;
					}
				}

				const elementID = elem.getAttr("id");

				let outgoingListener;
				if(typeof elementID === "string") {
					outgoingListener = outgoingMessagesRef.current.get(elementID);
					outgoingMessagesRef.current.delete(elementID);
				}
				else {
					outgoingListener = undefined;
				}

				const errorElem = elem.getChild("error");
				if(typeof errorElem !== "undefined") {
					if(typeof outgoingListener !== "undefined") {
						outgoingListener.reject(errorElem);
					}

					return;
				}

				handleChatStateUpdate(client, elem, from);

				const content = elem.getChildText("body");
				let ignore = false;

				const retractElem = elem.getChild("retract", "urn:xmpp:message-retract:1");

				if(typeof retractElem !== "undefined") {
					const targetID = retractElem.getAttr("id");

					if(typeof targetID === "string") {
						emit("messageRemove", {
							removal: {type: "retract"},
							target: new StanzaID(
								StanzaIDType.Stanza,
								from.bare(),
								targetID,
							),
							room: from.bare(),
							from,
						});

						ignore = true;
					}
				}

				if(content !== null && !ignore) {
					let timestamp: Date | null = timestampFromWrapper ?? null;

					const delayElem = elem.getChild("delay", "urn:xmpp:delay");
					if(typeof delayElem !== "undefined") {
						timestamp = new Date(delayElem.getAttr("stamp"));
					}

					const isNew = timestamp === null;

					timestamp ??= new Date();

					const ids = [];
					if(archiveID !== null) {
						ids.push(new StanzaID(StanzaIDType.Stanza, room, archiveID));
					}
					if(typeof elementID === "string") {
						ids.push(new StanzaID(StanzaIDType.Element, from, elementID));
					}

					handleMessage({
						account: client.jid!.bare(),
						message: {
							room, // TODO is this correct for non-anonymous MUCs?
							from: from,
							to: null,
							content,
							ids,
							localID: ids.length > 0 ? ids[0].toString() : xid(),
							timestamp,
							removal: null,
						},
						isNew,
					});

					upsertCounterpart(client, room, entry => {
						if(
							entry.lastMessageTimestamp === null ||
								entry.lastMessageTimestamp.getTime() < timestamp.getTime()
						) {
							return {
								...entry,
								lastMessageTimestamp: timestamp,
								lastMessageID: archiveID ?? entry.lastMessageID,
							};
						}
						else return entry;
					});
				}

				outgoingListener?.resolve();
			}
		}
		else if(elem.getAttr("type") === "chat") {
			let archiveID = (
				idFromWrapper?.type === StanzaIDType.Stanza && idFromWrapper.by.equals(client.jid!.bare())
			) ?
				idFromWrapper.id :
				null;

			const idElem = elem.getChild("stanza-id", "urn:xmpp:sid:0");
			if(typeof idElem !== "undefined") {
				const maybeID = idElem.getAttr("id");
				const maybeBy = idElem.getAttr("by");
				if(typeof maybeID === "string" && maybeBy === client.jid!.bare().toString()) {
					archiveID = maybeID;
				}
			}

			const elementID = elem.getAttr("id");

			let outgoingListener;
			if(typeof elementID === "string") {
				outgoingListener = outgoingMessagesRef.current.get(elementID);
				outgoingMessagesRef.current.delete(elementID);
			}
			else {
				outgoingListener = undefined;
			}

			const errorElem = elem.getChild("error");
			if(typeof errorElem !== "undefined") {
				if(typeof outgoingListener !== "undefined") {
					outgoingListener.reject(errorElem);
				}

				return;
			}

			if(typeof from !== "undefined") handleChatStateUpdate(client, elem, from.bare());

			const content = elem.getChildText("body");
			let ignore = false;

			const retractElem = elem.getChild("retract", "urn:xmpp:message-retract:1");

			if(typeof retractElem !== "undefined" && typeof from !== "undefined") {
				const targetID = retractElem.getAttr("id");

				if(typeof targetID === "string") {
					emit("messageRemove", {
						removal: {type: "retract"},
						target: new StanzaID(
							StanzaIDType.Element,
							from.bare(),
							targetID,
						),
						room: null,
						from,
					});

					ignore = true;
				}
			}

			if(content !== null && typeof from !== "undefined" && typeof to !== "undefined" && !ignore) {
				let timestamp: Date | null = timestampFromWrapper ?? null;

				const delayElem = elem.getChild("delay", "urn:xmpp:delay");
				if(typeof delayElem !== "undefined") {
					timestamp = new Date(delayElem.getAttr("stamp"));
				}

				const isNew = timestamp === null;

				timestamp = timestamp ?? new Date();

				console.log("got a message", timestamp, archiveID);

				// Messages might be from me, should count against the recipient in that case
				const conversation = from.bare().equals(client.jid!.bare()) ? to : from.bare();

				upsertCounterpart(client, conversation, entry => {
					if(
						entry.lastMessageTimestamp === null ||
							entry.lastMessageTimestamp.getTime() < timestamp.getTime()
					) {
						return {
							...entry,
							lastMessageTimestamp: timestamp,
							lastMessageID: archiveID ?? entry.lastMessageID,
						};
					}
					else return entry;
				});

				const ids = [];
				if(archiveID !== null) {
					ids.push(new StanzaID(StanzaIDType.Stanza, client.jid!.bare(), archiveID));
				}
				if(typeof elementID === "string") {
					ids.push(new StanzaID(StanzaIDType.Element, from.bare(), elementID));
				}

				handleMessage({
					account: client.jid!.bare(),
					message: {
						room: null,
						from,
						to,
						content,
						ids,
						localID: ids.length > 0 ? ids[0].toString() : xid(),
						timestamp,
						removal: null,
					},
					isNew,
				});
			}
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
					if(typeof messageElem !== "undefined") handleMessageStanza(client, messageElem, id, timestamp);
				}
			}

			const eventElem = elem.getChild("event", "http://jabber.org/protocol/pubsub#event");
			if(typeof eventElem !== "undefined") {
				eventElem.getChildren("items").forEach(itemsElem => {
					const node = itemsElem.getAttr("node");
					if(typeof node === "string") {
						itemsElem.getChildren("item").forEach(itemElem => {
							const id = itemElem.getAttr("id");
							if(typeof id === "string") {
								handlePubsubItem(
									client,
									from,
									node,
									{
										id,
										element: itemElem,
									},
								);
							}
						});

						itemsElem.getChildren("retract").forEach(retractElem => {
							const id = retractElem.getAttr("id");

							if(typeof id === "string") {
								handlePubsubRetract(client, from, node, id);
							}
						});
					}
				});
			}
		}
	}

	const startRequestingAvatar = useLatestCallback((client: xmppClient.Client, target: JID, expectedHashes: string[]) => {
		{
			const account = accounts.find(x => x.client === client);
			if(typeof account === "undefined") {
				console.warn("No such account");
				return;
			}

			for(const hash of expectedHashes) {
				const state = account.avatarStates.get(hash);
				if(typeof state !== "undefined") {
					console.log("Already loading this avatar");
					return;
				}
			}
		}

		updateAccount(client, account => {
			const newAvatarStates = new Map(account.avatarStates);

			for(const hash of expectedHashes) {
				newAvatarStates.set(hash, LoadState.loading);
			}

			return {...account, avatarStates: newAvatarStates};
		});

		Promise.all(
			expectedHashes.map(hash => {
				return cache.getItem("avatarImages/" + encodeURIComponent(hash))
					.then(x => x === null ? null : (JSON.parse(x) as AvatarImageCacheEntry));
			}),
		)
			.then(async (cacheResults) => {
				if(!cacheResults.includes(null)) {
					// found all in cache

					console.log("got avatar from cache for", target);

					updateAccount(client, account => {
						const avatarStates = new Map(account.avatarStates);

						for(let i = 0; i < expectedHashes.length; i++) {
							const entry = cacheResults[i]!;
							const content = fromBase64(entry.contentB64);

							const blob = new Blob([content], {type: entry.type});
							const url = URL.createObjectURL(blob);

							avatarStates.set(expectedHashes[i], LoadState.wrapValue(url));
						}

						return {...account, avatarStates};
					});

					return;
				}

				console.log("missing avatar for", target, " - fetching now");

				const result = await client.iqCaller.get(
					xml(
						"vCard",
						{xmlns: "vcard-temp"},
					),
					target.toString(),
				);

				if(typeof result === "undefined") throw new Error("Unexpected result");

				const calls = [];

				for(const photoElem of result.getChildren("PHOTO")) {
					const type = photoElem.getChildText("TYPE");
					const contentB64 = photoElem.getChildText("BINVAL");

					if(type === null || contentB64 === null) continue;

					const content = fromBase64(contentB64);

					calls.push(
						crypto.subtle.digest("SHA-1", content)
							.then(hash => {
								const hashStr = toHex(new Uint8Array(hash));

								const blob = new Blob([content], {type});
								const url = URL.createObjectURL(blob);

								updateAccount(client, account => {
									const newAvatarStates = new Map(account.avatarStates);

									newAvatarStates.set(hashStr, LoadState.wrapValue(url));

									return {...account, avatarStates: newAvatarStates};
								});

								cache.setItem(
									"avatarImages/" + encodeURIComponent(hashStr),
									JSON.stringify({contentB64, type} satisfies AvatarImageCacheEntry),
								);
							}),
					);
				}
			})
			.catch(err => {
				console.error(err);
			})
			.then(() => {
				updateAccount(client, account => {
					const newAvatarStates = new Map(account.avatarStates);

					for(const hash of expectedHashes) {
						const value = newAvatarStates.get(hash);
						if(typeof value === "undefined" || value.state !== "done") {
							newAvatarStates.set(
								hash,
								LoadState.wrapError(new Error("Didn't receive avatar image from request")),
							);
						}
					}

					return {...account, avatarStates: newAvatarStates};
				});
			});
	});

	async function fetchRoomDisco(client: xmppClient.Client, roomJID: JID): Promise<RoomDiscoInfo> {
		return client.iqCaller.get(
			xml("query", {xmlns: "http://jabber.org/protocol/disco#info"}),
			roomJID.toString(),
		)
			.then((result): RoomDiscoInfo => {
				if(typeof result === "undefined") throw new Error("Missing result from MUC disco");

				let isRoom = false;

				result.getChildren("feature").forEach(featureElem => {
					if(featureElem.getAttr("var") === "http://jabber.org/protocol/muc") isRoom = true;
				});

				if(!isRoom) {
					throw new Error("That doesn't appear to be a room");
				}

				const info: RoomDiscoInfo = {
					name: null,
					avatarHashes: [],
				};

				const identityElem = result.getChild("identity");
				if(typeof identityElem !== "undefined") {
					const name = identityElem.getAttr("name");
					if(typeof name === "string") info.name = name;
				}

				result.getChildren("x", "jabber:x:data").forEach(x => {
					if(x.getAttr("type") === "result") {
						x.getChildren("field").forEach(fieldElem => {
							if(fieldElem.getAttr("var") === "muc#roominfo_avatarhash") {
								fieldElem.getChildren("value").forEach(valueElem => {
									info.avatarHashes.push(valueElem.getText());
								});
							}
						});
					}
				});

				return info;
			});
	}

	const fetchAndStoreRoomDisco = useLatestCallback((client: xmppClient.Client, roomJID: JID) => {
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

		fetchRoomDisco(client, roomJID)
			.then(info => {
				if(info.avatarHashes.length > 0) {
					startRequestingAvatar(client, roomJID, info.avatarHashes);
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
		console.log("onClientElement", elem);

		if(elem.getName() === "presence" && elem.getNS() === "jabber:client") {
			const srcJID = parseJID(elem.getAttr("from"));

			const userInfo = elem.getChild("x", "http://jabber.org/protocol/muc#user");
			if(typeof userInfo !== "undefined") {
				const statusElems = userInfo.getChildren("status");

				if(statusElems.length > 0) {
					// it's for this client

					const statuses: string[] = [];

					statusElems.forEach(statusElem => {
						statuses.push(statusElem.getAttr("code"));
					});

					const success = statuses.includes("110");

					const callback = newRoomsRef.current.get(srcJID.bare().toString());
					newRoomsRef.current.delete(srcJID.bare().toString());

					if(success) {
						callback?.resolve({statuses});

						accountsSig.value = accountsSig.value.map(item => {
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

						fetchAndStoreRoomDisco(client, srcJID.bare());
					}
					else {
						callback?.reject(new Error("Failed to join room"));
					}
				}
			}

			const contact = typeof userInfo === "undefined" ? srcJID.bare() : srcJID;

			const type = elem.getAttr("type");

			if(type === "error") {
				console.log("got error presence");

				if(srcJID.resource !== "") {
					// Might be a failure to join a room

					const roomJID = srcJID.bare();

					const errorElem = elem.getChild("error");

					if(
						typeof errorElem !== "undefined" &&
							(errorElem.getAttr("by") === roomJID.toString() || errorElem.getAttr("by") === roomJID.domain)
					) {
						const errorType = errorElem.getAttr("type");

						if(errorType !== "continue") {
							console.error("Got error from room:", errorElem);

							let error;
							if(
								typeof errorElem.getChild("conflict", "urn:ietf:params:xml:ns:xmpp-stanzas") !==
									"undefined"
							) {
								error = new NickConflictError("That nick is already in use");
							}
							else {
								const textElem = errorElem.getChild("text", "urn:ietf:params:xml:ns:xmpp-stanzas");

								error = new Error(
									"Failed to join room" +
										(typeof textElem === "undefined" ? "" : (": " + textElem.getText()))
								);
							}

							updateAccount(client, account => {
								const entry = account.rooms.get(roomJID.toString());

								if(typeof entry === "undefined") return account;

								const rooms = new Map(account.rooms);
								rooms.set(roomJID.toString(), {
									...entry,
									error,
								});

								return {...account, rooms};
							});

							const callback = newRoomsRef.current.get(roomJID.toString());

							if(typeof callback !== "undefined") {
								callback.reject(error);
							}
						}
					}
				}
			}
			else if(type === "unavailable") {
				upsertCounterpart(client, contact, entry => {
					const presences: typeof entry.presences = entry.presences === null ?
						new Map() :
						new Map(entry.presences);
					presences.delete(srcJID.toString());

					return {
						...entry,
						presences,
					};
				});
			}
			else if(type === "subscribe") {
				upsertCounterpart(client, contact, current => ({...current, requestingMySubscription: true}));
			}
			else if(typeof type === "undefined") {
				const showValue = elem.getChildText("show");
				let show = null;
				for(const key_ in PresenceShowType) {
					const key = key_ as keyof typeof PresenceShowType;
					if(PresenceShowType[key] === showValue) {
						show = PresenceShowType[key];
						break;
					}
				}

				upsertCounterpart(client, contact, entry => {
					let presences: Map<string, Presence>;
					if(entry.presences === null) presences = new Map();
					else presences = new Map(entry.presences);

					presences.set(srcJID.toString(), {
						show,
					});

					return {
						...entry,
						presences,
					};
				});
			}

			let avatarHashes = undefined;

			const vcardUpdateElem = elem.getChild("x", "vcard-temp:x:update");
			if(typeof vcardUpdateElem !== "undefined") {
				const photoElems = vcardUpdateElem.getChildren("photo");
				avatarHashes = photoElems.map(photoElem => photoElem.getText());
			}

			console.log("got presence from", srcJID.toString(), ", interpreting as from", contact.toString(), ", avatar hashes:", avatarHashes);

			if(typeof avatarHashes !== "undefined") {
				upsertCounterpart(client, contact, current => ({...current, avatarHashes}));
			}

			if(typeof avatarHashes !== "undefined" && avatarHashes.length > 0) {
				startRequestingAvatar(client, contact, avatarHashes);
			}
		}
		else if(elem.getName() === "message") {
			handleMessageStanza(client, elem);
		}
	});

	const loadAccounts = useCallback(() => {
		const infoStr = localStorage.getItem("deepishAccount");
		if(infoStr === null) {
			accountsSig.value = [];
		}
		else {
			const info = JSON.parse(infoStr) as {
				jid: string;
				token: unknown;
				userAgent: string;
				resource?: string;
			};

			if(typeof info.resource === "undefined") {
				accountsSig.value = [];
			}
			else {
				const jid = parseJID(info.jid);

				const client = createXMPPClientForAccount(jid, info.token, info.userAgent, info.resource, {
					online: onClientOnline,
					status: onClientStatusChanged,
					error: onClientError,
					element: onClientElement,
				}, onClientError);

				{
					const current = accountsSig.value;
					current.forEach(account => {
						account.client.stop();
					});

					accountsSig.value = [
						{
							jid,
							client,
							lastError: null,
							connected: false,
							counterparts: new Map(),
							rooms: new Map(),
							avatarStates: new Map(),
							servicesState: LoadState.loading,
							stopped: false,
						} satisfies Account,
					];
				}

				client.iqCallee.set("jabber:iq:roster", "query", async (req) => {
					console.log("got roster update", req);

					if(
						req.from === null ||
							req.from.equals(jid) ||

							// I'm assuming xmpp.js adds this? The raw message has no from at all
							(req.from.domain === jid.domain && req.from.local === "")
					) {
						const elem = (req as unknown as {element: Element}).element; // ???
						handleRosterUpdate(jid, elem.getChildren("item"), false);

						return true; // ???
					}
					else {
						console.log("ignoring roster update since from isn't me");
					}
				});
			}
		}

		setInited(true);
	}, [accountsSig, onClientOnline, onClientStatusChanged, onClientError, onClientElement, handleRosterUpdate]);

	const listenersRef = useRef<{
		[K in keyof AppEventMap]: Set<(evt: AppEventMap[K]) => void>;
	}>({
		message: new Set(),
		messageRemove: new Set(),
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

	const shouldNotifyForMessage = useCallback((evt: Omit<MessageEvent, "shouldNotify">) => {
		// TODO add configurable logic

		if(!evt.isNew) return false;

		if(evt.message.room === null) {
			if(evt.message.from.equals(evt.account)) return false;

			return true;
		}
		else {
			return false;
		}
	}, []);

	const handleMessage = useCallback((evt: Omit<MessageEvent, "shouldNotify">) => {
		emit("message", {...evt, shouldNotify: shouldNotifyForMessage(evt)});
	}, [emit, shouldNotifyForMessage]);

	const requestArchive = useLatestCallback(
		async (accountJID: JID, entity: JID, params: {with?: JID}, before?: string, options: {max?: number} = {}) => {
			const account = accounts.find(x => x.jid.equals(accountJID));
			if(typeof account === "undefined") throw new Error("No such account");

			return account.client.iqCaller.request(
				xml(
					"iq",
					{type: "set", to: entity.toString()},
					xml(
						"query",
						{xmlns: "urn:xmpp:mam:2"},
						...(
							typeof params.with === "undefined" ?
								[] :
								[xml(
									"x",
									{xmlns: "jabber:x:data", type: "submit"},
									xml("field", {var: "FORM_TYPE", type: "hidden"}, xml("value", {}, "urn:xmpp:mam:2")),
									xml("field", {var: "with"}, xml("value", {}, params.with.toString())),
								)]
						),
						xml(
							"set",
							{xmlns: "http://jabber.org/protocol/rsm"},
							xml("max", {}, (options.max ?? 10).toString()),
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
		},
	);

	const sendMessageToCounterpart = useLatestCallback(async (accountJID: JID, targetJID: JID, message: {body: string}) => {
		const localID = xid();

		const account = accounts.find(x => x.jid.equals(accountJID));
		if(typeof account === "undefined") throw new Error("No such account");

		await account.client.send(
			xml(
				"message",
				{id: localID, to: targetJID.toString(), type: "chat"},
				xml(
					"body",
					{},
					message.body,
				),
			),
		);

		handleMessage({
			account: accountJID,
			message: {
				room: null,
				from: accountJID,
				to: targetJID,
				content: message.body,
				ids: [
					new StanzaID(StanzaIDType.Element, accountJID, localID),
				],
				localID,
				timestamp: new Date(),
				removal: null,
			},
			isNew: true,
		});

		// Non-groupchat messages don't get reflected, so we don't know the stanza ID
		// Make an archive request to get the latest message
		// (which may or may not be this one, but fine for the purpose of displayed sync)
		requestArchive(account.jid, account.jid, {with: targetJID}, undefined, {max: 1});
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

		await reflectDefer.promise;
	});

	const markCounterpartAsVisible = useLatestCallback((accountJID: JID, target: JID) => {
		upsertCounterpart(accountJID, target, entry => {
			if(entry.overrideVisibleTimestamp !== null || entry.lastMessageTimestamp !== null) {
				return entry;
			}

			return {...entry, overrideVisibleTimestamp: new Date()};
		});
	});

	const acceptFriendRequest = useLatestCallback((accountJID: JID, target: JID) => {
		const account = accounts.find(x => x.jid.equals(accountJID));
		if(typeof account === "undefined") throw new Error("No such account");

		const info = account.counterparts.get(target.toString());
		if(typeof info === "undefined") throw new Error("Unknown counterpart");

		if(!info.requestingMySubscription) throw new Error("No such friend request");

		account.client.send(
			xml(
				"presence",
				{to: target.toString(), type: "subscribed"},
			),
		);

		if(
			info.rosterEntry === null ||
				(!info.rosterEntry.requestingSubscriptionTo && !info.rosterEntry.subscriptionTo)
		) {
			account.client.send(
				xml(
					"presence",
					{to: target.toString(), type: "subscribe"},
				),
			);
		}
	});

	const rejectFriendRequest = useLatestCallback((accountJID: JID, target: JID) => {
		{
			const account = accounts.find(x => x.jid.equals(accountJID));
			if(typeof account === "undefined") throw new Error("No such account");

			const info = account.counterparts.get(target.toString());
			if(typeof info === "undefined") throw new Error("Unknown counterpart");

			if(!info.requestingMySubscription) throw new Error("No such friend request");

			account.client.send(
				xml(
					"presence",
					{to: target.toString(), type: "unsubscribed"},
				),
			);
		}

		upsertCounterpart(accountJID, target, current => ({...current, requestingMySubscription: false}));
	});

	const removeFriend = useLatestCallback(async (accountJID: JID, target: JID) => {
		{
			const account = accounts.find(x => x.jid.equals(accountJID));
			if(typeof account === "undefined") throw new Error("No such account");

			await account.client.iqCaller.set(
				xml(
					"query",
					{xmlns: "jabber:iq:roster"},
					xml(
						"item",
						{jid: target.toString(), subscription: "remove"},
					),
				),
			);
		}

		updateAccount(accountJID, account => {
			if(!account.counterparts.has(target.toString())) return account;

			const counterparts = new Map(account.counterparts);
			counterparts.set(
				target.toString(),
				{
					...counterparts.get(target.toString())!,
					rosterEntry: null,
				},
			);

			return {...account, counterparts};
		});
	});

	const sendFriendRequest = useLatestCallback((accountJID: JID, target: JID) => {
		{
			const account = accounts.find(x => x.jid.equals(accountJID));
			if(typeof account === "undefined") throw new Error("No such account");

			const entry = account.counterparts.get(target.toString());

			if(typeof entry !== "undefined" && entry.rosterEntry !== null && entry.rosterEntry.subscriptionTo) {
				throw new Error("That user is already your friend");
			}

			// should trigger server to add target to roster
			account.client.send(
				xml(
					"presence",
					{to: target.toString(), type: "subscribe"},
				),
			);

			account.client.send(
				xml(
					"presence",
					{to: target.toString(), type: "subscribed"},
				),
			);
		}

		upsertCounterpart(accountJID, target, current => ({
			...current,
			rosterEntry: {
				subscriptionFrom: true,
				subscriptionTo: false,
				requestingSubscriptionTo: true,
			},
		}));
	});

	const fetchRoomInfo = useLatestCallback(async (accountJID: JID, roomJID: JID) => {
		const account = accounts.find(x => x.jid.equals(accountJID));
		if(typeof account === "undefined") throw new Error("No such account");

		return fetchRoomDisco(account.client, roomJID);
	});

	const setComposingToCounterpart = useLatestCallback((accountJID: JID, target: JID, composing: boolean) => {
		{
			const account = accounts.find(x => x.jid.equals(accountJID));
			if(typeof account === "undefined") throw new Error("No such account");

			const counterpart = account.counterparts.get(target.toString());
			if(counterpart?.lastReportedComposing === composing) return;

			account.client.send(
				xml(
					"message",
					{type: "chat", to: target.toString()},
					composing ?
						xml("composing", {xmlns: "http://jabber.org/protocol/chatstates"}) :
						xml("active", {xmlns: "http://jabber.org/protocol/chatstates"})
				),
			);
		}

		upsertCounterpart(accountJID, target, current => ({
			...current,
			lastReportedComposing: composing,
		}));
	});

	const setComposingToRoom = useLatestCallback((accountJID: JID, roomJID: JID, composing: boolean) => {
		{
			const account = accounts.find(x => x.jid.equals(accountJID));
			if(typeof account === "undefined") throw new Error("No such account");

			const room = account.rooms.get(roomJID.toString());
			if(room?.lastReportedComposing === composing) return;

			account.client.send(
				xml(
					"message",
					{type: "groupchat", to: roomJID.toString()},
					composing ?
						xml("composing", {xmlns: "http://jabber.org/protocol/chatstates"}) :
						xml("active", {xmlns: "http://jabber.org/protocol/chatstates"})
				),
			);
		}

		updateAccount(accountJID, account => {
			const rooms = new Map(account.rooms);

			const entry = rooms.get(roomJID.toString());

			if(typeof entry === "undefined") {
				console.warn("Attempting to send composing state to unknown room");
			}
			else {
				rooms.set(
					roomJID.toString(),
					{
						...entry,
						lastReportedComposing: composing,
					},
				);
			}

			return {...account, rooms};
		});
	});

	const joinRoom = useLatestCallback(async (accountJID: JID, room: JID, nick?: string) => {
		const account = accounts.find(x => x.jid.equals(accountJID));
		if(typeof account === "undefined") throw new Error("No such account");

		if(account.rooms.has(room.toString())) {
			// already joined
			return;
		}

		{
			const elem = await account.client.iqCaller.get(
				xml("query", {xmlns: "http://jabber.org/protocol/disco#info"}),
				room.toString(),
			);

			console.log(elem);

			if(typeof elem === "undefined") throw new Error("Missing response from disco");

			let isRoom = false;
			for(const child of elem.getChildren("feature")) {
				if(child.getAttr("var") === "http://jabber.org/protocol/muc") {
					isRoom = true;
					break;
				}
			}

			if(!isRoom) throw new Error("That doesn't appear to be a room");

			updateAccount(accountJID, account => {
				const rooms = new Map(account.rooms);

				rooms.set(room.toString(), {
					jid: room,
					nick: nick ?? null,
					connected: false,
					error: null,
					infoState: LoadState.loading,
					lastReportedComposing: false,
				});

				return {...account, rooms};
			});

			try {
				const defer = Promise.withResolvers<RoomJoinCallbackInfo>();

				newRoomsRef.current.set(room.toString(), defer);

				connectMUC(account.client, room, nick);

				await defer.promise;
			}
			catch(ex) {
				updateAccount(accountJID, account => {
					const rooms = new Map(account.rooms);
					rooms.delete(room.toString());
					return {...account, rooms};
				});

				throw ex;
			}

			await publishPubsubItem(
				account.client,
				"urn:xmpp:bookmarks:1",
				xml(
					"item",
					{id: room.toString()},
					xml(
						"conference",
						{xmlns: "urn:xmpp:bookmarks:1", autojoin: "true"},
						...(
							typeof nick === "undefined" ?
								[] :
								[xml("nick", {}, nick)]
						),
					),
				),
				BOOKMARKS_PUBLISH_OPTIONS,
			);
		}
	});

	function disconnectRoom(account: Account, room: Room) {
		return account.client.send(
			xml(
				"presence",
				{
					id: xid(),
					to: new JID(room.jid.local, room.jid.domain, room.nick ?? account.jid.local),
					type: "unavailable",
				},
			),
		);
	}

	const leaveRoom = useLatestCallback(async (accountJID: JID, roomJID: JID) => {
		{
			const account = accounts.find(x => x.jid.equals(accountJID));
			if(typeof account === "undefined") throw new Error("No such account");

			const room = account.rooms.get(roomJID.toString());
			if(typeof room === "undefined") return;

			disconnectRoom(account, room);

			await retractPubsubItem(account.client, "urn:xmpp:bookmarks:1", roomJID.toString(), true);
		}

		updateAccount(accountJID, account => {
			const rooms = new Map(account.rooms);
			rooms.delete(roomJID.toString());

			return {...account, rooms};
		});
	});

	const createRoom = useLatestCallback(async (accountJID: JID, room: JID, params: RoomCreateParams) => {
		if(room.local === "") throw new Error("Room ID cannot be empty");

		const realParams = {
			"muc#roomconfig_membersonly": params.membersOnly,
			"muc#roomconfig_persistentroom": params.persistent,
			"muc#roomconfig_publicroom": params.publicRoom,
			"muc#roomconfig_roomname": params.name,
		};

		const account = accounts.find(x => x.jid.equals(accountJID));
		if(typeof account === "undefined") throw new Error("No such account");

		if(account.rooms.has(room.toString())) throw new Error("A room by that JID already exists");

		const nick = accountJID.local;

		let joinInfo;

		// Join room
		{
			const defer = Promise.withResolvers<RoomJoinCallbackInfo>();
			newRoomsRef.current.set(room.toString(), defer);

			connectMUC(account.client, room, nick);
			joinInfo = await defer.promise;
		}

		console.log("connected to new room");

		try {
			if(!joinInfo.statuses.includes("201")) {
				throw new Error("A room by that JID already exists");
			}

			console.log("fetching form");

			const formResult = await account.client.iqCaller.get(
				xml(
					"query",
					{xmlns: "http://jabber.org/protocol/muc#owner"},
				),
				room.toString(),
			);

			console.log("got form");

			if(typeof formResult === "undefined") throw new Error("Missing form");

			const formElem = formResult.getChild("x", "jabber:x:data");
			if(typeof formElem === "undefined") throw new Error("Server is missing required functionality");

			const fieldElems = formElem.getChildren("field");

			const missingFields = new Set(Object.keys(realParams));

			fieldElems.forEach(elem => {
				const key = elem.getAttr("var");
				missingFields.delete(key);

				if(typeof elem.getChild("required") !== "undefined") {
					if(!(key in realParams)) throw new Error("Server requires additional information");
				}
			});

			if(missingFields.size > 0) throw new Error("Server is missing required functionality");

			console.log("finalizing room creation");

			await account.client.iqCaller.set(
				xml(
					"query",
					{xmlns: "http://jabber.org/protocol/muc#owner"},
					xml(
						"x",
						{xmlns: "jabber:x:data", type: "submit"},
						xml(
							"field",
							{var: "FORM_TYPE"},
							xml("value", {}, "http://jabber.org/protocol/muc#roomconfig"),
						),
						...Object.keys(realParams).map(key_ => {
							const key = key_ as keyof typeof realParams;

							return xml(
								"field",
								{var: key},
								xml("value", {}, realParams[key].toString()),
							);
						}),
					),
				),
				room.toString(),
			);
		}
		finally {
			// Leave room

			account.client.send(
				xml(
					"presence",
					{id: xid(), to: new JID(room.local, room.domain, nick), type: "unavailable"},
				),
			);
		}
	});

	const currentDisplayedUpdatesRef = useRef(new Map<string, string>());

	const submitDisplayedUpdateInner = useLatestCallback(
		async (accountJID: JID, targetJID: JID, lastReadMessageID: string, isRoom: boolean) => {
			const account = accounts.find(x => x.jid.equals(accountJID));
			if(typeof account === "undefined") throw new Error("No such account");

			publishPubsubItem(
				account.client,
				"urn:xmpp:mds:displayed:0",
				xml(
					"item",
					{id: targetJID.toString()},
					xml(
						"displayed",
						{xmlns: "urn:xmpp:mds:displayed:0"},
						xml(
							"stanza-id",
							{
								xmlns: "urn:xmpp:sid:0",
								by: (isRoom ? targetJID : accountJID).toString(), id: lastReadMessageID,
							},
						),
					),
				),
				{
					persistItems: true,
					maxItems: "max",
					sendLastPublishedItem: "never",
					accessModel: "whitelist",
				},
			);
		},
	);

	const submitDisplayedUpdate = useCallback(
		(accountJID: JID, targetJID: JID, lastReadMessageID: string, isRoom: boolean) => {
			const key = encodeURIComponent(accountJID.toString()) + "/" + encodeURIComponent(targetJID.toString());
			const running = currentDisplayedUpdatesRef.current.has(key);
			currentDisplayedUpdatesRef.current.set(key, lastReadMessageID);

			if(running) {
				// Will submit after current run finishes
				return;
			}

			function task(value: string) {
				submitDisplayedUpdateInner(accountJID, targetJID, value, isRoom)
					.catch(console.error)
					.then(() => {
						if(currentDisplayedUpdatesRef.current.get(key) !== value) {
							task(currentDisplayedUpdatesRef.current.get(key)!);
						}
						else {
							currentDisplayedUpdatesRef.current.delete(key);
						}
					});
			}

			task(lastReadMessageID);
		},
		[submitDisplayedUpdateInner],
	);

	const markCounterpartAsRead = useLatestCallback(
		(accountJID: JID, targetJID: JID, lastReadMessageID: string, isRoom: boolean) => {
			upsertCounterpart(accountJID, targetJID, current => ({
				...current,
				lastReadMessageID,
			}));

			submitDisplayedUpdate(accountJID, targetJID, lastReadMessageID, isRoom);
		},
	);

	const setNick = useLatestCallback(async (accountJID: JID, value: string) => {
		const account = accounts.find(x => x.jid.equals(accountJID));
		if(typeof account === "undefined") throw new Error("No such account");

		await publishPubsubItem(
			account.client,
			"http://jabber.org/protocol/nick",
			xml(
				"item",
				{},
				xml(
					"nick",
					{xmlns: "http://jabber.org/protocol/nick"},
					value,
				),
			),
		);
	});

	const setAvatar = useLatestCallback(async (accountJID: JID, value: ImageInfo) => {
		const account = accounts.find(x => x.jid.equals(accountJID));
		if(typeof account === "undefined") throw new Error("No such account");

		const content = await value.content.bytes();
		const hash = await crypto.subtle.digest("SHA-1", content);
		const hashStr = toHex(new Uint8Array(hash));

		const contentB64 = toBase64(content);

		// Prefill local cache
		await cache.setItem(
			"avatarImages/" + encodeURIComponent(hashStr),
			JSON.stringify({contentB64, type: "image/png"} satisfies AvatarImageCacheEntry),
		);

		await publishPubsubItem(
			account.client,
			"urn:xmpp:avatar:data",
			xml(
				"item",
				{id: hashStr},
				xml(
					"data",
					{xmlns: "urn:xmpp:avatar:data"},
					contentB64,
				),
			),
		);

		await publishPubsubItem(
			account.client,
			"urn:xmpp:avatar:metadata",
			xml(
				"item",
				{id: hashStr},
				xml(
					"metadata",
					{xmlns: "urn:xmpp:avatar:metadata"},
					xml(
						"info",
						{
							bytes: content.byteLength,
							id: hashStr,
							height: value.height,
							type: "image/png",
							width: value.width,
						},
					),
				),
			),
		);
	});

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

	return useMemo(
		() => ({
			accounts,
			inited,
			idle,

			saveToken(jid, token, userAgent, resource) {
				localStorage.setItem("deepishAccount", JSON.stringify({jid: jid.toString(), token, userAgent, resource}));
				loadAccounts();
			},
			logout(jid) {
				if(accounts.length > 0 && accounts[0].jid.equals(jid)) {
					localStorage.removeItem("deepishAccount");
					loadAccounts();
				}
			},

			addEventListener,
			removeEventListener,

			requestArchive,
			sendMessageToCounterpart,
			sendMessageToRoom,
			markCounterpartAsVisible,
			markCounterpartAsRead,
			acceptFriendRequest,
			rejectFriendRequest,
			removeFriend,
			setComposingToCounterpart,
			setComposingToRoom,
			joinRoom,
			leaveRoom,
			createRoom,
			sendFriendRequest,
			fetchRoomInfo,
			setNick,
			setAvatar,
		} satisfies ConnectionContext),
		[
			accounts,
			inited,
			idle,
			addEventListener,
			removeEventListener,
			requestArchive,
			sendMessageToCounterpart,
			sendMessageToRoom,
			loadAccounts,
			markCounterpartAsVisible,
			markCounterpartAsRead,
			acceptFriendRequest,
			rejectFriendRequest,
			setComposingToCounterpart,
			setComposingToRoom,
			joinRoom,
			leaveRoom,
			removeFriend,
			createRoom,
			sendFriendRequest,
			fetchRoomInfo,
			setNick,
			setAvatar,
		],
	);
}

export function useConnectionContext() {
	const value = useContext(ConnectionContext);

	if(typeof value === "undefined") throw new Error("Attempted to read connection outside of context");

	return value;
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

function expectValue<T>(value: T | null | undefined): T {
	if(value === null) throw new Error("Unexpected null");
	else if(typeof value === "undefined") throw new Error("Unexpected undefined");
	else return value;
}

class NickConflictError extends Error {
}

function createXMPPClientForAccount(
	jid: JID,
	token: unknown,
	userAgent: string,
	resource: string,
	listeners: {
		[K in keyof Connection.ConnectionEvents]?: Connection.ConnectionEvents[K] extends (...args: infer T) => infer O ?
			(client: xmppClient.Client, ...args: T) => O :
			never
	},
	onStartError: (client: xmppClient.Client, err: unknown) => void,
) {
	const client = xmppClient.client({
		service: jid.domain,
		domain: jid.domain,
		username: jid.local,
		credentials: {
			username: jid.local,
			token,
		},
		userAgent: xml("user-agent", {id: userAgent}),
		resource,
		mechanisms: [],
	});

	for(const key_ in listeners) {
		const key = key_ as keyof Connection.ConnectionEvents;
		if(typeof listeners[key] === "undefined") continue;

		// objects are messy
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		client.on(key, (listeners[key] as any).bind(undefined, client));
	}

	client.iqCallee.get("http://jabber.org/protocol/disco#info", "query", async () => {
		const ver = await genVerString([IDENTITY], FEATURES);

		return xml(
			"query",
			{xmlns: "http://jabber.org/protocol/disco#info", node: NODE_URL + "#" + ver},
			xml(
				"identity",
				{category: IDENTITY.category, name: IDENTITY.name, type: IDENTITY.type, "xml:lang": IDENTITY.lang},
			),
			...FEATURES.map(feature => xml("feature", {var: feature})),
		);
	});

	client.start().catch(onStartError.bind(undefined, client));

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

export function useAccount() {
	const connectionCtx = useConnectionContext();
	const account = connectionCtx.accounts[0];
	if(typeof account === "undefined") throw new Error("Attempted to read account while not logged in");

	return account;
}

export function messageRemovalIsAllowed(message: Message, evt: MessageRemovalEvent) {
	if(evt.removal.type === "retract") {
		// Allow retractions for one's own messages

		return (evt.room === null ? evt.from.bare() : evt.from)
			.equals(evt.room === null ? message.from.bare() : message.from)
	}
	else {
		const _: never = evt.removal.type;
		console.warn("Unknown removal type");
		return false;
	}
}
