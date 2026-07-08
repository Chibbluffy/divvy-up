// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { json, error } from '@sveltejs/kit';
import { getDivvyById, forkDivvy, generateId, generateToken } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const divvy = getDivvyById(params.divvyId);
	if (!divvy) throw error(404, 'Divvy not found');

	const body = await request.json().catch(() => null);
	const newName = body?.name?.trim() || `${divvy.name} (Copy)`;
	const copyImages = body?.copyImages === true;

	const newDivvy = forkDivvy(
		params.divvyId,
		generateId(),
		newName,
		generateToken(),
		generateToken(),
		generateToken(),
		copyImages
	);

	return json({ divvy: newDivvy });
};
