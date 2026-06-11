// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { json, error } from '@sveltejs/kit';
import { getDivvyById, getAccessLevel, getEvents, createEvent, generateId } from '$lib/server/db';
import type { RequestHandler } from './$types';

function requireOwner(divvyId: string, token: string) {
	const divvy = getDivvyById(divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	if (getAccessLevel(divvy, token) !== 'owner') throw error(403, 'Owner access required');
}

export const POST: RequestHandler = async ({ params, url, request }) => {
	const token = url.searchParams.get('t') ?? '';
	requireOwner(params.divvyId, token);

	const body = await request.json().catch(() => null);
	if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) throw error(400, 'Name is required');
	if (!['even_split', 'custom_amount'].includes(body?.type)) throw error(400, 'Invalid event type');

	const totalCost = typeof body.total_cost === 'number' ? body.total_cost : 0;
	const existing = getEvents(params.divvyId);

	const event = createEvent(
		generateId(),
		params.divvyId,
		body.name.trim(),
		body.type,
		totalCost,
		body.payer_person_id ?? null,
		typeof body.tax_percentage === 'number' ? body.tax_percentage : null,
		body.total_includes_tax === true,
		existing.length,
		body.parent_event_id ?? null
	);

	return json({ event });
};
