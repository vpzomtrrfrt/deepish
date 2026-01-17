export interface ConvertImageResult {
	content: Blob;
	width: number;
	height: number;
}

export default async function convertImage(src: File, options: {square?: boolean; maxSize?: number} = {}): Promise<ConvertImageResult> {
	const image = new Image();

	const loadQuery = new Promise((resolve, reject) => {
		image.addEventListener("load", resolve);
		image.addEventListener("error", reject);
	});
	image.src = URL.createObjectURL(src);
	try {
		await loadQuery;

		const largeSize = Math.max(image.naturalWidth, image.naturalHeight);
		const smallSize = Math.min(image.naturalWidth, image.naturalHeight);

		const scale = typeof options.maxSize === "undefined" ?
			1 :
			(
				options.square === true ?
					Math.min(1, options.maxSize / smallSize) :
					Math.min(1, options.maxSize / largeSize)
			);

		const canvas = new OffscreenCanvas(
			(
				options.square === true ?
					smallSize :
					image.naturalWidth
			) * scale,
			(
				options.square === true ?
					smallSize :
					image.naturalHeight
			) * scale,
		);
		const ctx = canvas.getContext("2d")!;
		ctx.drawImage(
			image,
			options.square === true ? -(image.naturalWidth - smallSize) * scale / 2 : 0,
			options.square === true ? -(image.naturalHeight - smallSize) * scale / 2 : 0,
			image.naturalWidth * scale,
			image.naturalHeight * scale,
		);

		const content = await canvas.convertToBlob();

		return {
			content,
			width: canvas.width,
			height: canvas.height,
		};
	}
	finally {
		URL.revokeObjectURL(image.src);
	}
}
