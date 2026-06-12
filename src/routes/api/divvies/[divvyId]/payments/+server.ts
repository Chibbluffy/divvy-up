// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { json, error } from '@sveltejs/kit';
import { getDivvyById, getAccessLevel, getPayments, createPayment, generateId } from '$lib/server/db';
import type { RequestHandler } from './$types';

function requireCanEdit(divvyId: string, token: string) {
	const divvy = getDivvyById(divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	const level = getAccessLevel(divvy, token);
	if (level !== 'owner' && level !== 'edit') throw error(403, 'Edit access required');
}

export const GET: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('t') ?? '';
	const divvy = getDivvyById(params.divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	getAccessLevel(divvy, token); // any access level can read
	return json({ payments: getPayments(params.divvyId) });
};

export const POST: RequestHandler = async ({ params, url, request }) => {
	const token = url.searchParams.get('t') ?? '';
	requireCanEdit(params.divvyId, token);

	const body = await request.json().catch(() => null);
	if (!body?.from_person_id || typeof body.from_person_id !== 'string') throw error(400, 'from_person_id is required');
	if (!body?.to_person_id || typeof body.to_person_id !== 'string') throw error(400, 'to_person_id is required');
	if (body.from_person_id === body.to_person_id) throw error(400, 'from and to must be different people');
	if (typeof body.amount !== 'number' || body.amount <= 0) throw error(400, 'amount must be a positive number');
	const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

	const payment = createPayment(generateId(), params.divvyId, body.from_person_id, body.to_person_id, body.amount, note);
	return json({ payment }, { status: 201 });
};
