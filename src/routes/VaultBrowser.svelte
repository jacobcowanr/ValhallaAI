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

  let selected: string | null = null;
  let content = "";
  let contentError = "";
  let loadingFile = false;
  let copied = false;
  let copyTimer: ReturnType<typeof setTimeout>;

  async function openFile(path: string): Promise<void> {
    if (!inTauri()) return;
    selected = path;
    content = "";
    contentError = "";
    loadingFile = true;
    try {
      content = await invoke<string>("vault_file", { path });
    } catch (err) {
      contentError = typeof err === "string" ? err : err instanceof Error ? err.message : "Could not read that file";
    }
    loadingFile = false;
  }

  function closeFile(): void {
    selected = null;
    content = "";
    contentError = "";
  }

  // Same clipboard approach as the chat copy button: the Tauri allowlist is
  // {"all": false}, so the built-in clipboard module is unavailable and the
  // plain web API is used instead.
  async function copyContent(): Promise<void> {
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }

  // Refreshing can remove the open file (an outbox cleared by the relay, say).
  // Dropping the stale pane is better than showing content for a file the list
  // no longer has.
  $: if (selected && files.length > 0 && !files.includes(selected)) closeFile();

  $: lineCount = content ? content.split("\n").length : 0;

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
          <li>
            <button
              class="file-btn"
              class:selected={selected === file}
              on:click={() => openFile(file)}
            >
              {file}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if selected}
    <div class="viewer">
      <div class="viewer-head">
        <span class="viewer-name">{selected}</span>
        {#if lineCount > 0}
          <span class="viewer-meta">{lineCount} lines</span>
        {/if}
        <button class="viewer-btn" on:click={copyContent} disabled={!content}>
          {copied ? "✓ Copied" : "⧉ Copy"}
        </button>
        <button class="viewer-btn" on:click={closeFile}>✕ Close</button>
      </div>

      {#if loadingFile}
        <p class="viewer-msg">Reading…</p>
      {:else if contentError}
        <p class="viewer-msg error">{contentError}</p>
      {:else if content.trim() === ""}
        <p class="viewer-msg">This file is empty.</p>
      {:else}
        <pre class="viewer-body">{content}</pre>
      {/if}
    </div>
  {/if}
</div>

<style>
  .file-btn {
    width: 100%;
    padding: 0.25rem 0.4rem;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.85rem;
    text-align: left;
    color: var(--text-primary);
    background: none;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .file-btn:hover {
    background: var(--bg-surface-hover);
  }

  .file-btn.selected {
    color: var(--accent-text);
    background: var(--accent);
  }

  .viewer {
    margin-top: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    overflow: hidden;
  }

  .viewer-head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-surface-raised);
    border-bottom: 1px solid var(--border-color);
  }

  .viewer-name {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.85rem;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Pushes the buttons to the right and takes the leftover space, so a long
     filename truncates instead of shoving them off the edge. */
  .viewer-meta {
    flex: 1;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .viewer-btn {
    flex-shrink: 0;
    padding: 0.2rem 0.5rem;
    font-family: inherit;
    font-size: 0.75rem;
    color: var(--text-primary);
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    cursor: pointer;
  }

  .viewer-btn:hover:not(:disabled) {
    background: var(--bg-surface-hover);
  }

  .viewer-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Capped and scrollable: AGENT_SYNC.md is already ~110 KB, and letting it
     render at full height would push the file list off the screen. */
  .viewer-body {
    max-height: 420px;
    margin: 0;
    padding: 0.75rem;
    overflow: auto;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.8rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text-primary);
    background: var(--bg-surface);
  }

  .viewer-msg {
    margin: 0;
    padding: 0.75rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .viewer-msg.error {
    color: #ff8a80;
  }

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
