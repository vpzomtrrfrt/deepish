import { JID } from "@xmpp/jid";

export enum PresenceShowType {
	Away = "away",
	Chat = "chat",
	DND = "dnd",
	XA = "xa",
}

enum PresenceShowTypeMore {
	Unavailable = "unavailable",
	Available = "available",
}

export type PresenceShowTypeExtended = PresenceShowType | PresenceShowTypeMore;
export const PresenceShowTypeExtended = {...PresenceShowType, ...PresenceShowTypeMore};

export interface Presence {
	show: PresenceShowType | null;
}

export interface RosterEntry {
	requestingSubscriptionTo: boolean;
	subscriptionTo: boolean;
	subscriptionFrom: boolean;
}

export interface AvatarMetadata {
	hash: string;
	type: string;
}

export interface Counterpart {
	jid: JID;
	rosterEntry: null | RosterEntry;
	requestingMySubscription: boolean;
	lastMessageID: string | null;
	lastMessageIDForUnread: string | null;
	lastMessageTimestamp: Date | null;
	lastMessageTimestampForUnread: Date | null;
	lastMessageTimestampFromInbox: Date | null;
	overrideVisibleTimestamp: Date | null;
	avatars: Array<AvatarMetadata | string>;
	presences: Map<string, Presence> | null;
	lastReportedComposing: boolean;
	composingFrom: boolean | null;
	nick: string | null;

	currentTune: TuneInfo | null;

	occupantID: string | null;
	affiliation: string | null;
	role: string | null;

	lastReadMessageID: string | null;
}

export interface TuneInfo {
	artist?: string;
	title?: string;
}

export enum NotificationCategory {
	Direct = "direct",
	Room = "room",
}

export enum RoomPublishing {
	Private = "private",
	Unlisted = "unlisted",
	Public = "public",
}
