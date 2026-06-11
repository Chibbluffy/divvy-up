<!-- Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source. -->
<script lang="ts">
	import type { Divvy } from '$lib/types';

	let { divvy, onClose }: { divvy: Divvy; onClose: () => void } = $props();

	const origin = typeof window !== 'undefined' ? window.location.origin : '';
	const base = `${origin}/divvy/${divvy.id}`;

	const links = [
		{
			label: 'Owner link',
			url: `${base}?t=${divvy.owner_token}`,
			description: 'Full access: add/remove people and items, edit amounts, mark payments.',
			color: 'indigo',
			icon: '👑',
			warning: 'Only share with trusted co-organizers.'
		},
		{
			label: 'Edit link',
			url: `${base}?t=${divvy.edit_token}`,
			description: 'Can update amounts and mark payments, but cannot add/remove people or items.',
			color: 'amber',
			icon: '✏️',
			warning: null
		},
		{
			label: 'View-only link',
			url: `${base}?t=${divvy.view_token}`,
			description: 'Read-only access. Viewers can fork a copy to make their own editable version.',
			color: 'emerald',
			icon: '👁️',
			warning: null
		}
	];

	let copied = $state<string | null>(null);

	async function copyLink(url: string, label: string) {
		await navigator.clipboard.writeText(url);
		copied = label;
		setTimeout(() => { copied = null; }, 2000);
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

<div class="fixed inset-0 bg-black/40 modal-backdrop z-50 flex items-center justify-center p-4">
	<div
		bind:this={dialogEl}
		role="dialog"
		aria-modal="true"
		aria-labelledby="share-modal-title"
		tabindex="-1"
		class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6"
	>
		<div class="flex items-center justify-between mb-6">
			<h2 id="share-modal-title" class="text-lg font-bold text-gray-900 dark:text-gray-100">Share Divvy</h2>
			<button onclick={onClose} class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Close">
				<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<div class="space-y-3">
			{#each links as link}
				<div class="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
					<div class="flex items-center gap-2 mb-1">
						<span class="text-base">{link.icon}</span>
						<span class="font-semibold text-sm text-gray-800 dark:text-gray-200">{link.label}</span>
					</div>
					<p class="text-xs text-gray-500 dark:text-gray-400 mb-1">{link.description}</p>
					{#if link.warning}
						<p class="text-xs text-amber-600 font-medium mb-2">⚠ {link.warning}</p>
					{/if}
					<code class="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 block truncate mb-2">
						{link.url}
					</code>
					<button
						onclick={() => copyLink(link.url, link.label)}
						class="w-full py-2 text-sm font-medium rounded-lg transition-colors {
							copied === link.label
								? 'bg-emerald-100 text-emerald-700'
								: link.color === 'indigo' ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
								: link.color === 'amber' ? 'bg-amber-50 hover:bg-amber-100 text-amber-700'
								: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
						}"
					>
						{copied === link.label ? '✓ Copied!' : 'Copy link'}
					</button>
				</div>
			{/each}
		</div>

		<p class="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">
			These links are the only way to access this Divvy — keep the owner link safe.
		</p>
	</div>
</div>
