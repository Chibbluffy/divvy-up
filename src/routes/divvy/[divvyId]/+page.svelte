<!-- Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source. -->
<script lang="ts">
	import type { PageData } from './$types';
	import type { Person, Event, Intersection, AccessLevel } from '$lib/types';
	import DivvyGrid from '$lib/components/DivvyGrid.svelte';
	import PersonModal from '$lib/components/PersonModal.svelte';
	import EventModal from '$lib/components/EventModal.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';
	import SettlementPanel from '$lib/components/SettlementPanel.svelte';

	let { data }: { data: PageData } = $props();

	let divvy = $state(data.divvy);
	let people = $state<Person[]>(data.people);
	let events = $state<Event[]>(data.events);
	let intersections = $state<Intersection[]>(data.intersections);
	let accessLevel = $state<AccessLevel>(data.accessLevel);
	let token = data.token;

	// UI state
	let activeTab = $state<'edit' | 'payment' | 'settlement'>('edit');
	let transpose = $state(false);
	let showPersonModal = $state(false);
	let showEventModal = $state(false);
	let showShareModal = $state(false);
	let showMobileFilter = $state(false);
	let hiddenPeople = $state<Set<string>>(new Set());
	let hiddenEvents = $state<Set<string>>(new Set());
	let editingPerson = $state<Person | null>(null);
	let editingEvent = $state<Event | null>(null);
	let editingDivvyName = $state(false);
	let divvyNameDraft = $state(divvy.name);
	let darkMode = $state(false);

	const mode = $derived<'edit' | 'payment'>(activeTab === 'payment' ? 'payment' : 'edit');

	$effect(() => {
		darkMode = document.documentElement.classList.contains('dark');
	});

	function toggleDark() {
		darkMode = !darkMode;
		document.documentElement.classList.toggle('dark', darkMode);
		localStorage.setItem('divvyup-dark', String(darkMode));
	}

	const apiBase = `/api/divvies/${divvy.id}`;

	function q(path: string) {
		return `${path}?t=${token}`;
	}

	async function api(method: string, path: string, body?: unknown) {
		const res = await fetch(q(`${apiBase}${path}`), {
			method,
			headers: body ? { 'Content-Type': 'application/json' } : undefined,
			body: body ? JSON.stringify(body) : undefined
		});
		if (!res.ok) {
			const msg = await res.json().then((d) => d.message).catch(() => 'Request failed');
			throw new Error(msg);
		}
		return res.json();
	}

	// Divvy name
	async function saveDivvyName() {
		if (!divvyNameDraft.trim() || divvyNameDraft === divvy.name) {
			editingDivvyName = false;
			divvyNameDraft = divvy.name;
			return;
		}
		await api('PATCH', '', { name: divvyNameDraft.trim() });
		divvy = { ...divvy, name: divvyNameDraft.trim() };
		editingDivvyName = false;
	}

	// People
	async function addPerson(name: string, color: string) {
		const { person } = await api('POST', '/people', { name, color });
		people = [...people, person];
		for (const event of events) {
			intersections = [
				...intersections,
				{ id: `${event.id}:${person.id}`, event_id: event.id, person_id: person.id, present: false, custom_amount: null, tax_included: false, paid_status: 'unpaid' }
			];
		}
	}

	async function updatePerson(id: string, name: string, color: string) {
		await api('PATCH', `/people/${id}`, { name, color });
		people = people.map((p) => (p.id === id ? { ...p, name, color } : p));
	}

	async function deletePerson(id: string) {
		if (!confirm('Remove this person? Their data will be deleted.')) return;
		await api('DELETE', `/people/${id}`);
		people = people.filter((p) => p.id !== id);
		intersections = intersections.filter((i) => i.person_id !== id);
	}

	// Events
	function appendEventLocal(event: Event) {
		events = [...events, event];
		for (const person of people) {
			intersections = [
				...intersections,
				{ id: `${event.id}:${person.id}`, event_id: event.id, person_id: person.id, present: false, custom_amount: null, tax_included: false, paid_status: 'unpaid' }
			];
		}
	}

	async function addEvent(eventData: Partial<Event> & { subItemCount?: number; subItemNames?: string[]; subItemCosts?: number[] }) {
		const { subItemCount, subItemNames, subItemCosts, ...baseData } = eventData;

		if (subItemCount && subItemCount > 1 && subItemNames) {
			// Create a parent event first (with total cost = sum) then sub-events linked to it
			const parentRes = await api('POST', '/events', { ...baseData, total_cost: 0 });
			const parentEvent = parentRes.event;
			appendEventLocal(parentEvent);

			for (let i = 0; i < subItemCount; i++) {
				const cost = subItemCosts?.[i] ?? (parseFloat(String(baseData.total_cost ?? 0)) / subItemCount);
				const { event } = await api('POST', '/events', {
					...baseData,
					name: subItemNames[i],
					total_cost: cost,
					parent_event_id: parentEvent.id
				});
				appendEventLocal(event);
			}
		} else {
			const { event } = await api('POST', '/events', baseData);
			appendEventLocal(event);
		}
	}

	async function updateEvent(id: string, eventData: Partial<Event>) {
		await api('PATCH', `/events/${id}`, eventData);
		events = events.map((e) => (e.id === id ? { ...e, ...eventData } : e));
	}

	async function deleteEvent(id: string) {
		const ev = events.find(e => e.id === id);
		if (!ev) return;

		// Sub-item: offer to delete entire group
		if (ev.parent_event_id) {
			const parentId = ev.parent_event_id;
			const parent = events.find(e => e.id === parentId);
			const siblings = events.filter(e => e.parent_event_id === parentId);
			if (!confirm(`Delete the entire group "${parent?.name ?? 'group'}"? This removes all ${siblings.length} sub-items.`)) return;
			// Delete sub-items first, then parent
			await Promise.all(siblings.map(s => api('DELETE', `/events/${s.id}`)));
			await api('DELETE', `/events/${parentId}`);
			const toRemove = new Set([parentId, ...siblings.map(s => s.id)]);
			events = events.filter(e => !toRemove.has(e.id));
			intersections = intersections.filter(i => !toRemove.has(i.event_id));
			return;
		}

		// Parent event: delete whole group
		const children = events.filter(e => e.parent_event_id === id);
		if (children.length > 0) {
			if (!confirm(`Delete the entire group "${ev.name}"? This removes all ${children.length} sub-items.`)) return;
			await Promise.all(children.map(c => api('DELETE', `/events/${c.id}`)));
			await api('DELETE', `/events/${id}`);
			const toRemove = new Set([id, ...children.map(c => c.id)]);
			events = events.filter(e => !toRemove.has(e.id));
			intersections = intersections.filter(i => !toRemove.has(i.event_id));
			return;
		}

		// Standalone event
		if (!confirm('Delete this item? All data for it will be removed.')) return;
		await api('DELETE', `/events/${id}`);
		events = events.filter((e) => e.id !== id);
		intersections = intersections.filter((i) => i.event_id !== id);
	}

	async function duplicateEvent(id: string) {
		const source = events.find((e) => e.id === id);
		if (!source) return;

		// Determine the parent of the group (whether user clicked a child or a parent)
		const groupParentId = source.parent_event_id ?? (events.some(e => e.parent_event_id === id) ? id : null);

		if (groupParentId) {
			const parent = events.find(e => e.id === groupParentId);
			const children = events.filter(e => e.parent_event_id === groupParentId);
			if (!parent) return;

			// Duplicate the parent first (standalone, no parent_event_id)
			const { event: newParent } = await api('POST', `/events/${groupParentId}`, {
				action: 'duplicate',
				name: `${parent.name} (copy)`
			});
			events = [...events, newParent];
			for (const person of people) {
				intersections = [...intersections, {
					id: `${newParent.id}:${person.id}`, event_id: newParent.id, person_id: person.id,
					present: false, custom_amount: null, tax_included: false, paid_status: 'unpaid'
				}];
			}

			// Duplicate each child, linking to the new parent
			for (const child of children) {
				const { event: newChild } = await api('POST', `/events/${child.id}`, {
					action: 'duplicate',
					name: child.name,
					parent_event_id: newParent.id
				});
				events = [...events, newChild];
				for (const person of people) {
					const srcIx = intersections.find(i => i.event_id === child.id && i.person_id === person.id);
					const keepPresent = child.type === 'even_split' ? (srcIx?.present ?? false) : false;
					intersections = [...intersections, {
						id: `${newChild.id}:${person.id}`, event_id: newChild.id, person_id: person.id,
						present: keepPresent, custom_amount: null, tax_included: false, paid_status: 'unpaid'
					}];
				}
			}
			return;
		}

		// Standalone event
		const { event } = await api('POST', `/events/${id}`, { action: 'duplicate', name: `${source.name} (copy)` });
		events = [...events, event];
		for (const person of people) {
			const srcIx = intersections.find((i) => i.event_id === id && i.person_id === person.id);
			const keepPresent = source.type === 'even_split' ? (srcIx?.present ?? false) : false;
			intersections = [
				...intersections,
				{ id: `${event.id}:${person.id}`, event_id: event.id, person_id: person.id, present: keepPresent, custom_amount: null, tax_included: false, paid_status: 'unpaid' }
			];
		}
	}

	// Intersections
	async function togglePresence(eventId: string, personId: string) {
		const ix = intersections.find((i) => i.event_id === eventId && i.person_id === personId);
		const newPresent = !ix?.present;
		intersections = intersections.map((i) =>
			i.event_id === eventId && i.person_id === personId ? { ...i, present: newPresent } : i
		);
		try {
			await api('PATCH', `/intersections/${eventId}/${personId}`, { present: newPresent });
		} catch {
			intersections = intersections.map((i) =>
				i.event_id === eventId && i.person_id === personId ? { ...i, present: !newPresent } : i
			);
		}
	}

	async function updateAmount(eventId: string, personId: string, amount: number | null, taxIncluded: boolean) {
		intersections = intersections.map((i) =>
			i.event_id === eventId && i.person_id === personId ? { ...i, custom_amount: amount, tax_included: taxIncluded } : i
		);
		await api('PATCH', `/intersections/${eventId}/${personId}`, { custom_amount: amount, tax_included: taxIncluded });
	}

	async function togglePaid(eventId: string, personId: string) {
		const ix = intersections.find((i) => i.event_id === eventId && i.person_id === personId);
		const newStatus = ix?.paid_status === 'paid' ? 'unpaid' : 'paid';
		intersections = intersections.map((i) =>
			i.event_id === eventId && i.person_id === personId ? { ...i, paid_status: newStatus } : i
		);
		try {
			await api('PATCH', `/intersections/${eventId}/${personId}`, { paid_status: newStatus });
		} catch {
			intersections = intersections.map((i) =>
				i.event_id === eventId && i.person_id === personId ? { ...i, paid_status: ix?.paid_status ?? 'unpaid' } : i
			);
		}
	}

	async function setAllInRow(item: Person | Event, present: boolean) {
		const isPersonItem = 'color' in item;
		if (!isPersonItem) {
			const ev = item as Event;
			if (ev.type !== 'even_split') return;
			const targets = visiblePeople.map(p => p.id);
			intersections = intersections.map(i =>
				i.event_id === ev.id && targets.includes(i.person_id) ? { ...i, present } : i
			);
			await Promise.all(targets.map(pid =>
				api('PATCH', `/intersections/${ev.id}/${pid}`, { present })
			));
		} else {
			const person = item as Person;
			const targets = visibleEvents.filter(e => e.type === 'even_split').map(e => e.id);
			intersections = intersections.map(i =>
				i.person_id === person.id && targets.includes(i.event_id) ? { ...i, present } : i
			);
			await Promise.all(targets.map(eid =>
				api('PATCH', `/intersections/${eid}/${person.id}`, { present })
			));
		}
	}

	async function setAllInCol(item: Person | Event, present: boolean) {
		const isPersonItem = 'color' in item;
		if (isPersonItem) {
			const person = item as Person;
			const targets = visibleEvents.filter(e => e.type === 'even_split').map(e => e.id);
			intersections = intersections.map(i =>
				i.person_id === person.id && targets.includes(i.event_id) ? { ...i, present } : i
			);
			await Promise.all(targets.map(eid =>
				api('PATCH', `/intersections/${eid}/${person.id}`, { present })
			));
		} else {
			const ev = item as Event;
			if (ev.type !== 'even_split') return;
			const targets = visiblePeople.map(p => p.id);
			intersections = intersections.map(i =>
				i.event_id === ev.id && targets.includes(i.person_id) ? { ...i, present } : i
			);
			await Promise.all(targets.map(pid =>
				api('PATCH', `/intersections/${ev.id}/${pid}`, { present })
			));
		}
	}

	async function markAllPaid(personId: string) {
		const toMark = intersections.filter(i => i.person_id === personId && i.paid_status === 'unpaid');
		// Optimistic
		intersections = intersections.map(i => i.person_id === personId ? { ...i, paid_status: 'paid' } : i);
		await Promise.all(toMark.map(i =>
			api('PATCH', `/intersections/${i.event_id}/${personId}`, { paid_status: 'paid' })
		));
	}

	async function splitRemaining(eventId: string) {
		const event = events.find(e => e.id === eventId);
		if (!event || event.type !== 'custom_amount') return;
		const eventIxs = intersections.filter(i => i.event_id === eventId);
		const filled = eventIxs.filter(i => i.custom_amount !== null);
		const empty = eventIxs.filter(i => i.custom_amount === null);
		if (empty.length === 0) return;

		const { getFinalAmount } = await import('$lib/calculations');
		const usedTotal = filled.reduce((s, i) =>
			s + getFinalAmount(i.custom_amount, i.tax_included, event.tax_percentage), 0);
		const remaining = event.total_cost - usedTotal;
		if (remaining < 0.005) return;

		// `remaining` is already a post-tax dollar amount (event.total_cost minus
		// getFinalAmount sums). Store with tax_included: true so getFinalAmount
		// doesn't apply the tax rate a second time and push the total over budget.
		// Any leftover cents from rounding show in the "X¢ left to assign" indicator.
		const perPerson = Math.round((remaining / empty.length) * 100) / 100;
		intersections = intersections.map(i =>
			i.event_id === eventId && i.custom_amount === null ? { ...i, custom_amount: perPerson, tax_included: true } : i
		);
		await Promise.all(empty.map(i =>
			api('PATCH', `/intersections/${eventId}/${i.person_id}`, { custom_amount: perPerson, tax_included: true })
		));
	}

	async function forkDivvy() {
		const newName = prompt('Name for your copy:', `${divvy.name} (Copy)`);
		if (!newName) return;
		const res = await fetch(`/api/divvies/${divvy.id}/fork`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: newName.trim() })
		});
		const { divvy: newDivvy } = await res.json();
		window.location.href = `/divvy/${newDivvy.id}?t=${newDivvy.owner_token}`;
	}

	const isOwner = $derived(accessLevel === 'owner');
	const canEdit = $derived(accessLevel === 'owner' || accessLevel === 'edit');
	const visiblePeople = $derived(people.filter((p) => !hiddenPeople.has(p.id)));
	// Hide parent events (those that have children) — only show sub-items and standalone events
	const parentEventIds = $derived(new Set(events.filter(e => e.parent_event_id).map(e => e.parent_event_id!)));
	const visibleEvents = $derived(events.filter((e) => !hiddenEvents.has(e.id) && !parentEventIds.has(e.id)));
