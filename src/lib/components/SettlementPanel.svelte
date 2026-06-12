<!-- Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source. -->
<script lang="ts">
	import type { Person, Event, Intersection } from '$lib/types';
	import { calculateSettlement, getPersonTotal, calculateEventShare, formatCurrency } from '$lib/calculations';

	let { people, events, intersections }: {
		people: Person[]; events: Event[]; intersections: Intersection[];
	} = $props();

	const settlement = $derived(calculateSettlement(people, events, intersections));

	// Group events: top-level events (no parent) are shown directly.
	// Sub-items (parent_event_id set) are grouped under their parent.
	// We synthesize a "group" for parent events that have children.
	interface EventGroup {
		parentName: string;
		payerPersonId: string | null;
		children: Event[];
		isGroup: boolean; // true = has sub-items, false = standalone event
	}

	const eventGroups = $derived(() => {
		const parentMap = new Map<string, EventGroup>();
		const standalones: EventGroup[] = [];

		// First pass: identify parents and standalone events
		for (const ev of events) {
			if (!ev.parent_event_id) {
				const children = events.filter(e => e.parent_event_id === ev.id);
				if (children.length > 0) {
					parentMap.set(ev.id, { parentName: ev.name, payerPersonId: ev.payer_person_id, children, isGroup: true });
				} else {
					standalones.push({ parentName: ev.name, payerPersonId: ev.payer_person_id, children: [ev], isGroup: false });
				}
			}
		}

		// Combine: standalone events first, then groups
		const groups: EventGroup[] = [...standalones];
		for (const [, group] of parentMap) {
			groups.push(group);
		}
		return groups;
	});

	function getEventPayer(payerPersonId: string | null): Person | undefined {
		return people.find(p => p.id === payerPersonId);
	}

	function getGroupTotal(group: EventGroup): number {
		return group.children.reduce((s, ev) => s + ev.total_cost, 0);
	}

	function getPersonGroupShare(personId: string, group: EventGroup): number {
		return group.children.reduce((s, ev) => {
			if (ev.payer_person_id === personId) return s; // payer's own share is covered by fronting the bill
			const shares = calculateEventShare(ev, intersections);
			return s + (shares[personId] ?? 0);
		}, 0);
	}

	function getPersonGroupPaidStatus(personId: string, group: EventGroup): 'paid' | 'unpaid' | 'partial' {
		const relevant = group.children.filter(ev => {
			if (ev.payer_person_id === personId) return false; // payer's own share is already covered
			const shares = calculateEventShare(ev, intersections);
			return (shares[personId] ?? 0) > 0;
		});
		if (relevant.length === 0) return 'paid';
		const paid = relevant.filter(ev => {
			const ix = intersections.find(i => i.event_id === ev.id && i.person_id === personId);
			return ix?.paid_status === 'paid';
		});
		if (paid.length === relevant.length) return 'paid';
		if (paid.length === 0) return 'unpaid';
		return 'partial';
	}

	const eventsWithNoPayer = $derived(events.filter(e => !e.payer_person_id && !e.parent_event_id));
</script>

