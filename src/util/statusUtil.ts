import { Counterpart, PresenceShowTypeExtended } from "./types";
import { TupleUnion } from "./typeUtil";

export function getShowTypeForCounterpart(
	counterpart: Counterpart,
	inRoom: boolean = false,
): null | PresenceShowTypeExtended {
	return getDisplayPresenceForCounterpart(counterpart, inRoom)?.show ?? null;
}

export function getDisplayPresenceForCounterpart(counterpart: Counterpart, inRoom: boolean = false) {
	if(!inRoom && counterpart.rosterEntry?.subscriptionTo !== true) return null;
	if(counterpart.presences === null) return null;

	let best: {show: PresenceShowTypeExtended; statusText: string | null} =
		{show: PresenceShowTypeExtended.Unavailable, statusText: null};

	counterpart.presences.forEach(entry => {
		const entryShow = entry.show ?? PresenceShowTypeExtended.Available;
		const result = showTypeOrder.indexOf(best.show) - showTypeOrder.indexOf(entryShow);

		if(result < 0 || (result === 0 && best.statusText === null && entry.statusText !== null)) {
			best = {
				show: entryShow,
				statusText: entry.statusText,
			};
		}
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
