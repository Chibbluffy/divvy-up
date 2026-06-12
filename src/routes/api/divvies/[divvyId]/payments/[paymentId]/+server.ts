// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { json, error } from '@sveltejs/kit';
import { getDivvyById, getAccessLevel, deletePayment } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('t') ?? '';
	const divvy = getDivvyById(params.divvyId);
	if (!divvy) throw error(404, 'Divvy not found');
	const level = getAccessLevel(divvy, token);
	if (level !== 'owner' && level !== 'edit') throw error(403, 'Edit access required');

	deletePayment(params.paymentId);
	return json({ ok: true });
};
