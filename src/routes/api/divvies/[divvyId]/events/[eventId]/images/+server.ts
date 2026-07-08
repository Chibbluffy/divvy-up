// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { json, error } from '@sveltejs/kit';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import {
	getDivvyById, getAccessLevel, getEventImages, createEventImage, generateId, UPLOADS_DIR
} from '$lib/server/db';
import type { RequestHandler } from './$types';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function requireDivvy(divvyId: string, token: string) {
	const divvy = getDivvyById(divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	return { divvy, level: getAccessLevel(divvy, token) };
}

// Validate actual file content via magic bytes — don't trust browser-supplied MIME type
function validateMagicBytes(buf: Buffer): boolean {
	if (buf.length < 12) return false;
	// JPEG: FF D8 FF
	if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
	// PNG: 89 50 4E 47
	if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
	// WebP: RIFF....WEBP
	if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
		buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
	// HEIC/HEIF: ISO base media file — bytes 4-7 are 'ftyp'
	if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return true;
	return false;
}

export const GET: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('t') ?? '';
	requireDivvy(params.divvyId, token); // consistent with rest of app read access
	const images = getEventImages(params.eventId);
	return json({ images });
};

export const POST: RequestHandler = async ({ params, url, request }) => {
	const token = url.searchParams.get('t') ?? '';
	const { level } = requireDivvy(params.divvyId, token);
	if (level === 'view') throw error(403, 'Edit access required');

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		throw error(400, 'Invalid multipart body');
	}

	const file = formData.get('image');
	if (!(file instanceof File)) throw error(400, 'No image file provided');
	if (!ACCEPTED_TYPES.has(file.type)) throw error(415, 'Unsupported image type');
	if (file.size > MAX_BYTES) throw error(413, 'Image too large (max 20 MB)');

	const buffer = Buffer.from(await file.arrayBuffer());

	if (!validateMagicBytes(buffer)) throw error(415, 'File content does not match a supported image format');

	const compressed = await sharp(buffer)
		.resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 80 })
		.toBuffer();

	const filename = `${generateId()}.jpg`;
	writeFileSync(join(UPLOADS_DIR, filename), compressed);

	const existing = getEventImages(params.eventId);
	const image = createEventImage(generateId(), params.eventId, filename, existing.length);
	return json({ image }, { status: 201 });
};
