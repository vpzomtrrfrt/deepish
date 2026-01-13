export default function matchLocale(wanted: readonly string[], have: readonly string[]): string | null {
	// Might not be the best way but seems reasonable?

	for(const wantedLang of wanted) {
		const spl = wantedLang.split("-");
		for(let i = spl.length; i >= 1; i--) {
			const needle = spl.slice(0, i).join("-");
			if(have.includes(needle)) return needle;

			// If we don't have the exact language, look for any other variant of it
			for(const haveLang of have) {
				if(haveLang.startsWith(needle + "-")) return haveLang;
			}
		}
	}

	return null;
}
