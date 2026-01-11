import { JID } from "@xmpp/jid";

import { Counterpart } from "./types";

export function getNickForCounterpart(counterpart: Counterpart) {
	if(counterpart.nick !== null) return counterpart.nick;

	return getDefaultNickForJID(counterpart.jid);
}

export function maybeGetNickForCounterpart(jid: JID, counterpart: Counterpart | undefined) {
	if(typeof counterpart === "undefined") return getDefaultNickForJID(jid);
	else return getNickForCounterpart(counterpart);
}

function getDefaultNickForJID(jid: JID) {
	if(jid.resource !== "") return jid.resource;
	if(jid.local !== "") return jid.local;

	return jid.domain;
}
