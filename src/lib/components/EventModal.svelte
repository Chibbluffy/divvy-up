<!-- Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source. -->
<script lang="ts">
	import type { Event, Person } from '$lib/types';

	let {
		event, people, onSave, onClose
	}: {
		event: Event | null;
		people: Person[];
		onSave: (data: Partial<Event> & { subItemCount?: number; subItemNames?: string[]; subItemCosts?: number[] }) => Promise<void>;
		onClose: () => void;
	} = $props();

	const isEditing = !!event;

	let name = $state(event?.name ?? '');
	let type = $state<'even_split' | 'custom_amount'>(event?.type ?? 'even_split');
	let totalCost = $state<number | null>(event?.total_cost ?? null);
	let payerPersonId = $state<string | null>(event?.payer_person_id ?? null);
	let taxPercentage = $state<number | null>(event?.tax_percentage ?? null);
	let subItemCount = $state(1);
	let splitIntoSubs = $state(false);
	let saving = $state(false);
	let err = $state('');

	// Auto-generate sub-item names
	const subItemNames = $derived(
		Array.from({ length: subItemCount }, (_, i) =>
			name.trim() ? `${name.trim()} ${i + 1}` : `Item ${i + 1}`
		)
	);

	// Per-sub-item cost (equal split by default)
	const perItemCost = $derived(() => {
		const cost = totalCost ?? 0;
		if (cost <= 0 || subItemCount <= 0) return 0;
		return Math.round((cost / subItemCount) * 100) / 100;
	});

	async function handleSave() {
		if (!name.trim()) { err = 'Name is required'; return; }
		const cost = totalCost ?? NaN;
		if (isNaN(cost) || cost < 0) { err = 'Enter a valid cost'; return; }
		if (splitIntoSubs && !isEditing && (isNaN(subItemCount) || subItemCount < 2)) {
			err = 'Enter a number of sub-items (2 or more)'; return;
		}
		const tax = (taxPercentage !== null && !Number.isNaN(taxPercentage)) ? taxPercentage : null;

		saving = true;
		err = '';
		try {
			await onSave({
				name: name.trim(),
				type,
				total_cost: cost,
				payer_person_id: payerPersonId,
				tax_percentage: tax && !isNaN(tax) ? tax : null,
				total_includes_tax: false,
				subItemCount: splitIntoSubs && !isEditing ? subItemCount : undefined,
				subItemNames: splitIntoSubs && !isEditing ? subItemNames : undefined,
				subItemCosts: splitIntoSubs && !isEditing ? Array(subItemCount).fill(perItemCost()) : undefined
			});
		} catch (e) {
			err = e instanceof Error ? e.message : 'Failed to save';
			saving = false;
		}
	}

	let dialogEl: HTMLDivElement;

	function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }

	function onWindowPointerDown(e: PointerEvent) {
		if (dialogEl && !dialogEl.contains(e.target as Node)) onClose();
	}
</script>

<svelte:window onkeydown={handleKey} onpointerdown={onWindowPointerDown} />

<div class="fixed inset-0 bg-black/40 modal-backdrop z-50 flex items-center justify-center p-4">
	<div
		bind:this={dialogEl}
		role="dialog"
		aria-modal="true"
		aria-labelledby="event-modal-title"
		tabindex="-1"
		class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
	>
		<h2 id="event-modal-title" class="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5">{isEditing ? 'Edit item' : 'Add item'}</h2>

		<div class="space-y-4">
			<div>
				<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" for="eventName">Name</label>
				<input
					id="eventName"
					type="text"
					bind:value={name}
					placeholder="e.g. Hotel Night 1, Dinner, Flights…"
					class="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
					autofocus
				/>
			</div>

			{#if !isEditing}
				<div>
					<p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Split type</p>
					<div class="grid grid-cols-2 gap-2">
						<button
							onclick={() => type = 'even_split'}
							class="p-3 rounded-xl border-2 text-left transition-all {type === 'even_split' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}"
						>
							<div class="font-semibold text-sm {type === 'even_split' ? 'text-indigo-700' : 'text-gray-700 dark:text-gray-300'}">Even split</div>
							<div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Check who's included</div>
						</button>
						<button
							onclick={() => type = 'custom_amount'}
							class="p-3 rounded-xl border-2 text-left transition-all {type === 'custom_amount' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}"
						>
							<div class="font-semibold text-sm {type === 'custom_amount' ? 'text-indigo-700' : 'text-gray-700 dark:text-gray-300'}">Custom amounts</div>
							<div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Enter each person's share</div>
						</button>
					</div>
				</div>
			{/if}

			<div>
				<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" for="totalCost">Total cost ($)</label>
				<input
					id="totalCost"
					type="number"
					bind:value={totalCost}
					placeholder="0.00"
					min="0"
					step="0.01"
					class="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
				/>
			</div>

			{#if people.length > 0}
				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" for="payerSelect">Who paid?</label>
					<select
						id="payerSelect"
						bind:value={payerPersonId}
						class="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
					>
						<option value={null}>Not set</option>
						{#each people as p}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			{#if type === 'custom_amount'}
				<div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 space-y-2">
					<p class="text-sm font-medium text-gray-700 dark:text-gray-300">Tax settings</p>
					<div>
						<label class="block text-xs text-gray-600 dark:text-gray-400 mb-1" for="taxPct">Tax rate (%)</label>
						<input
							id="taxPct"
							type="number"
							bind:value={taxPercentage}
							placeholder="e.g. 8.5"
							min="0"
							max="100"
							step="0.1"
							class="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
						/>
					</div>
				</div>
			{/if}

			<!-- Sub-items (only when creating a new event) -->
			{#if !isEditing}
				<div class="border-t border-gray-100 dark:border-gray-700 pt-4">
					<label class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer mb-3">
						<input type="checkbox" bind:checked={splitIntoSubs} class="rounded border-gray-300 text-indigo-600" />
						Split into sub-items (e.g. hotel nights)
					</label>

					{#if splitIntoSubs}
						<div class="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl p-3 space-y-3">
							<div>
								<label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1" for="subItemCount">Number of sub-items</label>
								<input
									id="subItemCount"
									type="number"
									bind:value={subItemCount}
									min="2"
									max="30"
									class="w-24 px-3 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
								/>
							</div>
							{#if name.trim() && subItemCount >= 2}
								<div>
									<p class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Will create {subItemCount} items grouped under "{name.trim()}":</p>
									<div class="space-y-1 max-h-32 overflow-y-auto">
										{#each subItemNames as subName, i}
											<div class="flex items-center gap-2 text-xs">
												<span class="text-gray-500 dark:text-gray-400 w-5 flex-shrink-0">{i + 1}.</span>
												<span class="text-gray-700 dark:text-gray-300">{subName}</span>
												{#if perItemCost() > 0}
													<span class="ml-auto text-gray-500 dark:text-gray-400">${perItemCost().toFixed(2)}</span>
												{/if}
											</div>
										{/each}
									</div>
									<p class="text-xs text-indigo-600 mt-2">Sub-items are grouped together in the settlement view.</p>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#if err}
			<p class="text-sm text-red-600 mt-3">{err}</p>
		{/if}

		<div class="flex gap-3 mt-5">
			<button
				onclick={onClose}
				class="flex-1 py-2 px-4 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
			>Cancel</button>
			<button
				onclick={handleSave}
				disabled={saving || !name.trim()}
				class="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium rounded-xl transition-colors text-sm"
			>
				{saving ? 'Saving…' : isEditing ? 'Save changes' : splitIntoSubs ? `Create ${subItemCount} items` : 'Add item'}
			</button>
		</div>
	</div>
</div>
