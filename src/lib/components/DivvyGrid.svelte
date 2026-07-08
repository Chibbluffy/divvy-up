<!-- Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source. -->
<script lang="ts">
	import type { Person, Event, Intersection, AccessLevel } from '$lib/types';
	import { calculateEventShare, getPersonTotal, getFinalAmount, formatCurrency, formatCurrencyCompact, getRemainingAmount } from '$lib/calculations';
	import GridCell from './GridCell.svelte';

	let {
		people, events, intersections, mode, transpose,
		visiblePeople, visibleEvents, accessLevel,
		onEditPerson, onDeletePerson, onEditEvent, onDeleteEvent,
		onDuplicateEvent, onTogglePresence, onUpdateAmount, onTogglePaid,
		onMarkAllPaid, onMarkAllPaidEvent, onUpdateNote, onSplitRemaining, onSetAllRow, onSetAllCol,
		onReorderEvents = undefined,
		eventsWithImages = undefined
	}: {
		people: Person[]; events: Event[]; intersections: Intersection[];
		mode: 'edit' | 'payment'; transpose: boolean;
		visiblePeople: Person[]; visibleEvents: Event[];
		accessLevel: AccessLevel;
		onEditPerson: (p: Person) => void;
		onDeletePerson: (id: string) => void;
		onEditEvent: (e: Event) => void;
		onDeleteEvent: (id: string) => void;
		onDuplicateEvent: (id: string) => void;
		onTogglePresence: (eventId: string, personId: string) => void;
		onUpdateAmount: (eventId: string, personId: string, amount: number | null, taxIncluded: boolean, expression: string | null) => void;
		onTogglePaid: (eventId: string, personId: string) => void;
		onMarkAllPaid: (personId: string, marked: boolean) => void;
		onMarkAllPaidEvent: (eventId: string, marked: boolean) => void;
		onUpdateNote: (eventId: string, personId: string, note: string | null) => void;
		onSplitRemaining: (eventId: string) => void;
		onSetAllRow: (item: Person | Event, present: boolean) => void;
		onSetAllCol: (item: Person | Event, present: boolean) => void;
		onReorderEvents?: (orderedIds: string[]) => void;
		eventsWithImages?: Set<string>;
	} = $props();

	const isOwner = $derived(accessLevel === 'owner');
	const canEdit = $derived(accessLevel === 'owner' || accessLevel === 'edit');

	// Drag-to-reorder state (events only, !transpose, owner, edit mode)
	let dragGroupKey = $state<string | null>(null);
	let dragOverGroupKey = $state<string | null>(null);
	let dropPosition = $state<'before' | 'after'>('after');

	function evGroupKey(item: Person | Event): string {
		if (isPerson(item)) return item.id;
		const ev = item as Event;
		return ev.parent_event_id ?? ev.id;
	}

	function handleDragStart(e: DragEvent, rowItem: Person | Event) {
		dragGroupKey = evGroupKey(rowItem);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', dragGroupKey);
		}
	}

	function handleDragOver(e: DragEvent, rowItem: Person | Event) {
		if (!dragGroupKey) return;
		const overKey = evGroupKey(rowItem);
		if (overKey === dragGroupKey) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverGroupKey = overKey;
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		dropPosition = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
	}

	function handleDragLeave(e: DragEvent) {
		const related = e.relatedTarget as HTMLElement | null;
		if (!(e.currentTarget as HTMLElement).contains(related)) {
			dragOverGroupKey = null;
		}
	}

	function handleDrop(e: DragEvent, rowItem: Person | Event) {
		e.preventDefault();
		if (!dragGroupKey || !onReorderEvents) return;
		const overKey = evGroupKey(rowItem);
		if (overKey === dragGroupKey) { dragGroupKey = null; dragOverGroupKey = null; return; }

		// Ordered unique group keys from current visible order
		const seen = new Set<string>();
		const keys: string[] = [];
		for (const r of rowItems) {
			const k = evGroupKey(r);
			if (!seen.has(k)) { seen.add(k); keys.push(k); }
		}

		const fromKey = dragGroupKey;
		const filtered = keys.filter(k => k !== fromKey);
		const insertAt = filtered.indexOf(overKey) + (dropPosition === 'after' ? 1 : 0);
		filtered.splice(insertAt, 0, fromKey);

		// Expand group keys → ordered visible event IDs
		const orderedIds: string[] = [];
		for (const k of filtered) {
			for (const r of rowItems) {
				if (evGroupKey(r) === k) orderedIds.push((r as Event).id);
			}
		}

		dragGroupKey = null;
		dragOverGroupKey = null;
		onReorderEvents(orderedIds);
	}

	function handleDragEnd() {
		dragGroupKey = null;
		dragOverGroupKey = null;
	}

	// In default mode: rows=events, cols=people. Transposed: rows=people, cols=events.
	const rowItems = $derived(transpose ? visiblePeople : visibleEvents);
	const colItems = $derived(transpose ? visibleEvents : visiblePeople);

	const COL_W = 60; // px per data column
	const TOTAL_W = 80; // px for total column
	const MIN_ROW_LABEL_W = 175; // keeps buttons visible
	let rowLabelW = $state(175);

	// Header height: auto-sized from label length, capped at 200px, user-draggable.
	// Approximation: 11px semibold ≈ 7px avg char width; sin(45°) = Math.SQRT1_2.
	const defaultHeaderHeight = 100;
	let userHeaderHeight = $state<number | null>(null);
	const headerHeight = $derived(userHeaderHeight ?? defaultHeaderHeight);
	// Max width for diagonal text before it gets ellipsized at the current header height.
	// Subtract 12px buffer so the ellipsis never crowds the top edge.
	const maxDiagTextWidth = $derived(Math.max(20, Math.floor((headerHeight - 28) / Math.SQRT1_2) - 12));
	const maxFooterNumLen = $derived(colItems.reduce((m, c) => Math.max(m, formatCurrencyCompact(getColTotal(c)).length), 5));
	const footerHeight = $derived(Math.max(52, Math.ceil(12 + maxFooterNumLen * 7 * Math.SQRT1_2)));

	function startHeaderDrag(e: MouseEvent) {
		e.preventDefault();
		const startY = e.clientY;
		const startH = headerHeight;
		function onMove(mv: MouseEvent) { userHeaderHeight = Math.max(100, startH + mv.clientY - startY); }
		function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	function startHeaderDragTouch(e: TouchEvent) {
		const startY = e.touches[0].clientY;
		const startH = headerHeight;
		function onMove(mv: TouchEvent) { userHeaderHeight = Math.max(100, startH + mv.touches[0].clientY - startY); }
		function onEnd() { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); }
		window.addEventListener('touchmove', onMove, { passive: true });
		window.addEventListener('touchend', onEnd);
	}

	function startRowDrag(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const startX = e.clientX;
		const startW = rowLabelW;
		function onMove(mv: MouseEvent) { rowLabelW = Math.max(MIN_ROW_LABEL_W, startW + mv.clientX - startX); }
		function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	function startRowDragTouch(e: TouchEvent) {
		e.stopPropagation();
		const startX = e.touches[0].clientX;
		const startW = rowLabelW;
		function onMove(mv: TouchEvent) { rowLabelW = Math.max(MIN_ROW_LABEL_W, startW + mv.touches[0].clientX - startX); }
		function onEnd() { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); }
		window.addEventListener('touchmove', onMove, { passive: true });
		window.addEventListener('touchend', onEnd);
	}

	// Scroll sync between header and body
	let headerScrollEl: HTMLDivElement;
	let bodyScrollEl: HTMLDivElement;

	function onBodyScroll() {
		if (headerScrollEl) headerScrollEl.scrollLeft = bodyScrollEl.scrollLeft;
	}

	// Forward scroll events from the sticky header down to the body,
	// so hovering/touching the header area still scrolls the grid vertically.
	$effect(() => {
		if (!headerScrollEl || !bodyScrollEl) return;
		const body = bodyScrollEl;

		function onWheel(e: WheelEvent) {
			if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
				e.preventDefault();
				body.scrollTop += e.deltaY;
			}
			// deltaX is handled naturally by the header's own overflow-x scroll
		}

		let touchStartY = 0;
		function onTouchStart(e: TouchEvent) {
			touchStartY = e.touches[0].clientY;
		}
		function onTouchMove(e: TouchEvent) {
			const dy = touchStartY - e.touches[0].clientY;
			e.preventDefault();
			body.scrollTop += dy;
			touchStartY = e.touches[0].clientY;
		}

		headerScrollEl.addEventListener('wheel', onWheel, { passive: false });
		headerScrollEl.addEventListener('touchstart', onTouchStart, { passive: true });
		headerScrollEl.addEventListener('touchmove', onTouchMove, { passive: false });

		return () => {
			headerScrollEl.removeEventListener('wheel', onWheel);
			headerScrollEl.removeEventListener('touchstart', onTouchStart);
			headerScrollEl.removeEventListener('touchmove', onTouchMove);
		};
	});

	function isPerson(item: Person | Event): item is Person {
		return 'color' in item;
	}

	function getEventId(row: Person | Event, col: Person | Event) {
		return transpose ? (col as Event).id : (row as Event).id;
	}
	function getPersonId(row: Person | Event, col: Person | Event) {
		return transpose ? (row as Person).id : (col as Person).id;
	}
	function getEvent(row: Person | Event, col: Person | Event): Event {
		const id = getEventId(row, col);
		return events.find(e => e.id === id)!;
	}
	function getPerson(row: Person | Event, col: Person | Event): Person {
		const id = getPersonId(row, col);
		return people.find(p => p.id === id)!;
	}

	function colLabel(item: Person | Event) {
		return transpose ? (item as Event).name : (item as Person).name;
	}
	function colColor(item: Person | Event) {
		return transpose ? '' : (item as Person).color;
	}
	function rowLabel(item: Person | Event) {
		return transpose ? (item as Person).name : (item as Event).name;
	}
	function rowColor(item: Person | Event) {
		return transpose ? (item as Person).color : '';
	}
	function rowSubLabel(item: Person | Event) {
		if (transpose) return '';
		const ev = item as Event;
		return `${formatCurrency(ev.total_cost)} · ${ev.type === 'even_split' ? 'even' : 'custom'}`;
	}

	function getColTotal(colItem: Person | Event): number {
		if (transpose) return (colItem as Event).total_cost;
		return getPersonTotal((colItem as Person).id, visibleEvents, intersections);
	}

	function getRowTotal(rowItem: Person | Event): number {
		if (transpose) return getPersonTotal((rowItem as Person).id, visibleEvents, intersections);
		return (rowItem as Event).total_cost;
	}

	function hasRemaining(rowItem: Person | Event): boolean {
		if (transpose) return false;
		const ev = rowItem as Event;
		if (ev.type !== 'custom_amount' || !ev.total_cost) return false;
		return getRemainingAmount(ev, intersections) > 0.005;
	}

	const tableWidth = $derived(rowLabelW + colItems.length * COL_W + TOTAL_W);

	// Per-event share amounts for payment mode display (even_split events need this since they have no custom_amount)
	const eventShares = $derived(
		Object.fromEntries(
			visibleEvents.map(ev => [
				ev.id,
				calculateEventShare(ev, intersections.filter(i => i.event_id === ev.id))
			])
		)
	);

	// Select-all helpers — only even_split events have checkboxes worth bulk-toggling
	function rowIsEvenSplitRelevant(rowItem: Person | Event): boolean {
		if (!transpose) return (rowItem as Event).type === 'even_split';
		return visibleEvents.some(e => e.type === 'even_split');
	}
	function colIsEvenSplitRelevant(colItem: Person | Event): boolean {
		if (transpose) return (colItem as Event).type === 'even_split';
		return visibleEvents.some(e => e.type === 'even_split');
	}
	function rowAllPresent(rowItem: Person | Event): boolean {
		if (!transpose) {
			const ev = rowItem as Event;
			if (ev.type !== 'even_split') return false;
			return visiblePeople.length > 0 && visiblePeople.every(p =>
				intersections.find(i => i.event_id === ev.id && i.person_id === p.id)?.present ?? false
			);
		}
		const person = rowItem as Person;
		const evens = visibleEvents.filter(e => e.type === 'even_split');
		return evens.length > 0 && evens.every(ev =>
			intersections.find(i => i.event_id === ev.id && i.person_id === person.id)?.present ?? false
		);
	}
	function personColAllMarked(personId: string): boolean {
		const relevant = intersections.filter(i => i.person_id === personId);
		return relevant.length > 0 && relevant.every(i => i.mark === 'marked');
	}
	function eventRowAllMarked(eventId: string): boolean {
		const relevant = intersections.filter(i => i.event_id === eventId);
		return relevant.length > 0 && relevant.every(i => i.mark === 'marked');
	}

	function colAllPresent(colItem: Person | Event): boolean {
		if (transpose) {
			const ev = colItem as Event;
			if (ev.type !== 'even_split') return false;
			return visiblePeople.length > 0 && visiblePeople.every(p =>
				intersections.find(i => i.event_id === ev.id && i.person_id === p.id)?.present ?? false
			);
		}
		const person = colItem as Person;
		const evens = visibleEvents.filter(e => e.type === 'even_split');
		return evens.length > 0 && evens.every(ev =>
			intersections.find(i => i.event_id === ev.id && i.person_id === person.id)?.present ?? false
		);
	}
