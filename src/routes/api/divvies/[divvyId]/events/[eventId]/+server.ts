// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { json, error } from '@sveltejs/kit';
import { getDivvyById, getAccessLevel, updateEvent, deleteEvent, duplicateEvent, generateId } from '$lib/server/db';
import type { RequestHandler } from './$types';

function requireOwner(divvyId: string, token: string) {
	const divvy = getDivvyById(divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	if (getAccessLevel(divvy, token) !== 'owner') throw error(403, 'Owner access required');
}

function requireEdit(divvyId: string, token: string) {
	const divvy = getDivvyById(divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	if (getAccessLevel(divvy, token) === 'view') throw error(403, 'Edit access required');
}

export const PATCH: RequestHandler = async ({ params, url, request }) => {
	const token = url.searchParams.get('t') ?? '';
	requireEdit(params.divvyId, token);

	const body = await request.json().catch(() => null);
	if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) throw error(400, 'Name is required');

	updateEvent(
		params.eventId,
		body.name.trim(),
		typeof body.total_cost === 'number' ? body.total_cost : 0,
		body.payer_person_id ?? null,
		typeof body.tax_percentage === 'number' ? body.tax_percentage : null,
		body.total_includes_tax === true
	);

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('t') ?? '';
	requireOwner(params.divvyId, token);

	deleteEvent(params.eventId);
	return json({ ok: true });
};

export const POST: RequestHandler = async ({ params, url, request }) => {
	const token = url.searchParams.get('t') ?? '';
	requireOwner(params.divvyId, token);

	const body = await request.json().catch(() => null);
	if (body?.action !== 'duplicate') throw error(400, 'Unknown action');

	const newName = body.name?.trim() || 'Copy';
	const parentEventId = typeof body.parent_event_id === 'string' ? body.parent_event_id : null;
	const event = duplicateEvent(params.eventId, generateId(), newName, parentEventId);
	return json({ event });
};
