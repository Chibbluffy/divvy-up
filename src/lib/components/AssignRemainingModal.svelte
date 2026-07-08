<!-- Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source. -->
<script lang="ts">
	import type { Event, Person, Intersection } from '$lib/types';
	import { getRemainingAmount, formatCurrency } from '$lib/calculations';

	let {
		event,
		people,
		intersections,
		onApply,
		onClose
	}: {
		event: Event;
		people: Person[];
		intersections: Intersection[];
		onApply: (personIds: string[]) => void;
		onClose: () => void;
	} = $props();

	const eventIxs = $derived(intersections.filter(i => i.event_id === event.id));
	const remaining = $derived(getRemainingAmount(event, intersections));

	// Default: people who already have amounts assigned
	let selectedIds = $state(
		new Set(eventIxs.filter(i => i.custom_amount !== null).map(i => i.person_id))
	);

	const selectedCount = $derived(selectedIds.size);
	const perPerson = $derived(
		selectedCount > 0 ? Math.round((remaining / selectedCount) * 100) / 100 : 0
	);

	function fmtTip(x: number): string {
		const r = Math.round(x * 100) / 100;
		return r === Math.floor(r) ? String(r) : r.toFixed(2);
	}

	function previewExpression(personId: string): string {
		const ix = eventIxs.find(i => i.person_id === personId);
		const tip = fmtTip(perPerson);
		if (ix?.custom_amount_expression) return `${ix.custom_amount_expression}+${tip}`;
		if (ix?.custom_amount != null) return `${ix.custom_amount}+${tip}`;
		return tip;
	}

	function toggle(personId: string) {
		const next = new Set(selectedIds);
		if (next.has(personId)) next.delete(personId);
		else next.add(personId);
		selectedIds = next;
	}

	function handleApply() {
		onApply([...selectedIds]);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
	onclick={onClose}
>
	<div
		class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md"
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Header -->
		<div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
			<h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">Assign remaining tip</h2>
			<p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">{event.name}</p>
		</div>

		<div class="px-5 py-4">
			<!-- Remaining amount pill -->
			<div class="flex items-center justify-between mb-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700">
				<span class="text-sm text-amber-700 dark:text-amber-300">Remaining</span>
				<span class="text-lg font-bold text-amber-700 dark:text-amber-300">{formatCurrency(remaining)}</span>
			</div>

			{#if selectedCount > 0 && perPerson > 0}
				<p class="text-xs text-center text-gray-500 dark:text-gray-400 mb-3">
					{formatCurrency(remaining)} ÷ {selectedCount} =
					<span class="font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(perPerson)} per person</span>
				</p>
			{/if}

			<!-- Person checklist -->
			<div class="space-y-0.5 max-h-72 overflow-y-auto -mx-1 px-1">
				{#each people as person}
					{@const ix = eventIxs.find(i => i.person_id === person.id)}
					{@const checked = selectedIds.has(person.id)}
					{@const currentExpr = ix?.custom_amount_expression ?? (ix?.custom_amount != null ? String(ix.custom_amount) : null)}
					<label class="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors
						{checked ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}">
						<input
							type="checkbox"
							{checked}
							onchange={() => toggle(person.id)}
							class="rounded text-indigo-600 flex-shrink-0"
						/>
						<span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: {person.color};"></span>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">{person.name}</p>
							{#if checked && perPerson > 0}
								<p class="text-xs font-mono text-indigo-600 dark:text-indigo-400 truncate">{previewExpression(person.id)}</p>
							{:else if currentExpr}
								<p class="text-xs font-mono text-gray-400 dark:text-gray-500 truncate">{currentExpr}</p>
							{:else}
								<p class="text-xs text-gray-300 dark:text-gray-600">unassigned</p>
							{/if}
						</div>
						{#if checked && perPerson > 0}
							<span class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex-shrink-0">+{formatCurrency(perPerson)}</span>
						{/if}
					</label>
				{/each}
			</div>
		</div>

		<!-- Footer -->
		<div class="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-2 justify-end">
			<button
				onclick={onClose}
				class="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
			>Cancel</button>
			<button
				onclick={handleApply}
				disabled={selectedCount === 0 || perPerson <= 0}
				class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
			>Apply +{formatCurrency(perPerson)} × {selectedCount}</button>
		</div>
	</div>
</div>
