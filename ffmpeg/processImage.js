import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { getMimeTypeFromArrayBuffer } from "./utils";

/**
 * Crop the image to a square shape using FFmpeg.
 *
 * @param {FFmpeg} ffmpeg - The FFmpeg instance.
 * @param {String} url - The URL or B64 string of the image to crop.
 * @return {Promise} A promise that resolves with the cropped image data.
 */
export function cropToSquare(/** @type {FFmpeg} */ ffmpeg, /** @type {String} */ url) {
	return new Promise(async (resolve, reject) => {
		const data = await fetchFile(url);
		const type = getMimeTypeFromArrayBuffer(data);
		if (type == null) return reject(new Error("Invalid image type"));

		const ext = type.replace("image/", "");
		await ffmpeg.writeFile(`avatarpreview.${ext}`, data);

		// run ffmpeg -i avatarpreview.png -vf "scale=236:236:force_original_aspect_ratio=increase,crop=236:236" avatarpreviewcropped.png
		await ffmpeg.exec(["-i", `avatarpreview.${ext}`, "-vf", "scale=236:236:force_original_aspect_ratio=increase,crop=236:236", `avatarpreviewcropped.${ext}`]);

		const res = await ffmpeg.readFile(`avatarpreviewcropped.${ext}`);
		const reader = new FileReader();
		reader.readAsDataURL(new Blob([new Uint8Array(res.buffer, res.byteOffset, res.length)], { type: type }));
		reader.onload = () => {
			resolve(reader.result);
		};
		reader.onerror = () => {
			reject(reader.error);
		};
	});
}

export function addDecoration(/** @type {FFmpeg} */ ffmpeg, /** @type {String} */ imageUrl, /** @type {String} */ decorationUrl) {
	return new Promise(async (resolve, reject) => {
		const avatarData = await fetchFile(imageUrl);
		const avatarType = getMimeTypeFromArrayBuffer(avatarData);
		if (avatarType == null) return reject(new Error("Invalid image type"));
		const ext = avatarType.replace("image/", "");
		await ffmpeg.writeFile(`avatarbase.${ext}`, avatarData);

		const decoData = await fetchFile(decorationUrl);
		console.log(decoData);
		await ffmpeg.writeFile("decoration.gif", decoData);

		// run ffmpeg -i avatarbase.png -i decoration.gif -filter_complex "[0][1]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2:format=auto,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" avatarwithdeco.gif
		const filter_complex = [
			// Start out with a transparent background
			"color=s=288x288:d=100,format=argb,colorchannelmixer=aa=0.0[background];",

			// Round the corners of the avatar image
			"[0]format=yuva444p,geq=lum='p(X,Y)':a='st(1,pow(min(W/2,H/2),2))+st(3,pow(X-(W/2),2)+pow(Y-(H/2),2));if(lte(ld(3),ld(1)),255,0)'[rounded avatar];",

			// Add base image to background
			"[background][rounded avatar]overlay=",
			"(main_w-overlay_w)/2:",
			"(main_h-overlay_h)/2:",
			"shortest=1:",
			"format=auto[avatar];",

			// Add deco overlay
			"[avatar][1]overlay=",
			"(main_w-overlay_w)/2:",
			"(main_h-overlay_h)/2:",
			"format=auto,",

			// Split into two images so the palette can be generated in one single command
			"split[s0][s1];",

			// Generate palette
			"[s0]palettegen[p];",
			"[s1][p]paletteuse"
		];
		await ffmpeg.exec(["-i", `avatarbase.${ext}`, "-i", "decoration.gif", "-filter_complex", filter_complex.join(""), "avatarwithdeco.gif"]);

		const res = await ffmpeg.readFile("avatarwithdeco.gif");
		const reader = new FileReader();
		reader.readAsDataURL(new Blob([new Uint8Array(res.buffer, res.byteOffset, res.length)], { type: "image/gif" }));
		reader.onload = () => {
			resolve(reader.result);
		};
		reader.onerror = () => {
			console.error(reader.error);
			reject(reader.error);
		};
	});
}