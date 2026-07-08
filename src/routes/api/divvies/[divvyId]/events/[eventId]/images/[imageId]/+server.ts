// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { error, json } from '@sveltejs/kit';
import { join } from 'node:path';
import { readFileSync, unlinkSync } from 'node:fs';
import { getDivvyById, getAccessLevel, getEventImageForDivvy, deleteEventImage, UPLOADS_DIR } from '$lib/server/db';
import type { RequestHandler } from './$types';

function requireDivvy(divvyId: string, token: string) {
	const divvy = getDivvyById(divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	return { divvy, level: getAccessLevel(divvy, token) };
}

export const GET: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('t') ?? '';
	requireDivvy(params.divvyId, token);

	// getEventImageForDivvy verifies image → event → divvy ownership in one query
	const img = getEventImageForDivvy(params.imageId, params.eventId, params.divvyId);
	if (!img) throw error(404, 'Image not found');

	let data: Buffer;
	try {
		data = readFileSync(join(UPLOADS_DIR, img.filename));
	} catch {
		throw error(404, 'Image file not found');
	}

	return new Response(new Uint8Array(data), {
		headers: {
			'Content-Type': 'image/jpeg',
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, max-age=86400'
		}
	});
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('t') ?? '';
	const { level } = requireDivvy(params.divvyId, token);
	if (level === 'view') throw error(403, 'Edit access required');

	const img = getEventImageForDivvy(params.imageId, params.eventId, params.divvyId);
	if (!img) throw error(404, 'Image not found');

	deleteEventImage(params.imageId);
	try { unlinkSync(join(UPLOADS_DIR, img.filename)); } catch { /* already gone */ }

	return json({ ok: true });
};
