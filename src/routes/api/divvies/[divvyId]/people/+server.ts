// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { json, error } from '@sveltejs/kit';
import { getDivvyById, getAccessLevel, getPeople, createPerson, reorderPeople, generateId } from '$lib/server/db';
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
	if (!body?.color || typeof body.color !== 'string') throw error(400, 'Color is required');

	const groupLeadPersonId =
		body.group_lead_person_id && typeof body.group_lead_person_id === 'string'
			? body.group_lead_person_id
			: null;
	const existing = getPeople(params.divvyId);
	const person = createPerson(generateId(), params.divvyId, body.name.trim(), body.color, existing.length, groupLeadPersonId);
	return json({ person });
};

export const PUT: RequestHandler = async ({ params, url, request }) => {
	const token = url.searchParams.get('t') ?? '';
	requireOwner(params.divvyId, token);

	const body = await request.json().catch(() => null);
	if (!Array.isArray(body?.order)) throw error(400, 'order array is required');

	reorderPeople(params.divvyId, body.order);
	return json({ ok: true });
};
