import { IDBCache } from "@instructure/idb-cache";
import { batch, ReadonlySignal, Signal, signal, useComputed } from "@preact/signals";
import { useLiveSignal } from "@preact/signals/utils";
import Connection from "@xmpp/connection";
import xid from "@xmpp/id";
import { JID, parse as parseJID } from "@xmpp/jid";
import StanzaError from "@xmpp/middleware/lib/StanzaError";
import SASLError from "@xmpp/sasl/lib/SASLError";
import xml, { Element, Node } from "@xmpp/xml";
import fromBase64 from "es-arraybuffer-base64/Uint8Array.fromBase64";
import toBase64 from "es-arraybuffer-base64/Uint8Array.prototype.toBase64";
import toHex from "es-arraybuffer-base64/Uint8Array.prototype.toHex";
import { createContext } from "preact";
import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import useLatestCallback from "use-latest-callback";

import { DEFAULT_NOTIFICATIONS_SETTINGS, NotificationsSettings } from "..";
import { compareRanks, DEFAULT_RANK, genRankBetween } from "./lexrank";
import { markdownHasAnyFormatting, parseMarkdown, renderMarkdownTo0393, renderMarkdownToXHTML } from "./markdown";
import SignalMap from "./SignalMap";
import { AvatarMetadata, Counterpart, NotificationCategory, Presence, PresenceShowType, RosterEntry, TuneInfo } from "./types";
import { LoadState } from "./useData";
import useEffectOnce from "./useEffectOnce";
import useIdle, { IdleState } from "./useIdle";
import * as xmppClient from "./xmpp/client";
import { fetchPubsubItem, fetchPubsubItems, publishPubsubItem, PubsubItemInfo, PubsubPublishOptions, retractPubsubItem } from "./xmpp/pubsub";
import StanzaID, { StanzaIDType } from "./xmpp/StanzaID";

const FEATURES: string[] = [
	"urn:xmpp:bookmarks:1+notify",
	"urn:xmpp:avatar:metadata+notify",
	"urn:xmpp:mds:displayed:0+notify",
	"http://jabber.org/protocol/nick+notify",
	"http://jabber.org/protocol/tune+notify",

	"http://jabber.org/protocol/chatstates",
	"urn:xmpp:message-retract:1",
	"urn:xmpp:styling:0",
	"urn:xmpp:content",
	"urn:xmpp:message-correct:0",
	"urn:xmpp:reactions:0",
];
const IDENTITY = {category: "client", type: "web", lang: "", name: "Deepish"};
const NODE_URL = "https://deepish.vpzom.click";

const DEFAULT_COUNTERPART_INFO: Omit<Counterpart, "jid"> = {
	rosterEntry: null,
	requestingMySubscription: false,
	lastMessageID: null,
	lastMessageIDForUnread: null,
	lastMessageTimestamp: null,
	lastMessageTimestampForUnread: null,
	lastMessageTimestampFromInbox: null,
	overrideVisibleTimestamp: null,
	avatars: [],
	presences: null,
	lastReportedComposing: false,
	composingFrom: null,
	nick: null,

	currentTune: null,

	occupantID: null,
	affiliation: null,
	role: null,

	lastReadMessageID: null,
};

const ROOM_RETRY_DELAY = 7000;

export interface RoomDiscoInfo {
	name: string | null;
	avatarHashes: string[];
}

export interface RoomConfig {
	name: string | null;
	publicRoom: boolean | null;
	membersOnly: boolean | null;
}

export enum NotificationLevel {
	Never = "never",
	OnMention = "on-mention",
	Always = "always",
}

export interface Room {
	jid: JID;
	nick: string | null;

	extensionsContent: Node[];
	rank: string;
	notificationLevel: NotificationLevel | null;

	connected: boolean;
	connectedNick: string | null;
	error: unknown;
	stopped: boolean;

	infoState: LoadState<RoomDiscoInfo>;

	internalMutable: {
		lastReportedComposing: boolean;
		lastSeen: Date;
	};
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

	counterparts: SignalMap<string, Counterpart>;
	rooms: SignalMap<string, Room>;

	avatarStates: SignalMap<string, LoadState<string>>;
	servicesState: LoadState<ServiceInfo[]>;
}

export type MessageRemoval = {
	"type": "retract";
};

export type MessageContent = {
	type: "plain";
	content: string;
} | {
	type: "0393";
	content: string;
} | {
	type: "xhtml";
	content: Element;
} | {
	type: "markdown";
	content: string;
};

export interface Message {
	room: JID | null;
	from: JID;
	occupantID: string | null;
	to: JID | null;
	content: MessageContent[];
	ids: StanzaID[];
	localID: string;
	timestamp: Date;

	removal: null | MessageRemoval;
	editedAt: Date | null;
	reactions: Map<string, MessageReactionsSet>;
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
	from: {jid: JID; occupantID?: string};
}

export interface MessageEditEvent {
	edit: {
		content: MessageContent[];
		timestamp: Date;
	};
	room: JID | null;
	target: StanzaID;
	from: {jid: JID; occupantID?: string};
}

export interface MessageReactionsSet {
	reactions: Set<string>;
	timestamp: Date;
}

export interface MessageReactionsChangeEvent {
	reactions: MessageReactionsSet;
	room: JID | null;
	target: StanzaID;
	from: {jid: JID; occupantID?: string};
}

interface AppEventMap {
	message: MessageEvent;
	messageEdit: MessageEditEvent;
	messageReactionsChange: MessageReactionsChangeEvent;
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

export interface RoomEditParams {
	name?: string;
	membersOnly?: boolean;
	publicRoom?: boolean;
}

interface RoomJoinCallbackInfo {
	statuses: string[];
}

interface ImageInfo {
	content: Blob;
	width: number;
	height: number;
}

export interface BaseConnectionContext {
	accountsSig: Signal<Account[]>;

	getAccount(identifier: JID): Account;

	addEventListener<K extends keyof AppEventMap>(
		event: K,
		listener: (evt: AppEventMap[K]) => void,
	): void;
	removeEventListener<K extends keyof AppEventMap>(
		event: K,
		listener: (evt: AppEventMap[K]) => void,
	): void;
	requestArchive(account: JID, entity: JID, params: {with?: JID}, before?: string): Promise<ResultSetInfo | null>;
	sendMessageToRoom(account: JID, room: JID, message: {body: string}, options?: {replaces?: string}): Promise<void>;
	sendMessageToCounterpart(account: JID, target: JID, message: {body: string}, options?: {replaces?: string}): Promise<void>;
	retractMessageToRoom(account: JID, room: JID, messageID: string): Promise<void>;
	retractMessageToCounterpart(account: JID, target: JID, messageID: string): Promise<void>;
	sendMessageReactionsToRoom(account: JID, room: JID, messageID: string, reactions: string[]): Promise<void>;
	sendMessageReactionsToCounterpart(account: JID, room: JID, messageID: string, reactions: string[]): Promise<void>;
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
	changeRoomConfig(account: JID, room: JID, params: RoomEditParams): void;
	setRoomAvatar(account: JID, room: JID, info: ImageInfo): void;
	fetchRoomInfo(account: JID, room: JID): Promise<RoomDiscoInfo>;
	fetchRoomConfig(account: JID, room: JID): Promise<RoomConfig>;
	markCounterpartAsRead(account: JID, target: JID, lastReadMessageID: string, isRoom: boolean): void;
	setNick(account: JID, value: string): Promise<void>;
	setAvatar(account: JID, info: ImageInfo): Promise<void>;
	reorderRoom(account: JID, room: JID, to: {before: JID | null; after: JID | null}): Promise<void>;
	setRoomNotificationLevel(account: JID, room: JID, level: NotificationLevel): Promise<void>;

	loadAccounts(): void;
	pingRoom(account: JID, room: JID): void;
}

export interface ConnectionContext extends BaseConnectionContext {
	inited: boolean;
	idle: IdleState;

