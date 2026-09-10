<script lang="ts">
  import BrowserHarness from '$lib/BrowserHarness.svelte';
</script>

<svelte:head>
  <title>SvelteKit SSR / Cesium</title>
</svelte:head>

<main class="ssr-shell">
  <h1>SvelteKit SSR / Cesium</h1>
  <p data-testid="ssr-marker">This shell is rendered by SvelteKit before the browser-only Cesium island mounts.</p>
  <BrowserHarness />
</main>
