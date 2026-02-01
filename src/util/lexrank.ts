export const DEFAULT_RANK = "@";

const MIN_NORMAL_RANK_CHAR = "!";
const MAX_NORMAL_RANK_CHAR = "~";

export function compareRanks(a: string, b: string) {
	const aIter = a[Symbol.iterator]();
	const bIter = b[Symbol.iterator]();

	while(true) {
		const aResult = aIter.next();
		const bResult = bIter.next();

		if(aResult.done === true) {
			if(bResult.done === true) return 0;
			else return -1;
		}
		else if(bResult.done === true) {
			return 1;
		}
		else {
			const result = aResult.value.codePointAt(0)! - bResult.value.codePointAt(0)!;
			if(result !== 0) return result;
		}
	}
}

/**
	* Generate a rank relative to other ranks.
	* Passing `null` for one of the ranks will generate a rank relative only to the other specified rank.
*/
export function genRankBetween(a: string | null, b: string | null): string {
	if(a === null) {
		if(b === null) {
			throw new Error("Cannot generate relative rank with no anchors");
		}

		if(compareRanks(DEFAULT_RANK, b) < 0) {
			return genRankBetween(DEFAULT_RANK, b);
		}
		else if(compareRanks(MIN_NORMAL_RANK_CHAR, b) < 0) {
			return genRankBetween(MIN_NORMAL_RANK_CHAR, b);
		}
		else {
			// outside of standard range
			// do something somewhat reasonable

			const chars = Array.from(b);
			while(true) {
				const lastChar = chars.pop();
				if(typeof lastChar === "undefined") throw new Error("Got weird rank that we don't know how to handle");
				if(lastChar.codePointAt(0)! > MIN_NORMAL_RANK_CHAR.codePointAt(0)!) {
					chars.push(String.fromCharCode(lastChar.codePointAt(0)! - 1));
					chars.push(DEFAULT_RANK);
					break;
				}
			}

			return chars.join("");
		}
	}
	else if(b === null) {
		if(compareRanks(a, DEFAULT_RANK) > 0) {
			return genRankBetween(a, DEFAULT_RANK);
		}
		else if(compareRanks(a, MAX_NORMAL_RANK_CHAR) < 0) {
			return genRankBetween(a, MAX_NORMAL_RANK_CHAR);
		}
		else {
			// outside of standard range
			// do something somewhat reasonable

			const chars = Array.from(a);
			while(true) {
				const lastChar = chars.pop();
				if(typeof lastChar === "undefined") throw new Error("Got weird rank that we don't know how to handle");
				if(lastChar.codePointAt(0)! < MAX_NORMAL_RANK_CHAR.codePointAt(0)!) {
					chars.push(String.fromCharCode(lastChar.codePointAt(0)! + 1));
					chars.push(DEFAULT_RANK);
					break;
				}
			}

			return chars.join("");
		}
	}

	if(a === b) throw new Error("Cannot generate rank between identical values");

	const aIter = a[Symbol.iterator]();
	const bIter = b[Symbol.iterator]();

	let len = 0;

	while(true) {
		const aResult = aIter.next();
		const bResult = bIter.next();

		if(aResult.done === true) {
			if(bResult.done === true) {
				throw new Error("somehow got identical values after check");
			}
			else {
				if(bResult.value.codePointAt(0)! < MIN_NORMAL_RANK_CHAR.codePointAt(0)!) {
					if(bResult.value.codePointAt(0)! < 1) throw new Error("too close to move between");

					return b.substring(0, len) + String.fromCodePoint(bResult.value.codePointAt(0)! - 1);
				}
				else {
					return b.substring(0, len) + String.fromCodePoint(
						Math.floor((bResult.value.codePointAt(0)! + MIN_NORMAL_RANK_CHAR.codePointAt(0)!) / 2)
					);
				}

				len += bResult.value!.length;
			}
		}
		else if(bResult.done === true) {
			throw new Error("Anchor ranks are in wrong order");
		}
		else {
			const diff = aResult.value.codePointAt(0)! - bResult.value.codePointAt(0)!;
			if(diff === 0) {
				len += aResult.value.length;
			}
			else if(diff === -1) {
				return a + DEFAULT_RANK;
			}
			else if(diff > 0) {
				throw new Error("Anchor ranks are in wrong order");
			}
			else {
				return b.substring(0, len) + String.fromCodePoint(bResult.value.codePointAt(0)! + Math.ceil(diff / 2));
			}
		}
	}
}
