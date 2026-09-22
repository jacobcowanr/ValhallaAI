<script>
  import "@fontsource/pirata-one";
  import ModelPicker from "./routes/ModelPicker.svelte";
  import VaultBrowser from "./routes/VaultBrowser.svelte";
  import AgentControl from "./routes/AgentControl.svelte";
  import Settings from "./routes/Settings.svelte";
  import logoWordmark from "./assets/ValhallaAI_Logo.png";

  let activeTab = "models";
</script>

<main>
  <header>
    <img class="logo" src={logoWordmark} alt="ValhallaAI" />
    <p>Multi-agent orchestration • Model switching • Vault coordination</p>
  </header>

  <nav>
    <button class:active={activeTab === "models"} on:click={() => (activeTab = "models")}>
      Models & Chat
    </button>
    <button class:active={activeTab === "vault"} on:click={() => (activeTab = "vault")}>
      Vault Browser
    </button>
    <button class:active={activeTab === "agents"} on:click={() => (activeTab = "agents")}>
      Agent Control
    </button>
    <button class:active={activeTab === "settings"} on:click={() => (activeTab = "settings")}>
      ⚙ Settings
    </button>
  </nav>

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

  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    background: var(--bg-page);
    border-bottom: 1px solid var(--border-color);
    padding: 2rem;
    text-align: center;
  }

  header .logo {
    display: block;
    height: 56px;
    width: auto;
    margin: 0 auto;
  }

  header p {
    margin: 0.75rem 0 0 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  nav {
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-color);
    padding: 0 2rem;
    display: flex;
    gap: 0;
  }

  button {
    flex: 1;
    padding: 1rem;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-secondary);
    transition: all 0.2s;
    border-bottom: 3px solid transparent;
  }

  button:hover {
    color: var(--text-primary);
    background: var(--bg-surface-hover);
  }

  button.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .content {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
  }
</style>
