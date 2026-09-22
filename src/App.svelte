<script>
  import ModelPicker from "./routes/ModelPicker.svelte";
  import VaultBrowser from "./routes/VaultBrowser.svelte";
  import AgentControl from "./routes/AgentControl.svelte";
  import Settings from "./routes/Settings.svelte";

  let activeTab = "models";


<main>
  <header>
    <h1>Vahalla</h1>
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
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
      Arial, sans-serif;
    background: #fafafa;
    color: #333;
    margin: 0;
    padding: 0;
  }

  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 2rem;
    text-align: center;
  }

  header h1 {
    margin: 0;
    font-size: 2.5rem;
    font-weight: 700;
  }

  header p {
    margin: 0.5rem 0 0 0;
    font-size: 0.9rem;
    opacity: 0.9;
  }

  nav {
    background: white;
    border-bottom: 1px solid #e0e0e0;
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
    color: #666;
    transition: all 0.2s;
    border-bottom: 3px solid transparent;
  }

  button:hover {
    color: #333;
    background: #f5f5f5;
  }

  button.active {
    color: #667eea;
    border-bottom-color: #667eea;
  }

  .content {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
  }
</style>
