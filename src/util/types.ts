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

export interface Counterpart {
	jid: JID;
	rosterEntry: null | RosterEntry;
	requestingMySubscription: boolean;
	lastMessageID: string | null;
	lastMessageTimestamp: Date | null;
	lastMessageTimestampFromInbox: Date | null;
	overrideVisibleTimestamp: Date | null;
	avatarHashes: string[];
	presences: Map<string, Presence> | null;
	lastReportedComposing: boolean;
	composingFrom: boolean | null;
	nick: string | null;
	occupantID: string | null;

	lastReadMessageID: string | null;
}
