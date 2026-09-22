<script>
  let vaultPath = "/vault";
  let syncStatus = "idle";
  let lastSync = null;

  async function syncVault() {
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
  }

  .controls {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  button {
    padding: 0.5rem 1rem;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  }

  button:hover:not(:disabled) {
    background: #764ba2;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .last-sync {
    font-size: 0.9rem;
    color: #666;
  }

  .browser {
    background: #f5f5f5;
    border-radius: 4px;
    padding: 2rem;
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .placeholder {
    text-align: center;
    color: #999;
  }

  .placeholder p {
    margin: 0.5rem 0;
  }
</style>