</script>

<div class="flex flex-col overflow-hidden flex-1">
	<!-- Header scroll area (no vertical clip, horizontal synced to body) -->
	<div
		bind:this={headerScrollEl}
		class="overflow-x-auto overflow-y-visible flex-shrink-0"
		style="scrollbar-width: none; -webkit-overflow-scrolling: touch;"
	>
		<table style="width: {tableWidth}px; min-width: {tableWidth}px; table-layout: fixed; border-collapse: separate; border-spacing: 0;">
			<colgroup>
				<col style="width: {rowLabelW}px; min-width: {rowLabelW}px;" />
				{#each colItems as _}<col style="width: {COL_W}px; min-width: {COL_W}px;" />{/each}
				<col style="width: {TOTAL_W}px; min-width: {TOTAL_W}px;" />
			</colgroup>
			<thead>
				<!-- Diagonal name row -->
				<tr>
					<th class="sticky left-0 z-10 bg-white dark:bg-gray-900 border-b border-r border-gray-200 dark:border-gray-700 px-3 pb-2 align-bottom relative" style="height: {headerHeight}px; width: {rowLabelW}px; min-width: {rowLabelW}px;">
						<span class="text-xs text-gray-400 dark:text-gray-500 font-medium">{transpose ? 'Person ↓ / Event →' : 'Event ↓ / Person →'}</span>
						<!-- Row label width drag handle -->
						<div
							class="absolute top-0 right-0 w-2 h-full cursor-ew-resize z-20 hover:bg-indigo-400/20 dark:hover:bg-indigo-500/20 transition-colors"
							title="Drag to resize row labels"
							onmousedown={startRowDrag}
							ontouchstart={startRowDragTouch}
						></div>
					</th>
					{#each colItems as colItem}
						<th
							class="border-b border-gray-100 dark:border-gray-700 p-0"
							style="height: {headerHeight}px; width: {COL_W}px; min-width: {COL_W}px; position: relative; overflow: visible; vertical-align: bottom;"
							title={colLabel(colItem)}
						>
							<!-- diagonal text: starts at bottom-center, goes upper-right; first char stays in-column -->
							<div style="
								position: absolute;
								bottom: 28px;
								left: 50%;
								transform-origin: left bottom;
								transform: rotate(-45deg);
								white-space: nowrap;
								overflow: hidden;
								text-overflow: ellipsis;
								max-width: {maxDiagTextWidth}px;
								font-size: 11px;
								font-weight: 600;
								line-height: 1.2;
								color: {colColor(colItem) || 'var(--col-header-text)'};
							">
								{colLabel(colItem)}
							</div>
						</th>
					{/each}
					<th class="border-b border-gray-200 dark:border-gray-700 p-0" style="height: {headerHeight}px; width: {TOTAL_W}px; position: relative; overflow: visible; vertical-align: bottom;">
						<div style="position: absolute; bottom: 28px; left: 50%; transform-origin: left bottom; transform: rotate(-45deg); white-space: nowrap; font-size: 11px; font-weight: 600; line-height: 1.2; color: var(--col-header-text);">Total</div>
					</th>
				</tr>

				<!-- Action row (owner actions, mark-all-paid, or select-all) -->
				{#if isOwner || mode === 'payment' || (canEdit && mode === 'edit')}
					<tr class="bg-gray-50/80 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-600">
						<th class="sticky left-0 z-10 bg-gray-50 dark:bg-gray-700 border-r border-gray-200 dark:border-gray-600 px-2 py-1 relative">
							{#if mode === 'payment'}
								<span class="text-xs text-gray-400 dark:text-gray-500">Payments</span>
							{:else}
								<span class="text-xs text-gray-400 dark:text-gray-500">Actions</span>
							{/if}
							<div
								class="absolute top-0 right-0 w-2 h-full cursor-ew-resize z-20 hover:bg-indigo-400/20 dark:hover:bg-indigo-500/20 transition-colors"
								onmousedown={startRowDrag}
								ontouchstart={startRowDragTouch}
							></div>
						</th>
						{#each colItems as colItem}
							<th class="border-r border-gray-100 dark:border-gray-700 p-1 text-center">
								{#if mode === 'payment' && canEdit}
									{#if !transpose}
										{@const allMarked = personColAllMarked((colItem as Person).id)}
										<button
											onclick={() => onMarkAllPaid((colItem as Person).id, !allMarked)}
											class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-200 font-medium transition-colors whitespace-nowrap"
											title="{allMarked ? 'Unmark all' : 'Mark all'} for {colLabel(colItem)}"
										>{allMarked ? '☐ all' : '✓ all'}</button>
									{:else}
										{@const allMarked = eventRowAllMarked((colItem as Event).id)}
										<button
											onclick={() => onMarkAllPaidEvent((colItem as Event).id, !allMarked)}
											class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-200 font-medium transition-colors whitespace-nowrap"
											title="{allMarked ? 'Unmark all' : 'Mark all'} for {colLabel(colItem)}"
										>{allMarked ? '☐ all' : '✓ all'}</button>
									{/if}
								{:else if isOwner}
									<div class="flex flex-col items-center gap-1">
										<div class="flex items-center justify-center gap-0.5">
											<button
												onclick={() => { if (transpose) onEditEvent(colItem as Event); else onEditPerson(colItem as Person); }}
												class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
												title="Edit"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
												</svg>
											</button>
											<button
												onclick={() => { if (transpose) onDeleteEvent((colItem as Event).id); else onDeletePerson((colItem as Person).id); }}
												class="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
												title="Delete"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
												</svg>
											</button>
										</div>
										{#if mode === 'edit' && colIsEvenSplitRelevant(colItem)}
											{@const allPresent = colAllPresent(colItem)}
											<button
												onclick={() => onSetAllCol(colItem, !allPresent)}
												class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-200 font-medium transition-colors whitespace-nowrap"
												title="{allPresent ? 'Deselect all' : 'Select all'} for {colLabel(colItem)}"
											>{allPresent ? '☐ all' : '☑ all'}</button>
										{/if}
									</div>
								{:else if canEdit && mode === 'edit' && colIsEvenSplitRelevant(colItem)}
									{@const allPresent = colAllPresent(colItem)}
									<button
										onclick={() => onSetAllCol(colItem, !allPresent)}
										class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-200 font-medium transition-colors whitespace-nowrap"
										title="{allPresent ? 'Deselect all' : 'Select all'} for {colLabel(colItem)}"
									>{allPresent ? '☐ all' : '☑ all'}</button>
								{/if}
							</th>
						{/each}
						<th class="border-l border-gray-200 dark:border-gray-600"></th>
					</tr>
				{/if}
			</thead>
		</table>
	</div>

	<!-- Header height drag handle -->
	<div
		class="flex items-center justify-center h-2.5 flex-shrink-0 cursor-ns-resize group border-b border-gray-200 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
		title="Drag to resize column headers"
		onmousedown={startHeaderDrag}
		ontouchstart={startHeaderDragTouch}
	>
		<div class="w-8 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-indigo-400 dark:group-hover:bg-indigo-500 transition-colors"></div>
	</div>

	<!-- Body scroll area -->
	<div
		bind:this={bodyScrollEl}
		onscroll={onBodyScroll}
		class="overflow-auto flex-1"
		style="max-height: max(180px, calc(100vh - 320px));"
	>
		<table style="width: {tableWidth}px; min-width: {tableWidth}px; table-layout: fixed; border-collapse: separate; border-spacing: 0;">
			<colgroup>
				<col style="width: {rowLabelW}px; min-width: {rowLabelW}px;" />
				{#each colItems as _}<col style="width: {COL_W}px; min-width: {COL_W}px;" />{/each}
				<col style="width: {TOTAL_W}px; min-width: {TOTAL_W}px;" />
			</colgroup>
			<tbody>
				{#each rowItems as rowItem (isPerson(rowItem) ? rowItem.id : rowItem.id)}
					{@const canDrag = isOwner && !transpose && mode === 'edit' && !!onReorderEvents}
					{@const isRowDragging = canDrag && dragGroupKey !== null && evGroupKey(rowItem) === dragGroupKey}
					{@const isDropTarget = canDrag && dragOverGroupKey !== null && evGroupKey(rowItem) === dragOverGroupKey}
					<tr
						class="group hover:bg-gray-50/40 dark:hover:bg-gray-700/40 transition-colors {isRowDragging ? 'opacity-30' : ''}"
						style="{isDropTarget && dropPosition === 'before' ? 'box-shadow: inset 0 2px 0 #6366f1;' : ''}{isDropTarget && dropPosition === 'after' ? 'box-shadow: inset 0 -2px 0 #6366f1;' : ''}"
						draggable={canDrag || undefined}
						ondragstart={canDrag ? (e) => handleDragStart(e, rowItem) : undefined}
						ondragover={canDrag ? (e) => handleDragOver(e, rowItem) : undefined}
						ondragleave={canDrag ? handleDragLeave : undefined}
						ondrop={canDrag ? (e) => handleDrop(e, rowItem) : undefined}
						ondragend={canDrag ? handleDragEnd : undefined}
					>
						<!-- Row label -->
						<td class="sticky left-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 p-0 relative" style="min-width: {rowLabelW}px; max-width: {rowLabelW}px;">
							<div
								class="absolute top-0 right-0 w-2 h-full cursor-ew-resize z-10 hover:bg-indigo-400/20 dark:hover:bg-indigo-500/20 transition-colors"
								onmousedown={startRowDrag}
								ontouchstart={startRowDragTouch}
							></div>
							<div class="px-3 py-1.5 flex flex-col gap-0.5 min-w-0">
								<!-- Name + hover actions row -->
								<div class="flex items-center gap-1 min-w-0 relative">
									{#if canDrag}
										<span class="flex-shrink-0 text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing" title="Drag to reorder">
											<svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
												<circle cx="9" cy="5" r="1.8"/><circle cx="15" cy="5" r="1.8"/>
												<circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/>
												<circle cx="9" cy="19" r="1.8"/><circle cx="15" cy="19" r="1.8"/>
											</svg>
										</span>
									{/if}
									{#if rowColor(rowItem)}
										<span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: {rowColor(rowItem)};"></span>
									{/if}
									<span class="font-semibold text-gray-800 dark:text-gray-200 truncate text-xs flex-1 min-w-0" title={rowLabel(rowItem)}>{rowLabel(rowItem)}</span>
									{#if !transpose && !isPerson(rowItem) && eventsWithImages?.has((rowItem as Event).id)}
										<span class="flex-shrink-0 text-gray-300 dark:text-gray-600 group-hover:opacity-0 transition-opacity" title="Has receipt photos">
											<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
											</svg>
										</span>
									{/if}
									<!-- Hover-only destructive actions (edit mode only) -->
									{#if isOwner && mode === 'edit'}
										<div class="absolute right-0 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 hover-show transition-opacity bg-white dark:bg-gray-900 pl-1">
											<button
												onclick={() => { if (transpose) onEditPerson(rowItem as Person); else onEditEvent(rowItem as Event); }}
												class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
												title="Edit"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
												</svg>
											</button>
											{#if !transpose}
												<button
													onclick={() => onDuplicateEvent((rowItem as Event).id)}
													class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
													title="Duplicate"
												>
													<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
													</svg>
												</button>
											{/if}
											<button
												onclick={() => { if (transpose) onDeletePerson((rowItem as Person).id); else onDeleteEvent((rowItem as Event).id); }}
												class="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 dark:text-gray-500 hover:text-red-500"
												title="Delete"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
												</svg>
											</button>
										</div>
									{/if}
								</div>
								<!-- Sub-label (cost + type) -->
								{#if rowSubLabel(rowItem)}
									<p class="text-xs text-gray-400 dark:text-gray-500 ml-4">{rowSubLabel(rowItem)}</p>
								{/if}
								<!-- Remaining / over indicator for custom amount events -->
								{#if !transpose && !isPerson(rowItem) && (rowItem as Event).type === 'custom_amount' && mode === 'edit'}
									{@const rem = getRemainingAmount(rowItem as Event, intersections)}
									{#if rem > 0.005}
										<p class="text-xs ml-4 font-medium text-amber-600">{formatCurrency(rem)} left to assign</p>
									{:else if rem < -0.005}
										<p class="text-xs ml-4 font-medium text-red-500">{formatCurrency(-rem)} over budget</p>
									{:else if intersections.some(i => i.event_id === (rowItem as Event).id && i.custom_amount !== null)}
										<p class="text-xs ml-4 font-medium text-emerald-600">Fully allocated</p>
									{/if}
								{/if}
								<!-- Split remaining — always visible when applicable -->
								{#if !transpose && hasRemaining(rowItem) && mode === 'edit' && canEdit}
									<button
										onclick={() => onSplitRemaining((rowItem as Event).id)}
										class="ml-4 mt-0.5 text-left text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-100 hover:underline transition-colors"
									>÷ Assign remaining tip…</button>
								{/if}
								<!-- Select all in this row -->
								{#if canEdit && mode === 'edit' && rowIsEvenSplitRelevant(rowItem)}
									{@const allPresent = rowAllPresent(rowItem)}
									<button
										onclick={() => onSetAllRow(rowItem, !allPresent)}
										class="ml-4 mt-0.5 text-left text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100 hover:underline transition-colors"
									>{allPresent ? '☐ Deselect all' : '☑ Select all'}</button>
								{/if}
								<!-- Toggle all for this person row (transposed payment mode) -->
								{#if transpose && mode === 'payment' && canEdit}
									{@const allMarked = personColAllMarked((rowItem as Person).id)}
									<button
										onclick={() => onMarkAllPaid((rowItem as Person).id, !allMarked)}
										class="ml-4 mt-0.5 text-left text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-100 hover:underline transition-colors"
									>{allMarked ? '☐ Unmark all' : '✓ Mark all'}</button>
								{/if}
								<!-- Toggle all for this event row (default payment mode) -->
								{#if !transpose && mode === 'payment' && canEdit && !isPerson(rowItem)}
									{@const allMarked = eventRowAllMarked((rowItem as Event).id)}
									<button
										onclick={() => onMarkAllPaidEvent((rowItem as Event).id, !allMarked)}
										class="ml-4 mt-0.5 text-left text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-100 hover:underline transition-colors"
									>{allMarked ? '☐ Unmark all' : '✓ Mark all'}</button>
								{/if}
							</div>
						</td>

						<!-- Data cells -->
						{#each colItems as colItem}
							{@const ev = getEvent(rowItem, colItem)}
							{@const person = getPerson(rowItem, colItem)}
							{@const ix = intersections.find(i => i.event_id === ev.id && i.person_id === person.id)}
							<td class="border-b border-r border-gray-100 dark:border-gray-700 p-0" style="width: {COL_W}px;">
								<GridCell
									event={ev}
									{person}
									{ix}
									{mode}
									{canEdit}
									shareAmount={eventShares[ev.id]?.[person.id] ?? 0}
									onTogglePresence={() => onTogglePresence(ev.id, person.id)}
									onUpdateAmount={(amount, taxIncluded, expression) => onUpdateAmount(ev.id, person.id, amount, taxIncluded, expression)}
									onTogglePaid={() => onTogglePaid(ev.id, person.id)}
									onUpdateNote={(note) => onUpdateNote(ev.id, person.id, note)}
								/>
							</td>
						{/each}

						<!-- Row total -->
						<td class="border-b border-l border-gray-100 dark:border-gray-700 px-2 py-2 text-right font-semibold text-gray-700 dark:text-gray-300 text-xs bg-gray-50/60 dark:bg-gray-800/60 whitespace-nowrap">
							{formatCurrency(getRowTotal(rowItem))}
						</td>
					</tr>
				{/each}

				<!-- Column totals footer -->
				<tr class="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
					<td class="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide relative" style="height: {footerHeight}px; vertical-align: middle;">
						Total spent
						<div
							class="absolute top-0 right-0 w-2 h-full cursor-ew-resize z-10 hover:bg-indigo-400/20 dark:hover:bg-indigo-500/20 transition-colors"
							onmousedown={startRowDrag}
							ontouchstart={startRowDragTouch}
						></div>
					</td>
					{#each colItems as colItem}
						<td class="p-0" style="width: {COL_W}px; height: {footerHeight}px; position: relative; overflow: visible; vertical-align: top;">
							<div style="position: absolute; top: 8px; left: 50%; transform-origin: left top; transform: rotate(45deg); white-space: nowrap; font-size: 11px; font-weight: 700; line-height: 1.2; color: var(--col-header-text);">{formatCurrencyCompact(getColTotal(colItem))}</div>
						</td>
					{/each}
					<td class="p-0" style="width: {TOTAL_W}px; height: {footerHeight}px; position: relative; overflow: visible; vertical-align: top;">
						<div style="position: absolute; top: 8px; left: 50%; transform-origin: left top; transform: rotate(45deg); white-space: nowrap; font-size: 11px; font-weight: 700; line-height: 1.2; color: #6366f1;">{formatCurrencyCompact(visibleEvents.reduce((s, e) => s + e.total_cost, 0))}</div>
					</td>
				</tr>
			</tbody>
		</table>

		<!-- Scroll spacer — lets the totals row scroll toward mid-screen -->
		<div
			class="flex flex-col items-center justify-start pt-10 gap-1.5 text-gray-300 dark:text-gray-700 select-none"
			style="min-height: 45vh; width: {tableWidth}px;"
		>
			<p class="text-base font-semibold text-gray-400 dark:text-gray-600 tabular-nums">
				{formatCurrency(visibleEvents.reduce((s, e) => s + e.total_cost, 0))} total
			</p>
			<p class="text-xs">
				{visibleEvents.length} {visibleEvents.length === 1 ? 'item' : 'items'} · {visiblePeople.length} {visiblePeople.length === 1 ? 'person' : 'people'}
			</p>
			<p class="mt-5 text-[9px] uppercase tracking-widest font-medium">DivvyUp</p>
		</div>
	</div>
</div>
