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

function requireEdit(divvyId: string, token: string) {
	const divvy = getDivvyById(divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	if (getAccessLevel(divvy, token) === 'view') throw error(403, 'Edit access required');
	return divvy;
}

export const GET: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('t') ?? '';
	const divvy = getDivvyById(params.divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	if (getAccessLevel(divvy, token) === 'view' && !url.searchParams.get('t')) throw error(403, 'Access required');
	const images = getEventImages(params.eventId);
	return json({ images });
};

export const POST: RequestHandler = async ({ params, url, request }) => {
	const token = url.searchParams.get('t') ?? '';
	requireEdit(params.divvyId, token);

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
