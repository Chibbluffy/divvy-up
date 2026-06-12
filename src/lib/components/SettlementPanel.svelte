<!-- Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source. -->
<script lang="ts">
	import type { Person, Event, Intersection, Payment } from '$lib/types';
	import { calculateSettlement, getPersonTotal, calculateEventShare, formatCurrency } from '$lib/calculations';

	let { people, events, intersections, payments, canEdit, logPayment, removePayment }: {
		people: Person[]; events: Event[]; intersections: Intersection[];
		payments: Payment[]; canEdit: boolean;
		logPayment: (fromPersonId: string, toPersonId: string, amount: number, note: string | null) => Promise<void>;
		removePayment: (id: string) => Promise<void>;
	} = $props();

	const settlement = $derived(calculateSettlement(people, events, intersections, payments));

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

	function getPersonGroupPaidStatus(personId: string, group: EventGroup): 'marked' | 'unmarked' | 'partial' {
		const relevant = group.children.filter(ev => {
			if (ev.payer_person_id === personId) return false;
			const shares = calculateEventShare(ev, intersections);
			return (shares[personId] ?? 0) > 0;
		});
		if (relevant.length === 0) return 'marked';
		const marked = relevant.filter(ev => {
			const ix = intersections.find(i => i.event_id === ev.id && i.person_id === personId);
			return ix?.mark === 'marked';
		});
		if (marked.length === relevant.length) return 'marked';
		if (marked.length === 0) return 'unmarked';
		return 'partial';
	}

	const eventsWithNoPayer = $derived(events.filter(e => !e.payer_person_id && !e.parent_event_id));

	// Log payment form state
	let fromPersonId = $state('');
	let toPersonId = $state('');
	let paymentAmount = $state<number | null>(null);
	let paymentNote = $state('');
	let saving = $state(false);

	const logFormValid = $derived(
		fromPersonId && toPersonId && fromPersonId !== toPersonId && paymentAmount && paymentAmount > 0
	);

	const suggestedAmount = $derived(
		fromPersonId && toPersonId
			? (settlement.transactions.find(tx => tx.fromId === fromPersonId && tx.toId === toPersonId)?.amount ?? null)
			: null
	);

	async function submitPayment() {
		if (!logFormValid || saving) return;
		saving = true;
		await logPayment(fromPersonId, toPersonId, paymentAmount!, paymentNote.trim() || null);
		paymentAmount = null;
		paymentNote = '';
		saving = false;
	}

	function personName(id: string): string {
		return people.find(p => p.id === id)?.name ?? id;
	}

	function personColor(id: string): string {
		return people.find(p => p.id === id)?.color ?? '#6366f1';
	}

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
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

	<!-- Direct payments -->
	<div class="mb-6">
		<h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Direct payments</h3>
		<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">

			<!-- Log a payment form -->
			{#if canEdit && people.length >= 2}
				<div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-700/40">
					<p class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Log a payment</p>
					<div class="flex flex-wrap gap-2 items-end">
						<div class="flex flex-col gap-1">
							<label class="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">From</label>
							<select
								bind:value={fromPersonId}
								class="text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
							>
								<option value="">Person…</option>
								{#each people as p}
									<option value={p.id}>{p.name}</option>
								{/each}
							</select>
						</div>
						<div class="flex flex-col gap-1">
							<label class="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">To</label>
							<select
								bind:value={toPersonId}
								class="text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
							>
								<option value="">Person…</option>
								{#each people.filter(p => p.id !== fromPersonId) as p}
									<option value={p.id}>{p.name}</option>
								{/each}
							</select>
						</div>
						<div class="flex flex-col gap-1">
							<label class="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Amount</label>
							<input
								type="number"
								bind:value={paymentAmount}
								min="0.01"
								step="0.01"
								placeholder="0.00"
								class="text-sm w-24 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
							/>
							{#if suggestedAmount !== null}
								<button
									type="button"
									onclick={() => paymentAmount = suggestedAmount}
									class="text-[10px] text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 text-left leading-none"
								>↑ use {formatCurrency(suggestedAmount)}</button>
							{/if}
						</div>
						<div class="flex flex-col gap-1 flex-1 min-w-24">
							<label class="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Note (optional)</label>
							<input
								type="text"
								bind:value={paymentNote}
								placeholder="e.g. Venmo"
								class="text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
							/>
						</div>
						<button
							onclick={submitPayment}
							disabled={!logFormValid || saving}
							class="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
						>{saving ? 'Saving…' : 'Log'}</button>
					</div>
				</div>
			{/if}

			<!-- Payment history -->
			{#if payments.length > 0}
				<div class="divide-y divide-gray-50 dark:divide-gray-700">
					{#each payments as payment (payment.id)}
						<div class="flex items-center gap-3 px-4 py-2.5">
							<span class="w-5 h-5 rounded-full flex-shrink-0" style="background-color: {personColor(payment.from_person_id)};"></span>
							<div class="flex-1 min-w-0">
								<span class="text-sm text-gray-700 dark:text-gray-300">
									<span class="font-medium">{personName(payment.from_person_id)}</span>
									<span class="text-gray-400"> → </span>
									<span class="font-medium">{personName(payment.to_person_id)}</span>
								</span>
								{#if payment.note}
									<span class="text-xs text-gray-400 dark:text-gray-500 ml-1">· {payment.note}</span>
								{/if}
								<span class="text-xs text-gray-400 dark:text-gray-500 ml-1">· {formatDate(payment.created_at)}</span>
							</div>
							<span class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-shrink-0">{formatCurrency(payment.amount)}</span>
							{#if canEdit}
								<button
									onclick={() => removePayment(payment.id)}
									class="text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 ml-1"
									title="Remove"
								>
									<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="px-4 py-4 text-sm text-gray-400 dark:text-gray-500 text-center">No direct payments logged yet.</p>
			{/if}
		</div>
	</div>

	<!-- Event / group breakdown -->
	<div class="mb-6">
		<h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Breakdown</h3>
		<div class="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 mb-3">
			The paid/due marks here come from the grid and are for organization only — they don't affect the balances or "who pays who" above. Use direct payments to reduce what someone owes.
		</div>
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
							{@const cellNotes = group.children
								.map(child => ({ name: child.name, note: intersections.find(i => i.event_id === child.id && i.person_id === person.id)?.note ?? null }))
								.filter(n => n.note !== null)}
							{#if share > 0.005}
								<div class="px-4 py-2 flex flex-col gap-0.5">
									<div class="flex items-center gap-3">
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
										<span class="text-xs font-medium w-16 text-right {status === 'marked' ? 'text-emerald-600 dark:text-emerald-400' : status === 'partial' ? 'text-amber-500 dark:text-amber-400' : 'text-red-500 dark:text-red-400'}">
											{status === 'marked' ? '✓ paid' : status === 'partial' ? '½ partial' : '○ due'}
										</span>
									</div>
									{#if cellNotes.length > 0}
										<p class="text-xs italic text-gray-400 dark:text-gray-500 ml-8">
											{group.isGroup
												? cellNotes.map(n => `${n.name}: ${n.note}`).join(' · ')
												: cellNotes[0].note}
										</p>
									{/if}
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
