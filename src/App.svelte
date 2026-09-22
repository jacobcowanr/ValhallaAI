<script>
  import { onMount } from "svelte";
  import "@fontsource/pirata-one";
  import ModelPicker from "./routes/ModelPicker.svelte";
  import VaultBrowser from "./routes/VaultBrowser.svelte";
  import AgentControl from "./routes/AgentControl.svelte";
  import Settings from "./routes/Settings.svelte";
  import logoWordmark from "./assets/ValhallaAI_Logo.png";

  const sections = [
    { id: "models", label: "Models & Chat", icon: "💬" },
    { id: "vault", label: "Vault Browser", icon: "🗂" },
    { id: "agents", label: "Agent Control", icon: "🤖" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  let activeTab = "models";

  // Sidebar can be hidden entirely — persisted so it stays hidden/shown
  // across restarts rather than resetting to open every launch.
  let sidebarOpen = true;

  onMount(() => {
    const saved = localStorage.getItem("valhallaai-sidebar-open");
    if (saved !== null) sidebarOpen = saved === "true";
  });

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    localStorage.setItem("valhallaai-sidebar-open", String(sidebarOpen));
  }
</script>

<div class="shell">
  {#if sidebarOpen}
    <aside class="sidebar">
      <nav>
        {#each sections as section}
          <button class:active={activeTab === section.id} on:click={() => (activeTab = section.id)}>
            <span class="icon">{section.icon}</span>
            {section.label}
          </button>
        {/each}
      </nav>
    </aside>
  {/if}

  <main>
    <div class="topbar">
      <button class="sidebar-toggle" on:click={toggleSidebar} title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}>
        {sidebarOpen ? "◀" : "▶"}
      </button>
    </div>

    <section class="content">
      {#if activeTab === "models"}
        <ModelPicker {logoWordmark} />
      {:else if activeTab === "vault"}
        <VaultBrowser />
      {:else if activeTab === "agents"}
        <AgentControl />
      {:else if activeTab === "settings"}
        <Settings />
      {/if}
    </section>
  </main>
</div>

<style>
  /*
   * Theme tokens — defined once here, referenced by every component's
   * <style> block via var(--token-name) instead of each one hardcoding
   * its own copy of the same colors. #a90303 is sampled directly from
   * src/assets/ValhallaAI_Logo.png (dominant pixel color), not guessed.
   */
  :global(:root) {
    --font-display: "Pirata One", "UnifrakturMaguntia", serif;
    --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial,
      sans-serif;

    --bg-page: #0d0d0d;
    --bg-surface: #1a1a1a;
    --bg-surface-raised: #212121;
    --bg-surface-hover: #262626;
    --border-color: #2f2f2f;

    --text-primary: #f2f2f2;
    --text-secondary: #a3a3a3;
    --text-muted: #737373;

    --accent: #a90303;
    --accent-hover: #c40404;
    --accent-text: #ffffff;
    --accent-soft-bg: #2a0e0e;
    --accent-soft-border: #4a1616;

    --danger: #dc3545;
    --danger-hover: #c82333;
    --success-bg: #16321f;
    --success-text: #4ade80;
    --warning-bg: #332008;
    --warning-text: #f0a83a;
    --warning-border: #5c3a10;
  }

  :global(body) {
    font-family: var(--font-body);
    background: var(--bg-page);
    color: var(--text-primary);
    margin: 0;
    padding: 0;
  }

  .shell {
    display: flex;
    min-height: 100vh;
  }

  /* Left sidebar — section nav only now; the big logo/tagline moved to
     ModelPicker's empty-chat state (main center of the screen) instead
     of living here permanently. */
  .sidebar {
    flex: 0 0 240px;
    background: var(--bg-surface);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    padding: 1.5rem 1rem;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  button {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    padding: 0.7rem 0.85rem;
    border: none;
    border-radius: 8px;
    background: none;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-align: left;
    transition: all 0.15s;
  }

  .icon {
    font-size: 1rem;
    width: 1.25rem;
    text-align: center;
    flex-shrink: 0;
  }

  button:hover {
    color: var(--text-primary);
    background: var(--bg-surface-hover);
  }

  button.active {
    color: var(--accent);
    background: var(--accent-soft-bg);
  }

  main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  /* Always-visible strip so the sidebar toggle is reachable even when the
     sidebar itself is hidden — without this there'd be no way back in. */
  .topbar {
    flex-shrink: 0;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-color);
  }

  .sidebar-toggle {
    width: auto;
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
    border-radius: 6px;
  }

  .sidebar-toggle:hover {
    color: var(--text-primary);
    background: var(--bg-surface-hover);
  }

  .content {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
  }
</style>
