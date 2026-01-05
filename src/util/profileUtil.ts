import { Counterpart } from "./types";

export function getNickForCounterpart(counterpart: Counterpart) {
	if(counterpart.jid.resource !== "") return counterpart.jid.resource;
	if(counterpart.jid.local !== "") return counterpart.jid.local;

	return counterpart.jid.domain;
}
