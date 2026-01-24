import { defineMessage, MessageDescriptor } from "react-intl";

import { PresenceShowTypeExtended } from "./types";

export const msgActionAdd = defineMessage({defaultMessage: "Add"});
export const msgActionCreate = defineMessage({defaultMessage: "Create"});
export const msgActionDelete = defineMessage({defaultMessage: "Delete"});
export const msgActionSend = defineMessage({defaultMessage: "Send"});

export const msgCancel = defineMessage({
	defaultMessage: "Cancel",
	description: "Used on dialogs to abort a task",
});

export const msgClose = defineMessage({
	defaultMessage: "Close",
	description: "Dismiss a dialog",
});

export const msgJID = defineMessage({
	defaultMessage: "XMPP Address",
});
export const msgJIDShort = defineMessage({
	defaultMessage: "Address",
});

export const presenceShowTypeNames: Record<PresenceShowTypeExtended, MessageDescriptor> = {
	[PresenceShowTypeExtended.XA]: defineMessage({defaultMessage: "Extended Away"}),
	[PresenceShowTypeExtended.DND]: defineMessage({defaultMessage: "Do Not Disturb"}),
	[PresenceShowTypeExtended.Chat]: defineMessage({
		defaultMessage: "Open to Chat",
		description: "Status indicating user wants to chat",
	}),
	[PresenceShowTypeExtended.Away]: defineMessage({defaultMessage: "Away"}),
	[PresenceShowTypeExtended.Available]: defineMessage({defaultMessage: "Online", description: "Default user status"}),
	[PresenceShowTypeExtended.Unavailable]: defineMessage({
		defaultMessage: "Offline",
		description: "Status indicating user is not online",
	}),
};
