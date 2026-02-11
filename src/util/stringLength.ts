export default function stringLength(src: string) {
	let result = 0;

	for(const char of src) {
		result += char.length;
	}

	return result;
}

export function stringSubstring(src: string, start: number, end?: number) {
	if(typeof end !== "undefined" && end < start) throw new Error("substring range is backwards");

	let iCodepoint = 0;
	let i = 0;

	let realStart = null;

	for(const char of src) {
		if(iCodepoint === start) {
			realStart = i;
			if(typeof end === "undefined") break;
		}
		else if(iCodepoint === end) {
			return src.substring(realStart!, i);
		}

		i += char.length;
		iCodepoint += 1;
	}

	if(realStart === null) return "";
	return src.substring(realStart);
}
