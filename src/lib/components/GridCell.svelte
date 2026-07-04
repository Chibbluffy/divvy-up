<!-- Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source. -->
<script lang="ts">
	import type { Event, Person, Intersection } from '$lib/types';
	import { getFinalAmount, formatCurrency } from '$lib/calculations';

	let {
		event, person, ix, mode, canEdit,
		shareAmount,
		onTogglePresence, onUpdateAmount, onTogglePaid, onUpdateNote
	}: {
		event: Event; person: Person; ix: Intersection | undefined;
		mode: 'edit' | 'payment'; canEdit: boolean;
		shareAmount: number;
		onTogglePresence: () => void;
		onUpdateAmount: (amount: number | null, taxIncluded: boolean) => void;
		onTogglePaid: () => void;
		onUpdateNote: (note: string | null) => void;
	} = $props();

	let cellEl = $state<HTMLDivElement | null>(null);
	let editing = $state(false);
	let inputValue = $state<number | null>(null);
	let taxIncluded = $state(false);
	let popupStyle = $state('');
	let popupInputEl = $state<HTMLInputElement | null>(null);
	let notingEl = $state<HTMLTextAreaElement | null>(null);
	let noting = $state(false);
	let noteValue = $state('');

	$effect(() => {
		if (editing && popupInputEl) popupInputEl.focus();
	});

	$effect(() => {
		if (noting && notingEl) notingEl.focus();
	});

	$effect(() => {
		inputValue = ix?.custom_amount ?? null;
		taxIncluded = ix?.tax_included ?? false;
	});

	const isPayer = $derived(event.payer_person_id === person.id);
	const present = $derived(ix?.present ?? false);
	const paidStatus = $derived(ix?.mark ?? 'unmarked');
	const customAmount = $derived(ix?.custom_amount ?? null);
	const cellNote = $derived(ix?.note ?? null);
	const finalAmount = $derived(getFinalAmount(customAmount, ix?.tax_included ?? false, event.tax_percentage));
	const isActive = $derived(event.type === 'even_split' ? present : customAmount !== null);

	function bgStyle() {
		if (mode === 'payment') {
			if (!isActive) return 'background:var(--cell-inactive);';
			if (isPayer) return 'background:var(--cell-payer);';
			return paidStatus === 'marked' ? 'background:var(--cell-paid);' : 'background:var(--cell-unpaid);';
		}
		return isActive ? `background:${person.color}22;` : 'background:var(--cell-inactive);';
	}

	function openEdit(e: MouseEvent) {
		e.stopPropagation(); // prevent window click handler from immediately closing popup
		if (!canEdit || !cellEl) return;
		const rect = cellEl.getBoundingClientRect();
		const isMobile = window.innerWidth < 640;
		const minW = isMobile ? 200 : 160;
		const left = Math.max(8, Math.min(rect.left, window.innerWidth - minW - 8));
		const spaceBelow = window.innerHeight - rect.bottom;
		if (spaceBelow > 160) {
			popupStyle = `top:${rect.bottom + 2}px;left:${left}px;min-width:${minW}px;`;
		} else {
			popupStyle = `bottom:${window.innerHeight - rect.top + 2}px;left:${left}px;min-width:${minW}px;`;
		}
		editing = true;
	}

	function commitAmount() {
		editing = false;
		const amount = (inputValue !== null && !Number.isNaN(inputValue)) ? inputValue : null;
		onUpdateAmount(amount, taxIncluded);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter') commitAmount();
		if (e.key === 'Escape') { editing = false; inputValue = customAmount; }
	}

	function openNote(e: MouseEvent) {
		e.stopPropagation();
		if (!cellEl) return;
		const rect = cellEl.getBoundingClientRect();
		const isMobile = window.innerWidth < 640;
		const minW = isMobile ? 240 : 195;
		const left = Math.max(8, Math.min(rect.left, window.innerWidth - minW - 8));
		const spaceBelow = window.innerHeight - rect.bottom;
		if (spaceBelow > 160) {
			popupStyle = `top:${rect.bottom + 2}px;left:${left}px;min-width:${minW}px;`;
		} else {
			popupStyle = `bottom:${window.innerHeight - rect.top + 2}px;left:${left}px;min-width:${minW}px;`;
		}
		noteValue = cellNote ?? '';
		noting = true;
	}

	function commitNote() {
		noting = false;
		const trimmed = noteValue.trim() || null;
		onUpdateNote(trimmed);
	}

	function onWindowPointerDown(e: PointerEvent) {
		if (editing && !(e.target as HTMLElement).closest('.cell-popup')) {
			commitAmount();
		}
		if (noting && !(e.target as HTMLElement).closest('.cell-popup')) {
			commitNote();
		}
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div
	bind:this={cellEl}
	class="w-full h-full min-h-[40px] flex items-center justify-center relative select-none group/cell"
	style={bgStyle()}
>
	{#if mode === 'payment' && isActive && !isPayer}
		<button
			onclick={openNote}
			title={cellNote ? cellNote : 'Add a comment'}
			class="absolute top-0.5 right-0.5 p-1 rounded transition-opacity z-10
				{cellNote ? 'opacity-100 text-indigo-400 dark:text-indigo-300' : 'opacity-0 group-hover/cell:opacity-40 hover-show-faint text-gray-400'}"
		>
			<svg class="w-3 h-3" fill={cellNote ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
			</svg>
		</button>
	{/if}
	{#if event.type === 'even_split'}
		{#if mode === 'edit'}
			<button
				disabled={!canEdit}
				onclick={onTogglePresence}
				class="w-8 h-8 rounded-lg flex items-center justify-center transition-all {canEdit ? 'cursor-pointer' : 'cursor-default'}"
				style={present
					? `background:${person.color};border:2px solid ${person.color};`
					: 'border:2px solid #d1d5db;background:transparent;'}
			>
				{#if present}
					<svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				{/if}
			</button>
		{:else if present}
			{#if isPayer}
				<!-- Payer's own share is covered by fronting the bill — show no amount owed -->
				<div class="flex flex-col items-center gap-0.5">
					<span class="text-[9px] font-semibold text-sky-600 dark:text-sky-400">★ payer</span>
				</div>
			{:else}
				<button
					disabled={!canEdit}
					onclick={onTogglePaid}
					title="Organizational mark — doesn't affect settlement"
					class="flex flex-col items-center gap-0.5 px-0.5 py-0.5 rounded {canEdit ? 'cursor-pointer hover:opacity-75' : 'cursor-default'}"
				>
					<span class="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-none">{formatCurrency(shareAmount)}</span>
					<span class="text-[9px] font-semibold {paidStatus === 'marked' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}">{paidStatus === 'marked' ? '✓ paid' : '○ due'}</span>
				</button>
			{/if}
		{:else}
			<span class="text-gray-300 text-base">—</span>
		{/if}

	{:else}
		<!-- custom_amount -->
		{#if mode === 'edit'}
			<button
				disabled={!canEdit}
				onclick={openEdit}
				class="w-full h-full min-h-[40px] flex items-center justify-center {canEdit ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}"
			>
				{#if customAmount !== null}
					<div class="text-center">
						<span class="text-xs font-semibold text-gray-800 dark:text-gray-200 block">{formatCurrency(finalAmount)}</span>
						{#if !taxIncluded && event.tax_percentage && event.tax_percentage > 0}
							<span class="text-[9px] text-gray-400">+{event.tax_percentage}%</span>
						{/if}
					</div>
				{:else if canEdit}
					<span class="text-gray-300 text-lg font-light">+</span>
				{:else}
					<span class="text-gray-300">—</span>
				{/if}
			</button>
		{:else if customAmount !== null}
			{#if isPayer}
				<div class="flex flex-col items-center gap-0.5">
					<span class="text-[9px] font-semibold text-sky-600 dark:text-sky-400">★ payer</span>
				</div>
			{:else}
				<button
					disabled={!canEdit}
					onclick={onTogglePaid}
					title="Organizational mark — doesn't affect settlement"
					class="flex flex-col items-center gap-0.5 px-0.5 py-0.5 rounded {canEdit ? 'cursor-pointer hover:opacity-75' : 'cursor-default'}"
				>
					<span class="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-none">{formatCurrency(finalAmount)}</span>
					<span class="text-[9px] font-semibold {paidStatus === 'marked' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}">{paidStatus === 'marked' ? '✓ paid' : '○ due'}</span>
				</button>
			{/if}
		{:else}
			<span class="text-gray-300 text-base">—</span>
		{/if}
	{/if}
</div>

<!-- Fixed-position popup — not clipped by any overflow container -->
{#if editing}
	<div
		class="cell-popup fixed z-50 bg-white dark:bg-gray-800 border-2 border-indigo-400 dark:border-indigo-500 rounded-xl shadow-2xl p-3 flex flex-col gap-2"
		style={popupStyle}
	>
		<p class="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate">{person.name}</p>
		<input
			bind:this={popupInputEl}
			type="number"
			bind:value={inputValue}
			onkeydown={onKey}
			step="0.01"
			min="0"
			placeholder="0.00"
			class="w-full text-center text-sm font-medium border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
		/>
		{#if event.tax_percentage && event.tax_percentage > 0}
			<label class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
				<input
					type="checkbox"
					checked={!taxIncluded}
					onchange={(e) => { taxIncluded = !e.currentTarget.checked; }}
					class="rounded"
				/>
				Add tax ({event.tax_percentage}%)
			</label>
			{#if inputValue !== null && !Number.isNaN(inputValue) && inputValue > 0}
				{#if !taxIncluded}
					<p class="text-xs text-indigo-600 dark:text-indigo-400">→ {formatCurrency(inputValue * (1 + event.tax_percentage / 100))} total</p>
				{:else}
					<p class="text-xs text-gray-500 dark:text-gray-400">= {formatCurrency(inputValue)} (tax incl.)</p>
				{/if}
			{/if}
		{/if}
		<div class="flex gap-1.5">
			<button
				onclick={(e) => { e.stopPropagation(); commitAmount(); }}
				class="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1.5 rounded-lg font-medium"
			>Save</button>
			<button
				onclick={(e) => { e.stopPropagation(); editing = false; inputValue = customAmount; }}
				class="flex-1 text-xs bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-600 dark:text-gray-300 px-2 py-1.5 rounded-lg font-medium"
			>Cancel</button>
		</div>
	</div>
{/if}

{#if noting}
	<div
		class="cell-popup fixed z-50 bg-white dark:bg-gray-800 border-2 border-indigo-400 dark:border-indigo-500 rounded-xl shadow-2xl p-3 flex flex-col gap-2"
		style={popupStyle}
	>
		<p class="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate">{person.name} · {event.name}</p>
		<textarea
			bind:this={notingEl}
			bind:value={noteValue}
			onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitNote(); } if (e.key === 'Escape') { noting = false; } }}
			rows="3"
			placeholder="e.g. paid with pokemon card"
			class="w-full text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
		></textarea>
		<div class="flex gap-1.5">
			<button
				onclick={(e) => { e.stopPropagation(); commitNote(); }}
				class="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1.5 rounded-lg font-medium"
			>Save</button>
			{#if cellNote}
				<button
					onclick={(e) => { e.stopPropagation(); noteValue = ''; commitNote(); }}
					class="text-xs bg-gray-100 dark:bg-gray-600 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 text-gray-500 dark:text-gray-300 px-2 py-1.5 rounded-lg font-medium"
				>Clear</button>
			{/if}
			<button
				onclick={(e) => { e.stopPropagation(); noting = false; }}
				class="flex-1 text-xs bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-600 dark:text-gray-300 px-2 py-1.5 rounded-lg font-medium"
			>Cancel</button>
		</div>
	</div>
{/if}
