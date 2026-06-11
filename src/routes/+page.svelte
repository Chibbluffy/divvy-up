<!-- Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source. -->
<script lang="ts">
	let divvyName = $state('');
	let loading = $state(false);
	let err = $state('');

	async function createDivvy() {
		if (!divvyName.trim()) return;
		loading = true;
		err = '';
		try {
			const res = await fetch('/api/divvies', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: divvyName.trim() })
			});
			if (!res.ok) throw new Error((await res.json()).message ?? 'Failed to create');
			const { divvy } = await res.json();
			window.location.href = `/divvy/${divvy.id}?t=${divvy.owner_token}`;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Something went wrong';
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>DivvyUp — Split costs, not friendships</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 flex flex-col">
	<header class="px-6 py-5 flex items-center gap-3">
		<div class="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md">
			<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-6-6h12" />
			</svg>
		</div>
		<span class="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">DivvyUp</span>
	</header>

	<main class="flex-1 flex flex-col items-center justify-center px-4 pb-20">
		<div class="text-center mb-12 max-w-xl">
			<div class="inline-flex items-center gap-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full text-sm font-medium mb-6">
				<span class="w-2 h-2 bg-indigo-500 rounded-full"></span>
				No accounts. No logins. Just sharing.
			</div>
			<h1 class="text-5xl font-bold text-gray-900 dark:text-gray-100 tracking-tight leading-tight mb-4">
				Split costs<br />without the drama
			</h1>
			<p class="text-lg text-gray-500 dark:text-gray-400 leading-relaxed">
				Track who owes what across any shared expense —
				hotel stays, meals, activities, and more.
				Get a shareable link and settle up at the end.
			</p>
		</div>

		<div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-8">
			<h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-5">Start a new Divvy</h2>
			<form onsubmit={(e) => { e.preventDefault(); createDivvy(); }}>
				<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2" for="divvyName">
					What are you splitting?
				</label>
				<input
					id="divvyName"
					type="text"
					bind:value={divvyName}
					placeholder="e.g. Barcelona Trip, Cabin Weekend, Dinner..."
					class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm"
					disabled={loading}
				/>
				{#if err}
					<p class="mt-2 text-sm text-red-600">{err}</p>
				{/if}
				<button
					type="submit"
					disabled={!divvyName.trim() || loading}
					class="mt-4 w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold rounded-xl transition-colors duration-150 text-sm"
				>
					{loading ? 'Creating…' : 'Create Divvy →'}
				</button>
			</form>
		</div>

		<ul class="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 max-w-lg text-sm text-gray-400 dark:text-gray-500">
			{#each ['🏨 Hotel stays with partial nights', '🍕 Custom meal splits', '💸 Track who paid what', '🔗 Shareable links', '📱 Mobile friendly'] as feature}
				<li>{feature}</li>
			{/each}
		</ul>
	</main>

	<footer class="text-center text-xs text-gray-400 dark:text-gray-500 pb-6">
		Open source · No data sold · Built for anyone
	</footer>
</div>
