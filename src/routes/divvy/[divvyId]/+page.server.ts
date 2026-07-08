// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import { error } from '@sveltejs/kit';
import { getDivvyById, getAccessLevel, getPeople, getEvents, getIntersections, getPayments, getImagesForDivvy } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const token = url.searchParams.get('t') ?? '';
	const divvy = getDivvyById(params.divvyId);

	if (!divvy) throw error(404, 'Divvy not found');

	const accessLevel = getAccessLevel(divvy, token);
	const people = getPeople(params.divvyId);
	const events = getEvents(params.divvyId);
	const intersections = getIntersections(params.divvyId);
	const payments = getPayments(params.divvyId);
	const eventImages = getImagesForDivvy(params.divvyId);

	const divvyData =
		accessLevel === 'owner'
			? divvy
			: { ...divvy, owner_token: '', edit_token: '', view_token: '' };

	return { divvy: divvyData, people, events, intersections, payments, accessLevel, token, eventImages };
};
