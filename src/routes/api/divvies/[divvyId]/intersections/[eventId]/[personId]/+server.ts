// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { json, error } from '@sveltejs/kit';
import { getDivvyById, getAccessLevel, updateIntersectionPresence, updateIntersectionAmount, updateIntersectionPaid } from '$lib/server/db';
import type { RequestHandler } from './$types';

function requireEdit(divvyId: string, token: string) {
	const divvy = getDivvyById(divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	if (getAccessLevel(divvy, token) === 'view') throw error(403, 'Edit access required');
}

export const PATCH: RequestHandler = async ({ params, url, request }) => {
	const token = url.searchParams.get('t') ?? '';
	requireEdit(params.divvyId, token);

	const body = await request.json().catch(() => null);
	if (!body) throw error(400, 'Body required');

	const { eventId, personId } = params;

	if ('present' in body && typeof body.present === 'boolean') {
		updateIntersectionPresence(eventId, personId, body.present);
	} else if ('custom_amount' in body) {
		const amount =
			body.custom_amount === null || body.custom_amount === ''
				? null
				: typeof body.custom_amount === 'number'
					? body.custom_amount
					: parseFloat(body.custom_amount);
		updateIntersectionAmount(eventId, personId, isNaN(amount as number) ? null : (amount as number | null), body.tax_included === true);
	} else if ('paid_status' in body && ['paid', 'unpaid'].includes(body.paid_status)) {
		updateIntersectionPaid(eventId, personId, body.paid_status);
	} else {
		throw error(400, 'Invalid update payload');
	}

	return json({ ok: true });
};
