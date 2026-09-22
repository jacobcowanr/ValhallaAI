<script lang="ts">
  // MOCK — syncVault() below is a setTimeout stub, not a real git
  // operation. main.rs registers no Tauri commands, so there is no IPC
  // path from this UI to git at all yet. Same gap as AgentControl.svelte.
  // Use `git pull` / `git push` in vault/ directly for now.
  let vaultPath = "/vault";
  let syncStatus: "idle" | "syncing" = "idle";
  let lastSync: string | null = null;

  async function syncVault(): Promise<void> {
    syncStatus = "syncing";
    // TODO: Implement git pull/push
    setTimeout(() => {
      syncStatus = "idle";
      lastSync = new Date().toLocaleString();
    }, 1000);
  }
</script>

<div class="container">
  <h2>Vault Browser</h2>
  <p class="mock-notice">
    ⚠ Not wired up yet — "Sync Vault" doesn't actually run git. Use
    <code>git -C vault pull</code> / <code>git -C vault push</code> directly for now.
  </p>

  <div class="controls">
    <input type="text" bind:value={vaultPath} placeholder="Vault path" />
    <button on:click={syncVault} disabled={syncStatus === "syncing"}>
      {syncStatus === "syncing" ? "Syncing..." : "Sync Vault"}
    </button>
  </div>

  {#if lastSync}
    <p class="last-sync">Last sync: {lastSync}</p>
  {/if}

  <div class="browser">
    <div class="placeholder">
      <p>📁 Vault browser will display here</p>
      <p>- AGENT_SYNC.md (coordination log)</p>
      <p>- agents/ (agent configs)</p>
      <p>- skills/ (tool catalog)</p>
    </div>
  </div>
</div>

<style>
  .container {
    max-width: 800px;
  }

  h2 {
    margin-top: 0;
    font-family: var(--font-display);
    font-weight: 400;
    letter-spacing: 0.02em;
    color: var(--text-primary);
  }

  .mock-notice {
    background: var(--warning-bg);
    border: 1px solid var(--warning-border);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
    color: var(--warning-text);
    margin: 0 0 1rem 0;
  }

  .mock-notice code {
    background: var(--bg-surface-raised);
    color: var(--text-primary);
    padding: 2px 4px;
    border-radius: 2px;
    font-family: monospace;
    font-size: 0.8rem;
  }

  .controls {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-surface-raised);
    color: var(--text-primary);
  }

  button {
    padding: 0.5rem 1rem;
    background: var(--accent);
    color: var(--accent-text);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  }

  button:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .last-sync {
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .browser {
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 2rem;
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .placeholder {
    text-align: center;
    color: var(--text-muted);
  }

  .placeholder p {
    margin: 0.5rem 0;
  }
</style>
