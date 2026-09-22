<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/tauri";
  import { inTauri } from "../lib/provider-keys";

  interface VaultStatus {
    files: string[];
    git_status: string;
    last_commit: string;
  }

  let files: string[] = [];
  let gitStatus = "";
  let lastCommit = "";
  let error = "";
  let loading = false;

  async function refresh(): Promise<void> {
    if (!inTauri()) {
      error = "Not inside the desktop app. The vault list is read from this project when you run npm run tauri-dev.";
      return;
    }
    loading = true;
    error = "";
    try {
      const status = await invoke<VaultStatus>("vault_status");
      files = status.files;
      gitStatus = status.git_status;
      lastCommit = status.last_commit;
    } catch (err) {
      error = typeof err === "string" ? err : err instanceof Error ? err.message : "Could not read the vault";
    }
    loading = false;
  }

  onMount(() => {
    void refresh();
  });
</script>

<div class="container">
  <h2>Vault Browser</h2>
  <p class="mock-notice">
    Lists the files in <code>vault/</code> and the git status of that folder. It does not pull or push.
  </p>

  <div class="controls">
    <button on:click={refresh} disabled={loading}>
      {loading ? "Refreshing..." : "Refresh"}
    </button>
  </div>

  {#if error}
    <p class="last-sync">{error}</p>
  {/if}
  {#if lastCommit}
    <p class="last-sync">Last commit touching AGENT_SYNC.md: {lastCommit}</p>
  {/if}
  {#if gitStatus}
    <pre class="status">{gitStatus}</pre>
  {/if}

  <div class="browser">
    {#if files.length === 0}
      <div class="placeholder">
        <p>No vault files read yet.</p>
      </div>
    {:else}
      <ul class="file-list">
        {#each files as file}
          <li>{file}</li>
        {/each}
      </ul>
    {/if}
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

  .status {
    margin: 0 0 1rem 0;
    white-space: pre-wrap;
    font-size: 0.8rem;
    background: var(--bg-surface-raised);
    color: var(--text-primary);
    padding: 0.5rem;
    border-radius: 4px;
  }

  .browser {
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 1rem 1.5rem;
    min-height: 200px;
  }

  .file-list {
    margin: 0;
    padding-left: 1.2rem;
    color: var(--text-primary);
  }

  .file-list li {
    margin: 0.25rem 0;
    font-family: monospace;
    font-size: 0.85rem;
  }

  .placeholder {
    text-align: center;
    color: var(--text-muted);
  }

  .placeholder p {
    margin: 0.5rem 0;
  }
</style>