	saveToken(jid: JID, token: unknown, userAgent: string, resource: string): void;
	logout(jid: JID): void;
}

export const ConnectionContext = createContext<ConnectionContext | undefined>(undefined);

const BOOKMARKS_PUBLISH_OPTIONS: PubsubPublishOptions = {
	persistItems: true,
	maxItems: "max",
	sendLastPublishedItem: "never",
	accessModel: "whitelist",
};

const NOTIFICATION_LEVEL_ELEMENT_MAP: Record<NotificationLevel, string> = {
	[NotificationLevel.Always]: "always",
	[NotificationLevel.OnMention]: "on-mention",
	[NotificationLevel.Never]: "never",
};

export function useCreateConnection(
	cache: IDBCache,
	notificationsSettingsSig: ReadonlySignal<NotificationsSettings>,
): ConnectionContext {
	const idle = useIdle();

	const cacheSig = useLiveSignal(cache);
	const idleSig = useLiveSignal(idle);
	const conn = useMemo(() => {
		return createBaseConnection(cacheSig, idleSig, notificationsSettingsSig);
	}, [cacheSig, idleSig, notificationsSettingsSig]);

	const [inited, setInited] = useState(false);

	const loadAccounts = useCallback(() => {
		conn.loadAccounts();
		setInited(true);
	}, [conn]);

	useEffectOnce(() => {
		loadAccounts();
	});

	const maybePingRooms = useCallback(() => {
		conn.accountsSig.value.forEach(account => {
			account.rooms.values().forEach(room => {
				if(room.connected && new Date().getTime() - room.internalMutable.lastSeen.getTime() > 60000) {
					conn.pingRoom.call(undefined, account.jid, room.jid);
				}
			});
		});
	}, [conn.accountsSig, conn.pingRoom]);

	useEffect(() => {
		const interval = setInterval(maybePingRooms, 10000);
		return () => {
			clearInterval(interval);
		};
	}, [maybePingRooms]);

	const onUnmount = useLatestCallback(() => {
		conn.accountsSig.value.forEach(account => {
			account.client.stop();
		});
	});
	useEffect(() => {
		return onUnmount;
	}, [onUnmount]);

	return useMemo(
		() => ({
			...conn,

			inited,
			idle,

			saveToken(jid, token, userAgent, resource) {
				localStorage.setItem("deepishAccount", JSON.stringify({jid: jid.toString(), token, userAgent, resource}));
				loadAccounts();
			},
			logout(jid) {
				const accounts = conn.accountsSig.value;
				if(accounts.length > 0 && accounts[0].jid.equals(jid)) {
					localStorage.removeItem("deepishAccount");
					loadAccounts();
				}
			},

		} satisfies ConnectionContext),
		[conn, idle, inited, loadAccounts],
	);
}

export function useConnectionContext() {
	const value = useContext(ConnectionContext);

	if(typeof value === "undefined") throw new Error("Attempted to read connection outside of context");

	return value;
}

function createBaseConnection(
	cacheSig: Signal<IDBCache>,
	idleSig: Signal<IdleState>,
	notificationsSettingsSig: ReadonlySignal<NotificationsSettings>,
): BaseConnectionContext {
	// eventually we might support multiple accounts
	// just one for now though
	const accountsSig = signal<Account[]>([]);

	const outgoingMessages = new Map<string, {resolve: () => void; reject: (err: unknown) => void}>();
	const newRooms = new Map<string, {resolve: (value: RoomJoinCallbackInfo) => void; reject: (err: unknown) => void}>();

	function updateAccount(identifier: xmppClient.Client | JID, fn: (current: Account) => Account) {
		accountsSig.value = accountsSig.value.map(account => {
			if(identifier instanceof JID ? account.jid.equals(identifier) : account.client === identifier) {
				return fn(account);
			}
			else return account;
		});
	}

	function tryGetAccount(identifier: xmppClient.Client | JID) {
		return accountsSig.value.find(account => {
			return identifier instanceof JID ? account.jid.equals(identifier) : account.client === identifier;
		});
	}

	function getAccount(identifier: xmppClient.Client | JID) {
		const result = tryGetAccount(identifier);
		if(typeof result === "undefined") throw new Error("No such account");
		else return result;
	}

	function upsertCounterpart(accountIdentifier: xmppClient.Client | JID, counterpartJID: JID, fn: (current: Counterpart) => Counterpart) {
		const account = getAccount(accountIdentifier);

		account.counterparts.set(counterpartJID.toString(), fn(
			account.counterparts.get(counterpartJID.toString()) ??
				{...DEFAULT_COUNTERPART_INFO, jid: counterpartJID}
		));
	}

	function connectMUCFromBookmarks(client: xmppClient.Client, roomJID: JID) {
		const account = getAccount(client);

		const info = account.rooms.get(roomJID.toString());
		if(typeof info === "undefined") throw new Error("No such bookmark");

		const nick = info.nick ?? client.jid!.local;
		connectMUC(client, roomJID, nick);
	}

	function handleBookmarksUpdate(
		client: xmppClient.Client,
		mode: "add" | "remove" | "all",
		newItems?: PubsubItemInfo[],
		removedItems?: string[],
	) {
		const wantedRooms: Array<{
			jid: string;
			nick?: string;

			extensionsContent: Node[];
			rank: string;
			notificationLevel: NotificationLevel | null;
		}> = [];

		if(typeof newItems !== "undefined") {
			newItems.forEach(item => {
				const jid = item.id;

				const conf = item.element.getChild("conference", "urn:xmpp:bookmarks:1");
				if(typeof conf !== "undefined") {
					const autojoinValue = conf.getAttr("autojoin");
					if(autojoinValue === "true" || autojoinValue === "1") {
						const entry: typeof wantedRooms[0] = {
							jid,

							extensionsContent: [],
							rank: DEFAULT_RANK,
							notificationLevel: null,
						};

						const nickNode = conf.getChild("nick");
						if(typeof nickNode !== "undefined") {
							entry.nick = nickNode.getText();
						}

						const extensionsNode = conf.getChild("extensions");
						if(typeof extensionsNode !== "undefined") {
							entry.extensionsContent = extensionsNode.children;

							const rankNode = extensionsNode.getChild("rank", "http://deepish.vpzom.click/ns/rank");
							if(typeof rankNode !== "undefined") {
								entry.rank = rankNode.getText();
							}

							const notifyNode = extensionsNode.getChild("notify", "urn:xmpp:notification-settings:1");
							if(typeof notifyNode !== "undefined") {
								for(const key_ in NOTIFICATION_LEVEL_ELEMENT_MAP) {
									const key = key_ as NotificationLevel;

									notifyNode.getChildren(NOTIFICATION_LEVEL_ELEMENT_MAP[key]).forEach(levelElem => {
										// Currently we always use the fallback setting

										if(
											typeof levelElem.getAttr("identity-category") !== "string" &&
												typeof levelElem.getAttr("identity-type") !== "string"
										) {
											entry.notificationLevel = key;
										}
									});
								}
							}
						}

						wantedRooms.push(entry);
					}
				}
			});
		}

		const account = getAccount(client);
		const extraRooms = new Set<string>(account.rooms.keys());

		wantedRooms.forEach(entry => {
			const existing = account.rooms.get(entry.jid);
			extraRooms.delete(entry.jid);

			const nick = entry.nick ?? client.jid!.local;

			if(
				typeof existing === "undefined" ||
					(existing.connectedNick !== null && existing.connectedNick !== nick) ||
					!existing.connected
			) {
				const jid = parseJID(entry.jid);

				account.rooms.set(entry.jid, {
					jid,
					nick: entry.nick ?? null,

					extensionsContent: entry.extensionsContent,
					rank: entry.rank,
					notificationLevel: entry.notificationLevel,

					connected: false,
					connectedNick: nick,
					error: null,
					stopped: false,
					infoState: LoadState.loading,

					internalMutable: {
						lastReportedComposing: false,
						lastSeen: new Date(),
					},
				});
				connectMUCFromBookmarks(client, jid);
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
				const entry = account.rooms.get(roomJID);
				if(typeof entry !== "undefined") {
					account.rooms.delete(roomJID);
					disconnectRoom(account, entry);
				}
			});
		}
	}

	async function fetchBookmarks(client: xmppClient.Client) {
		const initBookmarks = await fetchPubsubItems(client, "urn:xmpp:bookmarks:1");

		handleBookmarksUpdate(client, "all", initBookmarks.items);
	}

	function handleRosterUpdate(accountJID: JID, items: Element[], isAll: boolean) {
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
			const account = getAccount(accountJID);

			newContacts.forEach((info, contact) => {
				const entry = account.counterparts.get(contact);
				if(typeof entry === "undefined") {
					account.counterparts.set(contact, {
						...DEFAULT_COUNTERPART_INFO,
						jid: parseJID(contact),
						rosterEntry: info,
					});
				}
				else {
					account.counterparts.set(contact, {
						...entry,
						rosterEntry: info,
						requestingMySubscription: entry.requestingMySubscription && !info.subscriptionFrom,
					});
				}
			});

			if(isAll) {
				for(const [key, value] of account.counterparts.entries()) {
					if(value.rosterEntry !== null && !newContacts.has(key)) {
						account.counterparts.set(key, {
							...value,
							rosterEntry: null,
						});
					}
				}
			}
		}
	}

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
			{
				const account = getAccount(client);
				newLastMessageTimestamps.forEach((timestamp, itemJID) => {
					account.counterparts.set(itemJID, {
						...(account.counterparts.get(itemJID) ?? {...DEFAULT_COUNTERPART_INFO, jid: parseJID(itemJID)}),
						lastMessageTimestampFromInbox: timestamp,
					});
				});
			}

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
						if(typeof counterpart !== "undefined" && counterpart.lastMessageIDForUnread !== null) {
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

	function handlePubsubItem(client: xmppClient.Client, from: JID | undefined, node: string, item: PubsubItemInfo) {
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
		else if(node === "http://jabber.org/protocol/tune") {
			if(typeof from !== "undefined") {
				const tuneElem = item.element.getChild("tune", "http://jabber.org/protocol/tune");

				let value: TuneInfo | null = null;
				if(typeof tuneElem !== "undefined") {
					value = {
						artist: tuneElem.getChildText("artist") ?? undefined,
						title: tuneElem.getChildText("title") ?? undefined,
					};
				}

				upsertCounterpart(client, from, current => ({
					...current,
					currentTune: value,
				}));
			}
		}
		else if(node === "urn:xmpp:avatar:metadata") {
			if(typeof from !== "undefined") {
				const contact = from;

				const avatars: Array<AvatarMetadata | string> = [];

				const metadataElem = item.element.getChild("metadata", "urn:xmpp:avatar:metadata");
				if(typeof metadataElem !== "undefined") {
					metadataElem.getChildren("info").forEach(infoElem => {
						const type = infoElem.getAttr("type");
						const hash = infoElem.getAttr("id");

						if(typeof type === "string" && typeof hash === "string") {
							avatars.push({
								type,
								hash,
							});
						}
					});
				}

				upsertCounterpart(client, contact, current => ({
					...current,
					avatars,
				}));

				startRequestingAvatar(client, contact, avatars);
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
	}

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

	async function sendMyPresence(client: xmppClient.Client) {
		const idle = idleSig.value;

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
	}

	idleSig.subscribe(() => {
		accountsSig.value.forEach(account => {
			if(
				account.client.status === "online" ||
					(
						account.client.status === "open" &&
							account.client.jid !== null &&
							account.client.jid.resource !== ""
					)
			) {
				sendMyPresence(account.client);
			}
		});
	});

	function onClientOnline(client: xmppClient.Client) {
		// assume rooms are disconnected, will get reconnected after bookmarks fetch

		const account = getAccount(client);

		for(const [key, value] of account.rooms.entries()) {
			if(value.connected) {
				account.rooms.set(
					key,
					{
						...value,
						connected: false,
						error: null,
					},
				);
			}
		}

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
	}

	function onClientStatusChanged(
		client: xmppClient.Client,
		status: keyof Connection.StatusEvents,
		..._args: unknown[]
	) {
		console.log("STATUS IS NOW:", status);

		// seems to only go to "online" when not a resume
		if(status === "online" || (status === "open" && client.jid !== null && client.jid.resource !== "")) {
			updateAccount(client, account => ({...account, connected: true}));
		}
		else {
			updateAccount(client, account => ({...account, connected: false}));
		}
	}

	function onClientError(client: xmppClient.Client, err: unknown) {
		console.error(err);

		const stop = err instanceof SASLError;

		if(stop) client.stop();

		updateAccount(client, account => ({...account, lastError: err, stopped: stop}));
	}

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

				let archiveID = (
					idFromWrapper?.type === StanzaIDType.Stanza &&
						idFromWrapper.by !== null &&
						idFromWrapper.by.equals(room)
				) ?
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
					outgoingListener = outgoingMessages.get(elementID);
					outgoingMessages.delete(elementID);
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

				let occupantID: string | null = null;
				{
					const occupantIDElem = elem.getChild("occupant-id", "urn:xmpp:occupant-id:0");
					if(typeof occupantIDElem !== "undefined") {
						const maybeID = occupantIDElem.getAttr("id");
						if(typeof maybeID === "string") occupantID = maybeID;
					}
				}

				let timestamp: Date | null = timestampFromWrapper ?? null;

				const delayElem = elem.getChild("delay", "urn:xmpp:delay");
				if(typeof delayElem !== "undefined") {
					timestamp = new Date(delayElem.getAttr("stamp"));
				}

				const isNew = timestamp === null;

				timestamp ??= new Date();

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
							from: {jid: from, occupantID: occupantID === null ? undefined : occupantID},
						});

						ignore = true;
					}
				}

				if(isNew) {
					const mucElem = elem.getChild("x", "http://jabber.org/protocol/muc#user");
					if(typeof mucElem !== "undefined") {
						let reloadConfig = false;

						mucElem.getChildren("status").forEach(statusElem => {
							const code = statusElem.getAttr("code");
							if(code === "104") reloadConfig = true;
						});

						if(reloadConfig) {
							fetchAndStoreRoomDisco(client, room);
						}
					}
				}

				const reactionsElem = elem.getChild("reactions", "urn:xmpp:reactions:0");
				if(typeof reactionsElem !== "undefined") {
					const targetID = reactionsElem.getAttr("id");
					if(typeof targetID === "string") {
						const reactions = new Set(reactionsElem.getChildren("reaction").map(x => x.getText()));

						emit("messageReactionsChange", {
							reactions: {
								reactions,
								timestamp,
							},
							target: new StanzaID(
								StanzaIDType.Stanza,
								from.bare(),
								targetID,
							),
							room: from.bare(),
							from: {jid: from, occupantID: occupantID ?? undefined},
						});

						ignore = true;
					}
				}

				const content = getContentFromMessageElement(elem);

				if(content.length > 0 && !ignore) {
					const ids = [];
					if(archiveID !== null) {
						ids.push(new StanzaID(StanzaIDType.Stanza, room, archiveID));
					}
					if(typeof elementID === "string") {
						ids.push(new StanzaID(StanzaIDType.Element, from, elementID));
					}

					const replaceElem = elem.getChild("replace", "urn:xmpp:message-correct:0");
					if(typeof replaceElem !== "undefined") {
						const targetID = replaceElem.getAttr("id");
						if(typeof targetID === "string") {
							emit("messageEdit", {
								edit: {content, timestamp},
								target: new StanzaID(StanzaIDType.Element, from, targetID),
								room: from.bare(),
								from: {jid: from, occupantID: occupantID ?? undefined},
							});
						}
						else {
							console.warn("missing ID of message to replace");
						}
					}
					else {
						handleMessage({
							account: client.jid!.bare(),
							message: {
								room, // TODO is this correct for non-anonymous MUCs?
								from: from,
								occupantID,
								to: null,
								content,
								ids,
								localID: ids.length > 0 ? ids[0].toString() : xid(),
								timestamp,

								removal: null,
								editedAt: null,
								reactions: new Map(),
							},
							isNew,
						});

						const account = accountsSig.value.find(x => x.client === client);
						const roomInfo = account?.rooms.get(room.toString());

						if(typeof roomInfo !== "undefined") {
							const isMe = from.resource === roomInfo.connectedNick;

							upsertCounterpart(client, room, entry => {
								if(
									entry.lastMessageTimestamp === null ||
										entry.lastMessageTimestamp.getTime() < timestamp.getTime() ||
										entry.lastMessageTimestampForUnread === null ||
										entry.lastMessageTimestampForUnread.getTime() < timestamp.getTime()
								) {
									return {
										...entry,
										lastMessageTimestamp: (
											entry.lastMessageTimestamp === null ||
												entry.lastMessageTimestamp.getTime() < timestamp.getTime()
										) ?
											timestamp :
											entry.lastMessageTimestamp,
										lastMessageID: (
											entry.lastMessageTimestamp === null ||
												entry.lastMessageTimestamp.getTime() < timestamp.getTime()
										) ?
											archiveID :
											entry.lastMessageID,
										lastMessageTimestampForUnread: (archiveID === null || isMe) ?
											entry.lastMessageTimestampForUnread :
											timestamp,
										lastMessageIDForUnread: (archiveID === null || isMe) ?
											entry.lastMessageIDForUnread :
											archiveID,
									};
								}
								else return entry;
							});
						}
					}
				}

				outgoingListener?.resolve();
			}
		}
		else if(elem.getAttr("type") === "chat") {
			const account = getAccount(client);

			if(typeof from !== "undefined" && from.equals(account.jid)) {
				const carbonsElem = elem.getChild("sent", "urn:xmpp:carbons:2");
				if(typeof carbonsElem !== "undefined") {
					const forwardedElem = carbonsElem.getChild("forwarded", "urn:xmpp:forward:0");
					if(typeof forwardedElem !== "undefined") {
						const messageElem = forwardedElem.getChild("message", "jabber:client");
						if(typeof messageElem !== "undefined") {
							handleMessageStanza(client, messageElem);
						}
					}
				}
			}

			let archiveID = (
				idFromWrapper?.type === StanzaIDType.Stanza &&
					idFromWrapper.by !== null &&
					idFromWrapper.by.equals(client.jid!.bare())
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
				outgoingListener = outgoingMessages.get(elementID);
				outgoingMessages.delete(elementID);
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
						from: {jid: from},
					});

					ignore = true;
				}
			}

			let timestamp: Date | null = timestampFromWrapper ?? null;

			const delayElem = elem.getChild("delay", "urn:xmpp:delay");
			if(typeof delayElem !== "undefined") {
				timestamp = new Date(delayElem.getAttr("stamp"));
			}

			const isNew = timestamp === null;

			timestamp = timestamp ?? new Date();

			if(typeof from !== "undefined") {
				const reactionsElem = elem.getChild("reactions", "urn:xmpp:reactions:0");
				if(typeof reactionsElem !== "undefined") {
					const targetID = reactionsElem.getAttr("id");
					if(typeof targetID === "string") {
						const reactions = new Set(reactionsElem.getChildren("reaction").map(x => x.getText()));

						emit("messageReactionsChange", {
							reactions: {
								reactions,
								timestamp,
							},
							target: new StanzaID(
								StanzaIDType.Element,
								null,
								targetID,
							),
							room: null,
							from: {jid: from.bare()},
						});

						ignore = true;
					}
				}
			}

			const content = getContentFromMessageElement(elem);

			if(content.length > 0 && typeof from !== "undefined" && typeof to !== "undefined" && !ignore) {
				const replaceElem = elem.getChild("replace", "urn:xmpp:message-correct:0");
				if(typeof replaceElem !== "undefined") {
					const targetID = replaceElem.getAttr("id");
					if(typeof targetID === "string") {
						emit("messageEdit", {
							edit: {content, timestamp},
							target: new StanzaID(StanzaIDType.Element, from.bare(), targetID),
							room: null,
							from: {jid: from},
						});
					}
					else {
						console.warn("missing ID of message to replace");
					}
				}
				else {
					console.log("got a message", timestamp, archiveID);

					// Messages might be from me, should count against the recipient in that case
					const isMe = from.bare().equals(client.jid!.bare());
					const conversation = isMe ? to : from.bare();

					upsertCounterpart(client, conversation, entry => {
						if(
							entry.lastMessageTimestamp === null ||
								entry.lastMessageTimestamp.getTime() < timestamp.getTime() ||
								entry.lastMessageTimestampForUnread === null ||
								entry.lastMessageTimestampForUnread.getTime() < timestamp.getTime()
						) {
							return {
								...entry,
								lastMessageTimestamp: (
									entry.lastMessageTimestamp === null ||
										entry.lastMessageTimestamp.getTime() < timestamp.getTime()
								) ?
									timestamp :
									entry.lastMessageTimestamp,
								lastMessageID: (
									entry.lastMessageTimestamp === null ||
										entry.lastMessageTimestamp.getTime() < timestamp.getTime()
								) ?
									archiveID :
									entry.lastMessageID,
								lastMessageTimestampForUnread: (archiveID === null || isMe) ?
									entry.lastMessageTimestampForUnread :
									timestamp,
								lastMessageIDForUnread: (archiveID === null || isMe) ?
									entry.lastMessageIDForUnread :
									archiveID,
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
							occupantID: null,
							to,
							content,
							ids,
							localID: ids.length > 0 ? ids[0].toString() : xid(),
							timestamp,

							removal: null,
							editedAt: null,
							reactions: new Map(),
						},
						isNew,
					});
				}
			}
		}
		else {
			const mamResultElem = elem.getChild("result", "urn:xmpp:mam:2");
			if(typeof mamResultElem !== "undefined") {
				const idValue = mamResultElem.getAttr("id");

				let timestamp: Date | undefined = undefined;

				const forwardedElem = mamResultElem.getChild("forwarded", "urn:xmpp:forward:0");
				if(typeof forwardedElem !== "undefined") {
					const delayElem = forwardedElem.getChild("delay", "urn:xmpp:delay");
					if(typeof delayElem !== "undefined") {
						timestamp = new Date(delayElem.getAttr("stamp"));
					}

					const messageElem = forwardedElem.getChild("message", "jabber:client");
					if(typeof messageElem !== "undefined") {
						let id = undefined;
						if(typeof idValue === "string") {
							id = new StanzaID(
								StanzaIDType.Stanza,
								from ?? client.jid!.bare(),
								idValue,
							);
						}

						handleMessageStanza(client, messageElem, id, timestamp);
					}
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

	async function saveAvatarToCache(client: xmppClient.Client, contentB64: string, type: string) {
		const content = fromBase64(contentB64);

		const hash = await crypto.subtle.digest("SHA-1", content)
		const hashStr = toHex(new Uint8Array(hash));

		const blob = new Blob([content], {type});
		const url = URL.createObjectURL(blob);

		const account = getAccount(client);
		account.avatarStates.set(hashStr, LoadState.wrapValue(url));

		cacheSig.value.setItem(
			"avatarImages/" + encodeURIComponent(hashStr),
			JSON.stringify({contentB64, type} satisfies AvatarImageCacheEntry),
		);
	}

	function startRequestingAvatar(
		client: xmppClient.Client,
		target: JID,
		expected: Array<AvatarMetadata | string>,
	) {
		{
			const account = getAccount(client);

			for(const ref of expected) {
				const hash = typeof ref === "string" ? ref : ref.hash;

				const state = account.avatarStates.get(hash);
				if(typeof state !== "undefined") {
					console.log("Already loading this avatar");
					return;
				}

				account.avatarStates.set(hash, LoadState.loading);
			}
		}

		Promise.all(
			expected.map(ref => {
				return cacheSig.value.getItem(
					"avatarImages/" + encodeURIComponent(typeof ref === "string" ? ref : ref.hash)
				)
					.then(x => x === null ? null : (JSON.parse(x) as AvatarImageCacheEntry));
			}),
		)
			.then(async (cacheResults) => {
				if(!cacheResults.includes(null)) {
					// found all in cache

					console.log("got avatar from cache for", target);

					const account = getAccount(client);
					for(let i = 0; i < expected.length; i++) {
						const entry = cacheResults[i]!;
						const content = fromBase64(entry.contentB64);

						const blob = new Blob([content], {type: entry.type});
						const url = URL.createObjectURL(blob);

						const ref = expected[i];

						account.avatarStates.set(typeof ref === "string" ? ref : ref.hash, LoadState.wrapValue(url));
					}

					return;
				}

				console.log("missing avatar for", target, " - fetching now");

				try {
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

						calls.push(saveAvatarToCache(client, contentB64, type));
					}

					await Promise.all(calls);
				}
				catch(err) {
					console.log("fetching avatar via vCard failed, trying PEP", err);

					await Promise.all(
						expected.map(async (ref) => {
							if(typeof ref === "string") {
								console.log("Can't fetch avatar without type");
								return;
							}

							const result = await fetchPubsubItem(client, "urn:xmpp:avatar:data", ref.hash);
							const contentB64 = result.element.getChildText("data", "urn:xmpp:avatar:data");
							if(contentB64 !== null) {
								return saveAvatarToCache(client, contentB64, ref.type);
							}
						}),
					);
				}
			})
			.catch(err => {
				console.error(err);
			})
			.then(() => {
				const account = getAccount(client);
				for(const ref of expected) {
					const hash = typeof ref === "string" ? ref : ref.hash;

					const value = account.avatarStates.get(hash);
					if(typeof value === "undefined" || value.state !== "done") {
						account.avatarStates.set(
							hash,
							LoadState.wrapError(new Error("Didn't receive avatar image from request")),
						);
					}
				}
			});
	}

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

	async function fetchRoomConfig(accountJID: JID, roomJID: JID): Promise<RoomConfig> {
		const account = getAccount(accountJID);

		return account.client.iqCaller.get(
			xml("query", {xmlns: "http://jabber.org/protocol/muc#owner"}),
			roomJID.toString(),
		)
			.then((result): RoomConfig => {
				if(typeof result === "undefined") throw new Error("Missing result from MUC disco");

				const info: RoomConfig = {
					name: null,
					publicRoom: null,
					membersOnly: null,
				};

				result.getChildren("x", "jabber:x:data").forEach(x => {
					if(x.getAttr("type") === "form") {
						x.getChildren("field").forEach(fieldElem => {
							const key = fieldElem.getAttr("var");
							const values = fieldElem.getChildren("value").map(x => x.getText());

							if(key === "muc#roomconfig_roomname") {
								if(values.length === 1) info.name = values[0];
							}
							else if(key === "muc#roomconfig_publicroom") {
								if(values.length === 1) info.publicRoom = parseDataFormsBoolean(values[0]);
							}
							else if(key === "muc#roomconfig_membersonly") {
								if(values.length === 1) info.membersOnly = parseDataFormsBoolean(values[0]);
							}
						});
					}
				});

				return info;
			});
	}

	function fetchAndStoreRoomDisco(client: xmppClient.Client, roomJID: JID) {
		{
			const account = getAccount(client);
			const info = account.rooms.get(roomJID.toString());
			if(typeof info === "undefined") {
				console.warn("trying to fetch disco for unknown room");
				return;
			}

			if(info.infoState.state !== "done") {
				account.rooms.set(roomJID.toString(), {...info, infoState: LoadState.loading});
			}
		}

		fetchRoomDisco(client, roomJID)
			.then(info => {
				if(info.avatarHashes.length > 0) {
					startRequestingAvatar(client, roomJID, info.avatarHashes);
				}

				return info;
			})
			.then(LoadState.wrapValue, LoadState.wrapError)
			.then(newState => {
				const account = getAccount(client);
				const info = account.rooms.get(roomJID.toString());
				if(typeof info === "undefined") {
					return account;
				}

				account.rooms.set(roomJID.toString(), {...info, infoState: newState});
			});
	}

	function onClientElement(client: xmppClient.Client, elem: Element) {
		console.log("onClientElement", elem);

		if(elem.getName() === "presence" && elem.getNS() === "jabber:client") {
			const srcJID = parseJID(elem.getAttr("from"));

			const userInfo = elem.getChild("x", "http://jabber.org/protocol/muc#user");
			if(typeof userInfo !== "undefined") {
				const itemElem = userInfo.getChild("item");
				const role = itemElem?.getAttr("role");

				const statusElems = userInfo.getChildren("status");

				if(statusElems.length > 0) {
					// it's for this client

					const statuses: string[] = [];

					statusElems.forEach(statusElem => {
						statuses.push(statusElem.getAttr("code"));
					});

					const isMe = statuses.includes("110");

					const callback = newRooms.get(srcJID.bare().toString());
					newRooms.delete(srcJID.bare().toString());

					if(isMe) {
						if(role === "none") {
							callback?.reject(new Error("Somehow didn't join"));

							const account = getAccount(client);

							const oldInfo = account.rooms.get(srcJID.bare().toString());

							if(typeof oldInfo !== "undefined") {
								account.rooms.set(srcJID.bare().toString(), {
									...oldInfo,
									connected: false,
								});

								connectMUCFromBookmarks(client, srcJID.bare());
							}
						}
						else {
							callback?.resolve({statuses});

							let shouldFetchDisco = false;

							const account = getAccount(client);

							const oldInfo = account.rooms.get(srcJID.bare().toString());
							if(typeof oldInfo === "undefined") {
								console.log("Tried to update room missing in list");
							}
							else {
								if(!oldInfo.connected) shouldFetchDisco = true;

								if(oldInfo.connected && oldInfo.nick === srcJID.resource) {
									// already up to date
								}
								else {
									const newInfo = {
										...oldInfo,
										connected: true,
										nick: srcJID.resource,
									};
									account.rooms.set(srcJID.bare().toString(), newInfo);
									newInfo.internalMutable.lastSeen = new Date();
								}
							}

							if(shouldFetchDisco) fetchAndStoreRoomDisco(client, srcJID.bare());
						}
					}
					else {
						callback?.reject(new Error("Failed to join room"));
					}
				}

				batch(() => {
					const affiliation = itemElem?.getAttr("affiliation");
					if(typeof affiliation === "string") {
						upsertCounterpart(client, srcJID, current => ({
							...current,
							affiliation,
						}));
					}

					if(typeof role === "string") {
						upsertCounterpart(client, srcJID, current => ({
							...current,
							role,
						}));
					}

					const occupantIDElem = elem.getChild("occupant-id", "urn:xmpp:occupant-id:0");
					if(typeof occupantIDElem !== "undefined") {
						const occupantID = occupantIDElem.getAttr("id");
						if(typeof occupantID === "string") {
							upsertCounterpart(client, srcJID, current => ({
								...current,
								occupantID,
							}));
						}
					}
				});
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
							(
								errorElem.getAttr("by") === roomJID.toString() ||
									errorElem.getAttr("by") === roomJID.domain ||
									typeof errorElem.getAttr("by") === "undefined"
							)
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

							const account = getAccount(client);
							const entry = account.rooms.get(roomJID.toString());

							if(typeof entry !== "undefined") {
								account.rooms.set(roomJID.toString(), {
									...entry,
									error,
									connected: false,
								});

								setTimeout(() => {
									const entryNow = account.rooms.get(roomJID.toString());
									if(typeof entryNow !== "undefined" && !entryNow.connected && !entryNow.stopped) {
										connectMUCFromBookmarks(client, roomJID);
									}
								}, ROOM_RETRY_DELAY);
							}

							const callback = newRooms.get(roomJID.toString());

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
				upsertCounterpart(client, contact, current => ({...current, avatars: avatarHashes}));
			}

			if(typeof avatarHashes !== "undefined" && avatarHashes.length > 0) {
				startRequestingAvatar(client, contact, avatarHashes);
			}
		}
		else if(elem.getName() === "message") {
			handleMessageStanza(client, elem);
		}
	}

	function loadAccounts() {
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
							counterparts: new SignalMap(),
							rooms: new SignalMap(),
							avatarStates: new SignalMap(),
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
	}

	function pingRoom(accountJID: JID, roomJID: JID) {
		const account = getAccount(accountJID);
		const room = account.rooms.get(roomJID.toString());

		if(typeof room !== "undefined" && room.connected && room.connectedNick !== null) {
			account.client.iqCaller.get(
				xml("ping", "urn:xmpp:ping"),
				new JID(room.jid.local, room.jid.domain, room.connectedNick).toString(),
			)
				.then(() => {
					room.internalMutable.lastSeen = new Date();
				}, () => {
					const currentEntry = account.rooms.get(room.jid.toString());
					if(typeof currentEntry !== "undefined") {
						account.rooms.set(room.jid.toString(), {...currentEntry, connected: false});
						connectMUCFromBookmarks(account.client, roomJID);
					}
				});
		}
	}

	const listeners: {
		[K in keyof AppEventMap]: Set<(evt: AppEventMap[K]) => void>;
	} = {
		message: new Set(),
		messageEdit: new Set(),
		messageReactionsChange: new Set(),
		messageRemove: new Set(),
	};

	function addEventListener<K extends keyof AppEventMap>(event: K, listener: (evt: AppEventMap[K]) => void) {
		listeners[event].add(listener);
	}

	function removeEventListener<K extends keyof AppEventMap>(event: K, listener: (evt: AppEventMap[K]) => void) {
		listeners[event].delete(listener);
	}

	function emit<K extends keyof AppEventMap>(eventType: K, event: AppEventMap[K]) {
		listeners[eventType].forEach(listener => {
			try {
				listener(event);
			}
			catch(ex) {
				console.error(ex);
			}
		});
	}

	function shouldNotifyForMessage(evt: Omit<MessageEvent, "shouldNotify">) {
		const category = evt.message.room === null ?
			NotificationCategory.Direct :
			NotificationCategory.Room;

		const baseLevel = notificationsSettingsSig.value[category] ?? DEFAULT_NOTIFICATIONS_SETTINGS[category];

		const account = accountsSig.value.find(x => x.jid.equals(evt.account));
		if(typeof account === "undefined") return false;

		if(!evt.isNew) return false;

		if(evt.message.room === null) {
			if(evt.message.from.equals(evt.account)) return false;

			return baseLevel !== NotificationLevel.Never;
		}
		else {
			const room = account.rooms.get(evt.message.room.toString());
			if(typeof room === "undefined") return false;

			const level = room.notificationLevel ?? baseLevel;

			if(level === NotificationLevel.Always) {
				return true;
			}
			else {
				// TODO implement mention parsing
				return false;
			}
		}
	}

	function handleMessage(evt: Omit<MessageEvent, "shouldNotify">) {
		emit("message", {...evt, shouldNotify: shouldNotifyForMessage(evt)});
	}

	async function requestArchive(
		accountJID: JID,
		entity: JID,
		params: {with?: JID},
		before?: string,
		options: {max?: number} = {},
	) {
		const account = getAccount(accountJID);

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
					xml("flip-page"),
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
	}

	async function sendMessageToCounterpart(
		accountJID: JID,
		targetJID: JID,
		message: {body: string},
		options: {replaces?: string} = {},
	) {
		const localID = xid();

		const account = getAccount(accountJID);

		const contentResult = convertMarkdownForSend(message.body);

		await account.client.send(
			xml(
				"message",
				{id: localID, to: targetJID.toString(), type: "chat"},
				...contentResult.elements,
				...(
					typeof options.replaces === "undefined" ?
						[] :
						[xml(
							"replace",
							{xmlns: "urn:xmpp:message-correct:0", id: options.replaces},
						)]
				),
			),
		);

		if(typeof options.replaces === "undefined") {
			handleMessage({
				account: accountJID,
				message: {
					room: null,
					from: accountJID,
					occupantID: null,
					to: targetJID,
					content: contentResult.content,
					ids: [
						new StanzaID(StanzaIDType.Element, accountJID, localID),
					],
					localID,
					timestamp: new Date(),

					removal: null,
					editedAt: null,
					reactions: new Map(),
				},
				isNew: true,
			});

			// Non-groupchat messages don't get reflected, so we don't know the stanza ID
			// Make an archive request to get the latest message
			// (which may or may not be this one, but fine for the purpose of displayed sync)
			requestArchive(account.jid, account.jid, {with: targetJID}, undefined, {max: 1});
		}
		else {
			emit("messageEdit", {
				edit: {
					content: contentResult.content,
					timestamp: new Date(),
				},
				target: new StanzaID(StanzaIDType.Element, accountJID, options.replaces),
				room: null,
				from: {jid: accountJID},
			});
		}
	}

	async function sendMessageToRoom(
		accountJID: JID,
		roomJID: JID,
		message: {body: string},
		options: {replaces?: string} = {},
	) {
		const id = xid();

		const account = getAccount(accountJID);

		const reflectDefer = Promise.withResolvers<void>();

		outgoingMessages.set(id, reflectDefer);

		const contentResult = convertMarkdownForSend(message.body);

		await account.client.send(
			xml(
				"message",
				{id, to: roomJID.toString(), type: "groupchat"},
				...contentResult.elements,
				...(
					typeof options.replaces === "undefined" ?
						[] :
						[xml(
							"replace",
							{xmlns: "urn:xmpp:message-correct:0", id: options.replaces},
						)]
				),
			),
		);

		await reflectDefer.promise;
	}

	async function retractMessageToCounterpart(accountJID: JID, targetJID: JID, messageID: string) {
		const account = getAccount(accountJID);

		await account.client.send(
			xml(
				"message",
				{id: xid(), to: targetJID.toString(), type: "chat"},
				xml(
					"retract",
					{xmlns: "urn:xmpp:message-retract:1", id: messageID},
				),
				xml(
					"fallback",
					{xmlns: "urn:xmpp:fallback:0", for: "urn:xmpp:message-retract:1"},
				),
				xml(
					"body",
					{},
					"/me retracted a previous message, but it's unsupported by your client.",
				),
				xml(
					"store",
					{xmlns: "urn:xmpp:hints"},
				),
			),
		);

		emit("messageRemove", {
			removal: {type: "retract"},
			target: new StanzaID(
				StanzaIDType.Element,
				accountJID,
				messageID,
			),
			room: null,
			from: {jid: accountJID},
		});
	}

	async function retractMessageToRoom(accountJID: JID, roomJID: JID, messageID: string) {
		const id = xid();

		const account = getAccount(accountJID);

		const reflectDefer = Promise.withResolvers<void>();

		outgoingMessages.set(id, reflectDefer);

		await account.client.send(
			xml(
				"message",
				{id, to: roomJID.toString(), type: "groupchat"},
				xml(
					"retract",
					{xmlns: "urn:xmpp:message-retract:1", id: messageID},
				),
				xml(
					"fallback",
					{xmlns: "urn:xmpp:fallback:0", for: "urn:xmpp:message-retract:1"},
				),
				xml(
					"body",
					{},
					"/me retracted a previous message, but it's unsupported by your client.",
				),
				xml(
					"store",
					{xmlns: "urn:xmpp:hints"},
				),
			),
		);

		await reflectDefer.promise;
	}

	async function sendMessageReactionsToRoom(accountJID: JID, roomJID: JID, messageID: string, reactions: string[]) {
		const id = xid();

		const account = getAccount(accountJID);

		const reflectDefer = Promise.withResolvers<void>();

		outgoingMessages.set(id, reflectDefer);

		// Some clients send a fallback body, but the spec doesn't seem to expect that
		// If we were to, it would probably be similar to replies

		await account.client.send(
			xml(
				"message",
				{id, to: roomJID.toString(), type: "groupchat"},
				xml(
					"reactions",
					{xmlns: "urn:xmpp:reactions:0", id: messageID},
					...reactions.map(value => {
						return xml("reaction", {}, value);
					}),
				),
				xml(
					"store",
					{xmlns: "urn:xmpp:hints"},
				),
			),
		);

		await reflectDefer.promise;
	}

	async function sendMessageReactionsToCounterpart(
		accountJID: JID,
		targetJID: JID,
		messageID: string,
		reactions: string[],
	) {
		const account = getAccount(accountJID);

		await account.client.send(
			xml(
				"message",
				{id: xid(), to: targetJID.toString(), type: "chat"},
				xml(
					"reactions",
					{xmlns: "urn:xmpp:reactions:0", id: messageID},
					...reactions.map(value => {
						return xml("reaction", {}, value);
					}),
				),
				xml(
					"store",
					{xmlns: "urn:xmpp:hints"},
				),
			),
		);

		emit("messageReactionsChange", {
			reactions: {
				reactions: new Set(reactions),
				timestamp: new Date(),
			},
			room: null,
			target: new StanzaID(
				StanzaIDType.Element,
				null,
				messageID,
			),
			from: {jid: accountJID},
		});
	}

	function markCounterpartAsVisible(accountJID: JID, target: JID) {
		upsertCounterpart(accountJID, target, entry => {
			if(entry.overrideVisibleTimestamp !== null || entry.lastMessageTimestamp !== null) {
				return entry;
			}

			return {...entry, overrideVisibleTimestamp: new Date()};
		});
	}

	function acceptFriendRequest(accountJID: JID, target: JID) {
		const account = getAccount(accountJID);

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
	}

	function rejectFriendRequest(accountJID: JID, target: JID) {
		{
			const account = getAccount(accountJID);

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
	}

	async function removeFriend(accountJID: JID, target: JID) {
		{
			const account = getAccount(accountJID);

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

		{
			const account = getAccount(accountJID);
			const entry = account.counterparts.get(target.toString());

			if(typeof entry !== "undefined") {
				account.counterparts.set(
					target.toString(),
					{
						...entry,
						rosterEntry: null,
					},
				);
			}
		}
	}

	function sendFriendRequest(accountJID: JID, target: JID) {
		{
			const account = getAccount(accountJID);

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
	}

	async function fetchRoomInfo(accountJID: JID, roomJID: JID) {
		const account = getAccount(accountJID);

		return fetchRoomDisco(account.client, roomJID);
	}

	function setComposingToCounterpart(accountJID: JID, target: JID, composing: boolean) {
		{
			const account = getAccount(accountJID);

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
	}

	function setComposingToRoom(accountJID: JID, roomJID: JID, composing: boolean) {
		const account = getAccount(accountJID);

		const room = account.rooms.get(roomJID.toString());
		if(room?.internalMutable.lastReportedComposing === composing) return;

		account.client.send(
			xml(
				"message",
				{type: "groupchat", to: roomJID.toString()},
				composing ?
					xml("composing", {xmlns: "http://jabber.org/protocol/chatstates"}) :
					xml("active", {xmlns: "http://jabber.org/protocol/chatstates"})
			),
		);

		if(typeof room === "undefined") {
			console.warn("Attempting to send composing state to unknown room");
		}
		else {
			room.internalMutable.lastReportedComposing = composing;
		}
	}

	async function joinRoom(accountJID: JID, room: JID, nick?: string) {
		const account = getAccount(accountJID);

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

			const connectNick = nick ?? accountJID.local;

			{
				const account = getAccount(accountJID);
				account.rooms.set(room.toString(), {
					jid: room,
					nick: nick ?? null,

					extensionsContent: [],
					rank: DEFAULT_RANK,
					notificationLevel: null,

					connected: false,
					connectedNick: connectNick,
					stopped: false,
					error: null,
					infoState: LoadState.loading,

					internalMutable: {
						lastReportedComposing: false,
						lastSeen: new Date(),
					},
				});
			}

			try {
				const defer = Promise.withResolvers<RoomJoinCallbackInfo>();

				newRooms.set(room.toString(), defer);

				connectMUC(account.client, room, connectNick);

				await defer.promise;
			}
			catch(ex) {
				const account = getAccount(accountJID);
				account.rooms.delete(room.toString());

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
	}

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

	async function leaveRoom(accountJID: JID, roomJID: JID) {
		{
			const account = getAccount(accountJID);

			const room = account.rooms.get(roomJID.toString());
			if(typeof room === "undefined") return;

			account.rooms.set(roomJID.toString(), {
				...room,
				stopped: true,
			});

			disconnectRoom(account, room);

			await retractPubsubItem(account.client, "urn:xmpp:bookmarks:1", roomJID.toString(), true);
		}

		getAccount(accountJID).rooms.delete(roomJID.toString());
	}

	async function createRoom(accountJID: JID, room: JID, params: RoomCreateParams) {
		if(room.local === "") throw new Error("Room ID cannot be empty");

		const realParams = {
			"muc#roomconfig_membersonly": params.membersOnly,
			"muc#roomconfig_persistentroom": params.persistent,
			"muc#roomconfig_publicroom": params.publicRoom,
			"muc#roomconfig_roomname": params.name,
		};

		const account = getAccount(accountJID);

		if(account.rooms.has(room.toString())) throw new Error("A room by that JID already exists");

		const nick = accountJID.local;

		let joinInfo;

		// Join room
		{
			const defer = Promise.withResolvers<RoomJoinCallbackInfo>();
			newRooms.set(room.toString(), defer);

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
	}

	async function changeRoomConfig(accountJID: JID, room: JID, params: RoomEditParams) {
		const realParams: Record<string, string> = {};

		if(typeof params.name !== "undefined") realParams["muc#roomconfig_roomname"] = params.name;
		if(typeof params.publicRoom !== "undefined") {
			realParams["muc#roomconfig_publicroom"] = params.publicRoom.toString();
		}
		if(typeof params.membersOnly !== "undefined") {
			realParams["muc#roomconfig_membersonly"] = params.membersOnly.toString();
		}

		const account = getAccount(accountJID);

		const formResult = await account.client.iqCaller.get(
			xml(
				"query",
				{xmlns: "http://jabber.org/protocol/muc#owner"},
			),
			room.toString(),
		);

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

	async function setRoomAvatar(accountJID: JID, roomJID: JID, value: ImageInfo) {
		const account = getAccount(accountJID);

		const existingVCardQuery = account.client.iqCaller.get(
			xml("vCard", "vcard-temp"),
			roomJID.toString(),
		)
			.then(async result => {
				if(typeof result === "undefined") throw new Error("Missing result from vcard query");
				return result;
			}, err => {
				if(err instanceof StanzaError && err.condition === "item-not-found") {
					return xml("vCard", "vcard-temp");
				}
				else throw err;
			});

		const content = await value.content.bytes();
		const hash = await crypto.subtle.digest("SHA-1", content);
		const hashStr = toHex(new Uint8Array(hash));

		const contentB64 = toBase64(content);

		// Prefill local cache
		await cacheSig.value.setItem(
			"avatarImages/" + encodeURIComponent(hashStr),
			JSON.stringify({contentB64, type: "image/png"} satisfies AvatarImageCacheEntry),
		);

		const vCard = await existingVCardQuery;
		vCard.remove("PHOTO");
		vCard.append(
			xml(
				"PHOTO",
				{},
				xml("TYPE", {}, "image/png"),
				xml("BINVAL", {}, contentB64),
			),
		);

		await account.client.iqCaller.set(
			vCard,
			roomJID.toString(),
		);

		fetchAndStoreRoomDisco(account.client, roomJID);
	}

	async function submitDisplayedUpdateInner(accountJID: JID, targetJID: JID, lastReadMessageID: string, isRoom: boolean) {
		const account = getAccount(accountJID);

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
	}

	const currentDisplayedUpdates = new Map<string, string>();

	function submitDisplayedUpdate(accountJID: JID, targetJID: JID, lastReadMessageID: string, isRoom: boolean) {
		const key = encodeURIComponent(accountJID.toString()) + "/" + encodeURIComponent(targetJID.toString());
		const running = currentDisplayedUpdates.has(key);
		currentDisplayedUpdates.set(key, lastReadMessageID);

		if(running) {
			// Will submit after current run finishes
			return;
		}

		function task(value: string) {
			submitDisplayedUpdateInner(accountJID, targetJID, value, isRoom)
				.catch(console.error)
				.then(() => {
					if(currentDisplayedUpdates.get(key) !== value) {
						task(currentDisplayedUpdates.get(key)!);
					}
					else {
						currentDisplayedUpdates.delete(key);
					}
				});
		}

		task(lastReadMessageID);
	}

	function markCounterpartAsRead(accountJID: JID, targetJID: JID, lastReadMessageID: string, isRoom: boolean) {
		upsertCounterpart(accountJID, targetJID, current => ({
			...current,
			lastReadMessageID,
		}));

		submitDisplayedUpdate(accountJID, targetJID, lastReadMessageID, isRoom);
	}

	async function setNick(accountJID: JID, value: string) {
		const account = getAccount(accountJID);

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
	}

	async function setAvatar(accountJID: JID, value: ImageInfo) {
		const account = getAccount(accountJID);

		const content = await value.content.bytes();
		const hash = await crypto.subtle.digest("SHA-1", content);
		const hashStr = toHex(new Uint8Array(hash));

		const contentB64 = toBase64(content);

		// Prefill local cache
		await cacheSig.value.setItem(
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
	}

	async function setRoomRank(accountJID: JID, roomJID: JID, newRank: string) {
		{
			const account = getAccount(accountJID);

			const room = account.rooms.get(roomJID.toString());
			if(typeof room === "undefined") throw new Error("Unknown room");

			await publishRoomBookmarkExtension(
				account.client,
				room,
				xml(
					"rank",
					"http://deepish.vpzom.click/ns/rank",
					newRank,
				),
			);
		}

		{
			const account = getAccount(accountJID);
			const entry = account.rooms.get(roomJID.toString());

			if(typeof entry !== "undefined") {
				account.rooms.set(roomJID.toString(), {
					...entry,
					rank: newRank,
				});
			}
		}
	}

	async function reorderRoom(accountJID: JID, roomJID: JID, to: {before: JID | null; after: JID | null}) {
		async function task() {
			const account = accountsSig.value.find(x => x.jid.equals(accountJID));
			if(typeof account === "undefined") throw new Error("No such account");

			const before = to.before === null ?
				null :
				account.rooms.get(to.before.toString());
			if(typeof before === "undefined") throw new Error("Unknown anchor room");

			const after = to.after === null ?
				null :
				account.rooms.get(to.after.toString());
			if(typeof after === "undefined") throw new Error("Unknown anchor room");

			if(before === null || after === null || before.rank !== after.rank) {
				const newRank = genRankBetween(
					after === null ? null : after.rank,
					before === null ? null : before.rank,
				);

				await setRoomRank(accountJID, roomJID, newRank);
			}
			else {
				// Too close, move up after anchor first

				const roomsList = Array.from(account.rooms.values());
				roomsList.sort((a, b) => compareRanks(a.rank, b.rank));

				const idx = roomsList.indexOf(after);

				await reorderRoom(
					accountJID,
					after.jid,
					{after: idx > 0 ? roomsList[idx - 1].jid : null, before: before.jid},
				);
				await task();
			}
		}

		await task();
	}

	async function setRoomNotificationLevel(accountJID: JID, roomJID: JID, level: NotificationLevel) {
		const account = accountsSig.value.find(x => x.jid.equals(accountJID));
		if(typeof account === "undefined") throw new Error("No such account");

		const room = account.rooms.get(roomJID.toString());
		if(typeof room === "undefined") throw new Error("Unknown room");

		const content = xml(NOTIFICATION_LEVEL_ELEMENT_MAP[level]);

		await publishRoomBookmarkExtension(
			account.client,
			room,
			xml(
				"notify",
				{xmlns: "urn:xmpp:notification-settings:1"},
				content,
			),
		);

		{
			const account = getAccount(accountJID);
			const entry = account.rooms.get(roomJID.toString());

			if(typeof entry !== "undefined") {
				account.rooms.set(roomJID.toString(), {
					...entry,
					notificationLevel: level,
				});
			}
		}
	}

	return {
		accountsSig,
		getAccount,

		addEventListener,
		removeEventListener,

		requestArchive,
		sendMessageToCounterpart,
		sendMessageToRoom,
		retractMessageToCounterpart,
		retractMessageToRoom,
		sendMessageReactionsToRoom,
		sendMessageReactionsToCounterpart,
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
		changeRoomConfig,
		setRoomAvatar,
		sendFriendRequest,
		fetchRoomInfo,
		fetchRoomConfig,
		setNick,
		setAvatar,
		reorderRoom,
		setRoomNotificationLevel,

		loadAccounts,
		pingRoom,
	};
}

function connectMUC(client: xmppClient.Client, roomJID: JID, nick: string) {
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

export function useAccountSig(): Signal<Account> {
	const connectionCtx = useConnectionContext();
	return useComputed(() => {
		const result = connectionCtx.accountsSig.value[0];
		if(typeof result === "undefined") throw new Error("Attempted to read account while not logged in");
		return result;
	});
}

export function messageRemovalIsAllowed(message: Message, evt: Pick<MessageRemovalEvent, "from" | "removal" | "room">) {
	if(evt.removal.type === "retract") {
		// Allow retractions for one's own messages

		if(evt.room === null) {
			return evt.from.jid.bare().equals(message.from.bare());
		}
		else {
			if(evt.from.jid.equals(message.from)) {
				// JID matches, but this is a MUC, so it could be a reused nick
				// Check occupant ID if available

				if(message.occupantID === null) return true;
				else return message.occupantID === evt.from.occupantID;
			}
			else return false;
		}

		return (evt.room === null ? evt.from.jid.bare() : evt.from.jid)
			.equals(evt.room === null ? message.from.bare() : message.from)
	}
	else {
		const _: never = evt.removal.type;
		console.warn("Unknown removal type");
		return false;
	}
}

export function messageEditIsAllowed(message: Message, evt: Pick<MessageEditEvent, "from" | "room">) {
	// Users can only edit their own messages

	if(evt.room === null) {
		return evt.from.jid.bare().equals(message.from.bare());
	}
	else {
		if(evt.from.jid.equals(message.from)) {
			// JID matches, but this is a MUC, so it could be a reused nick
			// Check occupant ID if available

			if(message.occupantID === null) return true;
			else return message.occupantID === evt.from.occupantID;
		}
		else return false;
	}

	return (evt.room === null ? evt.from.jid.bare() : evt.from.jid)
		.equals(evt.room === null ? message.from.bare() : message.from)
}

async function publishRoomBookmarkExtension(client: xmppClient.Client, room: Room, extension: Element) {
	await publishPubsubItem(
		client,
		"urn:xmpp:bookmarks:1",
		xml(
			"item",
			{id: room.jid.toString()},
			xml(
				"conference",
				{xmlns: "urn:xmpp:bookmarks:1", autojoin: "true"},
				...(
					room.nick === null ?
						[] :
						[xml("nick", {}, room.nick)]
				),
				xml(
					"extensions",
					{},
					...room.extensionsContent.filter(x => {
						return !(
							x instanceof Element &&
								x.name === extension.name &&
								x.getNS() === extension.getNS()
						);
					}),
					extension,
				),
			),
		),
		BOOKMARKS_PUBLISH_OPTIONS,
	);
}

function convertMarkdownForSend(src: string): {content: MessageContent[]; elements: Element[]} {
	const tokens = parseMarkdown(src);

	if(markdownHasAnyFormatting(tokens)) {
		const body = renderMarkdownTo0393(tokens);
		const xhtml = renderMarkdownToXHTML(tokens);

		return {
			content: [
				{type: "0393", content: body},
				{type: "xhtml", content: xhtml},
				{type: "markdown", content: src},
			],
			elements: [
				xml(
					"body",
					{},
					renderMarkdownTo0393(tokens),
				),
				xml(
					"html",
					"http://jabber.org/protocol/xhtml-im",
					renderMarkdownToXHTML(tokens),
				),
				xml(
					"content",
					{xmlns: "urn:xmpp:content", type: "text/markdown"},
					src,
				),
			],
		};
	}
	else {
		return {
			content: [
				{type: "plain", content: src},
			],
			elements: [
				xml("body", {}, src),
				xml("unstyled", "urn:xmpp:styling:0"),
			],
		};
	}
}

function getContentFromMessageElement(elem: Element): MessageContent[] {
	const content: MessageContent[] = [];

	const htmlElem = elem.getChild("html", "http://jabber.org/protocol/xhtml-im");
	if(typeof htmlElem !== "undefined") {
		const htmlBodyElem = htmlElem.getChild("body", "http://www.w3.org/1999/xhtml");
		if(typeof htmlBodyElem !== "undefined") {
			content.push({
				type: "xhtml",
				content: htmlBodyElem,
			});
		}
	}

	const contentElems = elem.getChildren("content", "urn:xmpp:content");

	const body = elem.getChildText("body");
	if(body !== null) {
		const unstyledElem = elem.getChild("unstyled", "urn:xmpp:styling:0");

		const typeHint = contentElems.find(x => x.children.length === 0);

		content.push({
			type: typeHint?.getAttr("type") === "text/markdown" ?
				"markdown" :
				(typeof unstyledElem === "undefined" ? "0393" : "plain"),
			content: body,
		});
	}

	contentElems.forEach(contentElem => {
		if(contentElem.children.length < 1) return;

		const value = contentElem.getText();
		if(contentElem.getAttr("type") === "text/markdown") {
			content.push({
				type: "markdown",
				content: value,
			});
		}
	});

	return content;
}

function parseDataFormsBoolean(src: string) {
	if(src === "1" || src === "true") return true;
	else if(src === "0" || src === "false") return false;

	throw new Error("Invalid boolean value");
}
