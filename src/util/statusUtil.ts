import { Counterpart, PresenceShowTypeExtended } from "./types";
import { TupleUnion } from "./typeUtil";

export function getShowTypeForCounterpart(counterpart: Counterpart, inRoom: boolean = false) {
	if(!inRoom && counterpart.rosterEntry?.subscriptionTo !== true) return null;
	if(counterpart.presences === null) return null;

	let best: PresenceShowTypeExtended = PresenceShowTypeExtended.Unavailable;
	counterpart.presences.forEach(entry => {
		best = showTypeMax(best, entry.show ?? PresenceShowTypeExtended.Available);
	});

	return best;
}

const showTypeOrder: TupleUnion<PresenceShowTypeExtended> = [
	PresenceShowTypeExtended.Unavailable,
	PresenceShowTypeExtended.DND,
	PresenceShowTypeExtended.XA,
	PresenceShowTypeExtended.Away,
	PresenceShowTypeExtended.Available,
	PresenceShowTypeExtended.Chat,
];

function showTypeMax(a: PresenceShowTypeExtended, b: PresenceShowTypeExtended) {
	const aIdx = showTypeOrder.indexOf(a);
	const bIdx = showTypeOrder.indexOf(b);

	if(aIdx < bIdx) return b;
	else return a;
}
