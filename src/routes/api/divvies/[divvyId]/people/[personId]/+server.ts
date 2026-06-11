// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { json, error } from '@sveltejs/kit';
import { getDivvyById, getAccessLevel, updatePerson, deletePerson } from '$lib/server/db';
import type { RequestHandler } from './$types';

function requireOwner(divvyId: string, token: string) {
	const divvy = getDivvyById(divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	if (getAccessLevel(divvy, token) !== 'owner') throw error(403, 'Owner access required');
}

export const PATCH: RequestHandler = async ({ params, url, request }) => {
	const token = url.searchParams.get('t') ?? '';
	requireOwner(params.divvyId, token);

	const body = await request.json().catch(() => null);
	if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) throw error(400, 'Name is required');
	if (!body?.color) throw error(400, 'Color is required');

	updatePerson(params.personId, body.name.trim(), body.color);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('t') ?? '';
	requireOwner(params.divvyId, token);

	deletePerson(params.personId);
	return json({ ok: true });
};
