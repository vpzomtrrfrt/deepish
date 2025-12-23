import { css, cx } from "@emotion/css";

import { PresenceShowType, PresenceShowTypeExtended } from "../util/types";

const styles = {
	statusIndicator: css({
		borderRadius: "50%",
	}),
};

const typeStyles: Record<PresenceShowTypeExtended, string> = {
	[PresenceShowType.Away]: css({
		backgroundColor: "#FFEB3B",
	}),
	[PresenceShowType.XA]: css({
		backgroundColor: "#FFC107",
	}),
	[PresenceShowType.DND]: css({
		backgroundColor: "#F44336",
	}),
	[PresenceShowType.Chat]: css({
		backgroundColor: "#03A9F4",
	}),
	[PresenceShowTypeExtended.Available]: css({
		backgroundColor: "#4CAF50",
	}),
	[PresenceShowTypeExtended.Unavailable]: css({
		backgroundColor: "#9E9E9E",
	}),
};

export default function StatusIndicator(props: {showType: PresenceShowTypeExtended; class?: string}) {
	return <div
		class={
			cx(
				styles.statusIndicator,
				typeStyles[props.showType],
				props.class,
			)
		}
	/>;
}
