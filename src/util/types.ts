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
