declare module "es-arraybuffer-base64/Uint8Array.fromBase64" {
	export default function fromBase64(src: string): Uint8Array<ArrayBuffer>;
}

declare module "es-arraybuffer-base64/Uint8Array.prototype.toBase64" {
	export default function toBase64(src: Uint8Array): string;
}

declare module "es-arraybuffer-base64/Uint8Array.prototype.toHex" {
	export default function toHex(src: Uint8Array): string;
}
