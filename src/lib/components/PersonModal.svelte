<!-- Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source. -->
<script lang="ts">
	import type { Person } from '$lib/types';
	import { PERSON_COLORS, getNextColor } from '$lib/calculations';

	let {
		person,
		people,
		onSave,
		onClose
	}: {
		person: Person | null;
		people: Person[];
		onSave: (name: string, color: string) => Promise<void>;
		onClose: () => void;
	} = $props();

	const usedColors = $derived(
		person ? people.filter((p) => p.id !== person.id).map((p) => p.color) : people.map((p) => p.color)
	);

	let name = $state(person?.name ?? '');
	let color = $state(person?.color ?? getNextColor(usedColors));
	let saving = $state(false);
	let err = $state('');

	async function handleSave() {
		if (!name.trim()) { err = 'Name is required'; return; }
		saving = true;
		err = '';
		try {
			await onSave(name.trim(), color);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Failed to save';
			saving = false;
		}
	}

	let dialogEl: HTMLDivElement;

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	function onWindowPointerDown(e: PointerEvent) {
		if (dialogEl && !dialogEl.contains(e.target as Node)) onClose();
	}
</script>

<svelte:window onkeydown={handleKey} onpointerdown={onWindowPointerDown} />

<!-- Backdrop -->
<div class="fixed inset-0 bg-black/40 modal-backdrop z-50 flex items-center justify-center p-4">
	<div
		bind:this={dialogEl}
		role="dialog"
		aria-modal="true"
		aria-labelledby="person-modal-title"
		tabindex="-1"
		class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6"
	>
		<h2 id="person-modal-title" class="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5">
			{person ? 'Edit person' : 'Add person'}
		</h2>

		<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" for="personName">Name</label>
		<input
			id="personName"
			type="text"
			bind:value={name}
			placeholder="e.g. Alex"
			class="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
			onkeydown={(e) => { if (e.key === 'Enter') handleSave(); }}
			autofocus
		/>

		<p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Color</p>
		<div class="flex flex-wrap gap-2 mb-5">
			{#each PERSON_COLORS as c}
				<button
					onclick={() => color = c}
					class="w-7 h-7 rounded-full border-2 transition-all"
					style="background-color: {c}; border-color: {color === c ? '#1e1b4b' : c};"
					title={c}
				>
					{#if color === c}
						<svg class="w-4 h-4 text-white mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					{/if}
				</button>
			{/each}
		</div>

		{#if err}
			<p class="text-sm text-red-600 mb-3">{err}</p>
		{/if}

		<div class="flex gap-3">
			<button
				onclick={onClose}
				class="flex-1 py-2 px-4 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
			>Cancel</button>
			<button
				onclick={handleSave}
				disabled={saving || !name.trim()}
				class="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium rounded-xl transition-colors text-sm"
			>
				{saving ? 'Saving…' : person ? 'Save changes' : 'Add person'}
			</button>
		</div>
	</div>
</div>
