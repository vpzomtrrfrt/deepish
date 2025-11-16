import { Hsluv } from "hsluv";
import shajs from "sha.js";

/// Generate a color per XEP-0392
export function generateColorForID(src: string): string {
	const angle = generateAngle(src);

	const color = new Hsluv();
	color.hsluv_h = angle;
	color.hsluv_l = 70;
	color.hsluv_s = 100;

	color.hsluvToHex();
	return color.hex;
}

function generateAngle(src: string): number {
	const hash = shajs("sha1").update(src).digest();
	return hash.readUInt16LE(0) / 65536 * 360;
}
