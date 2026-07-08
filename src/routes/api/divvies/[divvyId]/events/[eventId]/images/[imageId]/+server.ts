// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { error } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { join } from 'node:path';
import { readFileSync, unlinkSync } from 'node:fs';
import { getDivvyById, getAccessLevel, getEventImage, deleteEventImage, UPLOADS_DIR } from '$lib/server/db';
import type { RequestHandler } from './$types';

function getAccess(divvyId: string, token: string) {
	const divvy = getDivvyById(divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	return getAccessLevel(divvy, token);
}

export const GET: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('t') ?? '';
	getAccess(params.divvyId, token);

	const img = getEventImage(params.imageId);
	if (!img || img.event_id !== params.eventId) throw error(404, 'Image not found');

	let data: Buffer;
	try {
		data = readFileSync(join(UPLOADS_DIR, img.filename));
	} catch {
		throw error(404, 'Image file not found');
	}

	return new Response(data, {
		headers: {
			'Content-Type': 'image/jpeg',
			'Cache-Control': 'private, max-age=86400'
		}
	});
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('t') ?? '';
	const level = getAccess(params.divvyId, token);
	if (level === 'view') throw error(403, 'Edit access required');

	const img = getEventImage(params.imageId);
	if (!img || img.event_id !== params.eventId) throw error(404, 'Image not found');

	const filename = deleteEventImage(params.imageId);
	if (filename) {
		try { unlinkSync(join(UPLOADS_DIR, filename)); } catch { /* already gone */ }
	}

	return json({ ok: true });
};
