// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { json, error } from '@sveltejs/kit';
import { createDivvy, generateId, generateToken } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) {
		throw error(400, 'Name is required');
	}

	const divvy = createDivvy(
		generateId(),
		body.name.trim(),
		generateToken(),
		generateToken(),
		generateToken()
	);

	return json({ divvy });
};