</script>

<svelte:head>
	<title>{divvy.name} — DivvyUp</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
	<!-- Sticky header zone: top bar + tab nav stay fixed while content scrolls -->
	<div class="sticky top-0 z-40 flex flex-col bg-white dark:bg-gray-800 shadow-sm dark:shadow-black/30">
	<!-- Top bar -->
	<header class="border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
		<a href="/" aria-label="Go to DivvyUp home" class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow">
			<svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-6-6h12" />
			</svg>
		</a>

		<!-- Divvy name -->
		<div class="flex-1 min-w-0">
			{#if editingDivvyName && isOwner}
				<form onsubmit={(e) => { e.preventDefault(); saveDivvyName(); }} class="flex gap-2">
					<input
						class="text-lg font-bold text-gray-900 dark:text-gray-100 border-b-2 border-indigo-500 outline-none bg-transparent flex-1 min-w-0"
						bind:value={divvyNameDraft}
						onblur={saveDivvyName}
						autofocus
					/>
				</form>
			{:else}
				<button
					class="text-lg font-bold text-gray-900 dark:text-gray-100 truncate block text-left hover:text-indigo-600 transition-colors"
					onclick={() => { if (isOwner) { editingDivvyName = true; divvyNameDraft = divvy.name; } }}
					title={isOwner ? 'Click to rename' : divvy.name}
				>
					{divvy.name}
				</button>
			{/if}
		</div>

		<!-- Right actions -->
		<div class="flex items-center gap-2 flex-shrink-0">
			<span class="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {
				accessLevel === 'owner' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' :
				accessLevel === 'edit' ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300' :
				'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
			}">
				{accessLevel === 'owner' ? 'Owner' : accessLevel === 'edit' ? 'Editor' : 'View only'}
			</span>

			{#if !canEdit}
				<button
					onclick={forkDivvy}
					class="text-sm font-medium text-indigo-600 hover:text-indigo-800 px-3 py-1.5 border border-indigo-300 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
				>
					Fork copy
				</button>
			{/if}

			{#if isOwner}
				<button
					onclick={() => showShareModal = true}
					class="flex items-center gap-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors"
				>
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
					</svg>
					<span class="hidden sm:inline">Share</span>
				</button>
			{/if}

			<!-- Dark mode toggle -->
			<button
				onclick={toggleDark}
				class="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
				title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
				aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
			>
				{#if darkMode}
					<!-- Sun icon -->
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
					</svg>
				{:else}
					<!-- Moon icon -->
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
					</svg>
				{/if}
			</button>
		</div>
	</header>

	<!-- Tab nav + grid controls -->
	<div class="border-b border-gray-200 dark:border-gray-700 px-4 flex items-center gap-1">
		<button
			onclick={() => activeTab = 'edit'}
			class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === 'edit' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
		>Edit</button>
		<button
			onclick={() => activeTab = 'payment'}
			class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === 'payment' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
		>Payments</button>
		<button
			onclick={() => activeTab = 'settlement'}
			class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === 'settlement' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
		>Settlement</button>

		{#if activeTab !== 'settlement'}
			<div class="ml-auto flex items-center gap-1 py-2">
				<button
					onclick={() => transpose = !transpose}
					title="Flip rows and columns"
					class="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
				>
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
					</svg>
				</button>
				<button
					onclick={() => showMobileFilter = !showMobileFilter}
					title="Show/hide rows and columns"
					class="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors {showMobileFilter ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700' : ''}"
				>
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
					</svg>
				</button>
			</div>
		{/if}
	</div>
	</div><!-- end sticky header zone -->

	<!-- Main content -->
	<main class="flex-1 flex flex-col overflow-hidden">
		{#if activeTab !== 'settlement'}
			{#if showMobileFilter}
				<div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
					<div class="flex flex-wrap gap-4">
						<div>
							<p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">People</p>
							<div class="flex flex-wrap gap-2">
								{#each people as person}
									<button
										onclick={() => {
											const next = new Set(hiddenPeople);
											if (next.has(person.id)) next.delete(person.id);
											else next.add(person.id);
											hiddenPeople = next;
										}}
										class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all {hiddenPeople.has(person.id) ? 'opacity-40 border-gray-200 bg-gray-50' : 'border-transparent'}"
										style="background-color: {hiddenPeople.has(person.id) ? '' : person.color + '22'}; color: {person.color};"
									>
										<span class="w-2 h-2 rounded-full" style="background-color: {person.color};"></span>
										{person.name}
									</button>
								{/each}
							</div>
						</div>
						<div>
							<p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Items</p>
							<div class="flex flex-wrap gap-2">
								{#each events as event}
									<button
										onclick={() => {
											const next = new Set(hiddenEvents);
											if (next.has(event.id)) next.delete(event.id);
											else next.add(event.id);
											hiddenEvents = next;
										}}
										class="px-2.5 py-1 rounded-full text-xs font-medium border transition-all {hiddenEvents.has(event.id) ? 'opacity-40 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500' : 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'}"
									>
										{event.name}
									</button>
								{/each}
							</div>
						</div>
					</div>
				</div>
			{/if}

			{#if isOwner && activeTab === 'edit'}
				<div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex gap-2">
					<button
						onclick={() => { editingPerson = null; showPersonModal = true; }}
						class="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
						</svg>
						Add person
					</button>
					<button
						onclick={() => { editingEvent = null; showEventModal = true; }}
						class="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
						</svg>
						Add item
					</button>
				</div>
			{/if}

			{#if people.length === 0 || events.length === 0}
				<div class="flex-1 flex items-center justify-center p-12 text-center">
					<div>
						<div class="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
							<svg class="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
							</svg>
						</div>
						<h3 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
							{people.length === 0 && events.length === 0
								? 'Start by adding people and items'
								: people.length === 0
								? 'Add some people first'
								: 'Add an item to get started'}
						</h3>
						<p class="text-sm text-gray-400 dark:text-gray-500">
							{isOwner ? 'Use the buttons above to build your cost-split grid.' : 'The owner needs to add people and items.'}
						</p>
					</div>
				</div>
			{:else}
				<DivvyGrid
					{people}
					{events}
					{intersections}
					{mode}
					{transpose}
					{visiblePeople}
					{visibleEvents}
					{accessLevel}
					onEditPerson={(p) => { editingPerson = p; showPersonModal = true; }}
					onDeletePerson={deletePerson}
					onEditEvent={(e) => { editingEvent = e; showEventModal = true; }}
					onDeleteEvent={deleteEvent}
					onDuplicateEvent={duplicateEvent}
					onTogglePresence={togglePresence}
					onUpdateAmount={updateAmount}
					onTogglePaid={togglePaid}
					onMarkAllPaid={markAllPaid}
					onSplitRemaining={splitRemaining}
					onSetAllRow={setAllInRow}
					onSetAllCol={setAllInCol}
				/>
			{/if}
		{/if}

		{#if activeTab === 'settlement'}
			<SettlementPanel {people} {events} {intersections} />
		{/if}
	</main>
</div>

{#if showPersonModal}
	<PersonModal
		person={editingPerson}
		{people}
		onSave={async (name, color) => {
			if (editingPerson) await updatePerson(editingPerson.id, name, color);
			else await addPerson(name, color);
			showPersonModal = false;
		}}
		onClose={() => showPersonModal = false}
	/>
{/if}

{#if showEventModal}
	<EventModal
		event={editingEvent}
		{people}
		onSave={async (eventData) => {
			if (editingEvent) await updateEvent(editingEvent.id, eventData);
			else await addEvent(eventData);
			showEventModal = false;
		}}
		onClose={() => showEventModal = false}
	/>
{/if}

{#if showShareModal}
	<ShareModal
		divvy={divvy}
		onClose={() => showShareModal = false}
	/>
{/if}
