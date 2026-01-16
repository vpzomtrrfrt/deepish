import { Button as BaseButton, ButtonProps as BaseButtonProps } from "@base-ui/react/button";
import { css, cx } from "@emotion/css";

import { themeVars } from "../util/theme";
import unsignal from "../util/unsignal";

const styles = {
	button: css({
		padding: ".5rem .75rem",
		borderRadius: ".5rem",
		fontSize: "1rem",
		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: "transparent",

		transition: "background-color 300ms",

		cursor: "pointer",

		"&[data-disabled]": {
			opacity: 0.38,
		},
	}),
};

type ButtonTier = "primary" | "secondary";

const tierStyles: Record<ButtonTier, string> = {
	primary: css({
		backgroundColor: "#4356c0",
		color: themeVars.textLight,

		"&:hover": {
			backgroundColor: "#3949AB",
		},
	}),
	secondary: css({
		backgroundColor: themeVars.bg1,
		color: themeVars.textOn1,
		borderColor: themeVars.outline1,

		"&:hover": {
			backgroundColor: themeVars.bg1Hover,
		},
	}),
};

export default function Button(
	props: (
		({href: string}) |
			({href?: undefined})
	) & BaseButtonProps & {
		tier: ButtonTier,
	},
) {
	const className = cx(styles.button, tierStyles[props.tier], unsignal(props.class));

	if(typeof props.href === "undefined") {
		return <BaseButton focusableWhenDisabled {...props} className={className} />;
	}
	else {
		return <BaseButton focusableWhenDisabled nativeButton={false} render={<a />} {...props} className={className} />;
	}
}
