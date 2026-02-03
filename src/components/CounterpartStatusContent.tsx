import { IntlShape } from "react-intl";

import { presenceShowTypeNames } from "../util/langCommon";
import { getShowTypeForCounterpart } from "../util/statusUtil";
import { Counterpart, PresenceShowTypeExtended } from "../util/types";

export function getCounterpartStatusContent(info: Counterpart, intl: IntlShape, showType?: PresenceShowTypeExtended | null) {
	showType = typeof showType === "undefined" ? getShowTypeForCounterpart(info) : showType;

	if(info.currentTune !== null && typeof info.currentTune.artist !== "undefined") {
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
	else if(showType !== null) {
		return intl.formatMessage(presenceShowTypeNames[showType]);
	}
	
	return null;
}
