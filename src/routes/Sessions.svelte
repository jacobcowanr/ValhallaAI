<script lang="ts">
  import { sessions, activeSessionId, deleteSession, type ChatSession } from "../lib/sessions";
  import { providerName } from "../lib/providers";

  export let onSelect: () => void;

  function selectSession(id: string): void {
    activeSessionId.set(id);
    onSelect();
  }

  function handleDelete(e: MouseEvent, id: string): void {
    e.stopPropagation(); // don't also trigger selectSession on the card
    deleteSession(id);
  }

  function formatTimestamp(ms: number): string {
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function preview(session: ChatSession): string {
    const lastMsg = session.messages[session.messages.length - 1];
    if (!lastMsg) return "No messages yet";
    return lastMsg.text.slice(0, 90) + (lastMsg.text.length > 90 ? "…" : "");
  }

  // Newest first — most recently active conversation at the top.
  $: sortedSessions = [...$sessions].sort((a, b) => b.updatedAt - a.updatedAt);
</script>

<div class="container">
  <h2>Sessions</h2>

  {#if sortedSessions.length === 0}
    <div class="empty-state">
      <p>No sessions yet.</p>
      <p class="hint">Click "New Session" in the sidebar, or just send a message in Models &amp; Chat.</p>
    </div>
  {:else}
    <div class="session-list">
      {#each sortedSessions as session (session.id)}
        <button
          class="session-card"
          class:active={session.id === $activeSessionId}
          on:click={() => selectSession(session.id)}
        >
          <div class="session-main">
            <div class="session-title">{session.title}</div>
            <div class="session-preview">{preview(session)}</div>
          </div>
          <div class="session-meta">
            <span class="session-provider">{providerName(session.provider)}</span>
            <span class="session-time">{formatTimestamp(session.updatedAt)}</span>
            <button class="delete-btn" on:click={(e) => handleDelete(e, session.id)} title="Delete session">
              ✕
            </button>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 720px;
    margin: 0 auto;
  }

  h2 {
    margin-top: 0;
    font-family: var(--font-display);
    font-weight: 400;
    letter-spacing: 0.02em;
    color: var(--text-primary);
  }

  .empty-state {
    text-align: center;
    color: var(--text-secondary);
    padding: 3rem 1rem;
  }

  .empty-state p {
    margin: 0.25rem 0;
  }

  .empty-state .hint {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .session-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .session-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    width: 100%;
    padding: 1rem 1.25rem;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, border-color 0.15s;
  }

  .session-card:hover {
    background: var(--bg-surface-hover);
  }

  .session-card.active {
    border-color: var(--accent);
    background: var(--accent-soft-bg);
  }

  .session-main {
    flex: 1;
    min-width: 0;
  }

  .session-title {
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .session-preview {
    font-size: 0.85rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 0.2rem;
  }

  .session-meta {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .session-provider {
    background: var(--bg-surface-raised);
    padding: 0.2rem 0.5rem;
    border-radius: 12px;
  }

  .delete-btn {
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.75rem;
    line-height: 1;
  }

  .delete-btn:hover {
    background: var(--danger);
    color: white;
  }
</style>