<div class="flex-1 overflow-auto p-4 max-w-3xl mx-auto w-full">
	<!-- Balance summary -->
	<div class="mb-6">
		<h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Balance summary</h3>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			{#each settlement.balances as bal}
				<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
					<span class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style="background-color: {bal.color};">
						{bal.personName[0].toUpperCase()}
					</span>
					<div class="flex-1 min-w-0">
						<p class="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">{bal.personName}</p>
						<p class="text-xs text-gray-500 dark:text-gray-400">Total: {formatCurrency(getPersonTotal(bal.personId, events, intersections))}</p>
					</div>
					<div class="text-right flex-shrink-0">
						{#if bal.net > 0.005}
							<p class="text-sm font-semibold text-emerald-600">+{formatCurrency(bal.net)}</p>
							<p class="text-xs text-gray-400">is owed</p>
						{:else if bal.net < -0.005}
							<p class="text-sm font-semibold text-red-500">{formatCurrency(bal.net)}</p>
							<p class="text-xs text-gray-400">owes</p>
						{:else}
							<p class="text-sm font-semibold text-gray-400 dark:text-gray-500">Settled</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Minimum transfers -->
	{#if settlement.transactions.length > 0}
		<div class="mb-6">
			<h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Who pays who</h3>
			<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
				{#each settlement.transactions as tx}
					{@const fromPerson = people.find(p => p.id === tx.fromId)}
					<div class="flex items-center gap-3 px-4 py-3">
						<span class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style="background-color: {fromPerson?.color ?? '#6366f1'};">
							{tx.fromName[0].toUpperCase()}
						</span>
						<span class="font-medium text-gray-800 dark:text-gray-200 text-sm flex-1">{tx.fromName} → {tx.toName}</span>
						<span class="font-bold text-gray-900 dark:text-gray-100 text-sm">{formatCurrency(tx.amount)}</span>
					</div>
				{/each}
			</div>
		</div>
	{:else if people.length > 0 && events.length > 0}
		<div class="mb-6 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-center">
			<p class="text-emerald-700 dark:text-emerald-400 font-medium text-sm">🎉 Everything is settled up!</p>
		</div>
	{/if}

	<!-- Event / group breakdown -->
	<div class="mb-6">
		<h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Breakdown</h3>
		<div class="space-y-3">
			{#each eventGroups() as group}
				{@const payer = getEventPayer(group.payerPersonId)}
				{@const groupTotal = getGroupTotal(group)}
				<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
					<!-- Group / event header -->
					<div class="px-4 py-3 flex items-center justify-between gap-3 bg-gray-50/80 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-600">
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<p class="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">{group.parentName}</p>
								{#if group.isGroup}
									<span class="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-medium">{group.children.length} items</span>
								{/if}
							</div>
							<p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
								{group.children[0]?.type === 'even_split' ? 'Even split' : 'Custom amounts'} ·
								{formatCurrency(groupTotal)}
							</p>
						</div>
						{#if payer}
							<span class="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style="background-color: {payer.color}22; color: {payer.color};">
								<span class="w-2.5 h-2.5 rounded-full" style="background-color: {payer.color};"></span>
								{payer.name} paid
							</span>
						{:else}
							<span class="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full flex-shrink-0">No payer</span>
						{/if}
					</div>

					<!-- Per-person rows (grouped) -->
					<div class="divide-y divide-gray-50 dark:divide-gray-700">
						{#each people as person}
							{@const share = getPersonGroupShare(person.id, group)}
							{@const status = getPersonGroupPaidStatus(person.id, group)}
							{#if share > 0.005}
								<div class="px-4 py-2 flex items-center gap-3">
									<span class="w-5 h-5 rounded-full flex-shrink-0" style="background-color: {person.color};"></span>
									<span class="text-sm text-gray-700 dark:text-gray-300 flex-1">{person.name}</span>
									<!-- Sub-item detail when grouped -->
									{#if group.isGroup}
										<div class="flex items-center gap-2 text-right">
											<div class="text-xs text-gray-400 dark:text-gray-500 text-right">
												{#each group.children as child}
													{@const childShares = calculateEventShare(child, intersections)}
													{#if (childShares[person.id] ?? 0) > 0.005}
														<div>{child.name}: {formatCurrency(childShares[person.id])}</div>
													{/if}
												{/each}
											</div>
											<span class="text-sm font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">{formatCurrency(share)}</span>
										</div>
									{:else}
										<span class="text-sm font-medium text-gray-800 dark:text-gray-200">{formatCurrency(share)}</span>
									{/if}
									<span class="text-xs font-medium w-16 text-right {status === 'paid' ? 'text-emerald-600' : status === 'partial' ? 'text-amber-500' : 'text-amber-600'}">
										{status === 'paid' ? '✓ paid' : status === 'partial' ? '½ partial' : '○ due'}
									</span>
								</div>
							{/if}
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>

	{#if eventsWithNoPayer.length > 0}
		<div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
			<p class="text-amber-700 dark:text-amber-400 font-semibold text-sm mb-1">⚠ Items without a payer</p>
			<p class="text-amber-600 dark:text-amber-400 text-xs mb-2">These aren't included in settlement because no one is listed as having paid:</p>
			{#each eventsWithNoPayer as ev}
				<p class="text-sm text-amber-700 dark:text-amber-400 font-medium">· {ev.name}</p>
			{/each}
		</div>
	{/if}

	{#if people.length === 0 || events.length === 0}
		<div class="text-center py-12 text-gray-400 dark:text-gray-500">
			<p class="text-sm">Add people and items in the Grid tab to see settlement details.</p>
		</div>
	{/if}
</div>
