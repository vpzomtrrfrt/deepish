import { IntlShape } from "react-intl";

import { presenceShowTypeNames } from "../util/langCommon";
import { getDisplayPresenceForCounterpart } from "../util/statusUtil";
import { Counterpart, PresenceShowTypeExtended } from "../util/types";

export function getCounterpartStatusContent(info: Counterpart, intl: IntlShape, showType?: PresenceShowTypeExtended | null) {
	const displayPresence = typeof showType === "undefined" ?
		getDisplayPresenceForCounterpart(info) :
		(showType === null ? null : {show: showType, statusText: null});

	if(info.currentActivity !== null && info.currentActivity.text !== null) {
		return info.currentActivity.text;
	}
	else if(info.currentTune !== null && typeof info.currentTune.artist !== "undefined") {
		return intl.formatMessage({
			defaultMessage: "Listening to {name}",
		}, {
			name: <span>
				<em>{info.currentTune.artist}</em>
				{
					typeof info.currentTune.title !== "undefined" &&
						<>{" - "}<em>{info.currentTune.title}</em></>
				}
			</span>,
		});
	}
	else if(displayPresence !== null) {
		if(displayPresence.statusText !== null) return displayPresence.statusText;

		return intl.formatMessage(presenceShowTypeNames[displayPresence.show]);
	}
	
	return null;
}
