<script lang="ts">
  import BrowserHarness from '$lib/BrowserHarness.svelte';
</script>

<svelte:head>
  <title>SvelteKit SSR / Three.js</title>
</svelte:head>

<main class="ssr-shell">
  <h1>SvelteKit SSR / Three.js</h1>
  <p data-testid="ssr-marker">This shell is rendered by SvelteKit before the browser-only Three island mounts.</p>
  <BrowserHarness />
</main>
