// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { json, error } from '@sveltejs/kit';
import { getDivvyById, getAccessLevel, updateDivvyName, getPeople, getEvents, getIntersections } from '$lib/server/db';
import type { RequestHandler } from './$types';

function requireAccess(divvyId: string, token: string, minLevel: 'owner' | 'edit' | 'view') {
	const divvy = getDivvyById(divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	const level = getAccessLevel(divvy, token);
	const levels = { view: 0, edit: 1, owner: 2 };
	if (levels[level] < levels[minLevel]) throw error(403, 'Insufficient access');
	return { divvy, level };
}

export const GET: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('t') ?? '';
	const { divvy, level } = requireAccess(params.divvyId, token, 'view');

	const people = getPeople(params.divvyId);
	const events = getEvents(params.divvyId);
	const intersections = getIntersections(params.divvyId);

	const divvyData = level === 'owner'
		? divvy
		: { ...divvy, owner_token: '', edit_token: '', view_token: '' };

	return json({ divvy: divvyData, people, events, intersections, accessLevel: level });
};

export const PATCH: RequestHandler = async ({ params, url, request }) => {
	const token = url.searchParams.get('t') ?? '';
	requireAccess(params.divvyId, token, 'owner');

	const body = await request.json().catch(() => null);
	if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) {
		throw error(400, 'Name is required');
	}

	updateDivvyName(params.divvyId, body.name.trim());
	return json({ ok: true });
};
