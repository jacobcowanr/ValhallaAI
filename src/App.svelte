<script>
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
</script>

<div class="shell">
  <aside class="sidebar">
    <div class="sidebar-header">
      <img class="logo" src={logoWordmark} alt="ValhallaAI" />
      <p>Multi-agent orchestration • Model switching • Vault coordination</p>
    </div>

    <nav>
      {#each sections as section}
        <button class:active={activeTab === section.id} on:click={() => (activeTab = section.id)}>
          <span class="icon">{section.icon}</span>
          {section.label}
        </button>
      {/each}
    </nav>
  </aside>

  <main>
    <section class="content">
      {#if activeTab === "models"}
        <ModelPicker />
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

  /* Left sidebar — logo + section nav, Gemini-style vertical layout
     instead of the previous horizontal tab bar under the header. */
  .sidebar {
    flex: 0 0 240px;
    background: var(--bg-surface);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    padding: 1.5rem 1rem;
  }

  .sidebar-header {
    text-align: center;
    padding: 0.5rem 0 1.5rem 0;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--border-color);
  }

  .sidebar-header .logo {
    display: block;
    height: 34px;
    width: auto;
    margin: 0 auto;
  }

  .sidebar-header p {
    margin: 0.6rem 0 0 0;
    font-size: 0.7rem;
    line-height: 1.4;
    color: var(--text-secondary);
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

  .content {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
  }
</style>
