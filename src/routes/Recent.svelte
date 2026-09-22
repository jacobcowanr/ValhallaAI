<script lang="ts">
  /**
   * Recent — previous conversations that are not filed under a project.
   *
   * This is where a chat lands by default. Marking one as a project moves it
   * out of here and into Projects, which is the whole relationship between
   * the two views:
   *
   *   Recent   = everything not yet filed
   *   Projects = everything filed, grouped by project
   *   Sessions = all of it, newest first (the place to delete from)
   *
   * Filing from here is deliberate rather than hidden behind a drag: a
   * dropdown on each row means a chat can be moved with one click, and an
   * experiment you never intend to keep stays in Recent by default.
   */
  import {
    sessions,
    projects,
    activeSessionId,
    deleteSession,
    projectNames,
    assignSessionProject,
    sessionsInProject,
    type ChatSession,
  } from "../lib/sessions";
  import { providerName } from "../lib/providers";

  export let onSelect: () => void;

  $: recent = sessionsInProject($sessions, null);
  $: allProjects = projectNames($sessions, $projects);
  $: filedCount = $sessions.length - recent.length;

  function open(id: string): void {
    activeSessionId.set(id);
    onSelect();
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
    const last = session.messages[session.messages.length - 1];
    if (!last) return "No messages yet";
    return last.text.slice(0, 90) + (last.text.length > 90 ? "…" : "");
  }
</script>

<div class="container">
  <h2>Recent</h2>
  <p class="lede">
    Previous conversations, most recent first. File one under a project and it moves to
    <strong>Projects</strong> instead of staying here.
  </p>

  {#if recent.length === 0}
    <div class="empty-state">
      {#if filedCount > 0}
        <p>Nothing unfiled — all {filedCount} conversation{filedCount === 1 ? "" : "s"} are under a project.</p>
        <p class="hint">
          Anything you start now will appear here until you file it. Filed chats are in Projects.
        </p>
      {:else}
        <p>No previous conversations yet.</p>
        <p class="hint">Send a message in Models &amp; Chat — the conversation shows up here.</p>
      {/if}
    </div>
  {:else}
    <div class="session-list">
      {#each recent as session (session.id)}
        <div class="session-card" class:active={session.id === $activeSessionId}>
          <button class="session-main" on:click={() => open(session.id)}>
            <span class="session-title">{session.title}</span>
            <span class="session-preview">{preview(session)}</span>
          </button>
          <div class="session-meta">
            <span class="session-provider">{providerName(session.provider)}</span>
            <span class="session-time">{formatTimestamp(session.updatedAt)}</span>
            <select
              class="project-select"
              value=""
              on:change={(e) => assignSessionProject(session.id, e.currentTarget.value)}
              title="File this under a project"
            >
              <option value="">Recent</option>
              {#each allProjects as name (name)}
                <option value={name}>{name}</option>
              {/each}
            </select>
            <button
              class="delete-btn"
              on:click={() => deleteSession(session.id)}
              title="Delete this conversation"
            >
              ✕
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 860px;
    margin: 0 auto;
  }

  h2 {
    margin-top: 0;
    font-family: var(--font-display);
    font-weight: 400;
    letter-spacing: 0.02em;
    color: var(--text-primary);
  }

  .lede {
    color: var(--text-secondary);
    font-size: 0.9rem;
    margin-top: 0;
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
    align-items: center;
    gap: 1rem;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding-right: 1rem;
  }

  .session-card.active {
    border-color: var(--accent);
    background: var(--accent-soft-bg);
  }

  .session-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    padding: 0.85rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .session-title {
    color: var(--text-primary);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .session-preview {
    font-size: 0.85rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .session-meta {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .session-provider {
    background: var(--bg-surface-raised);
    padding: 0.2rem 0.5rem;
    border-radius: 12px;
  }

  .project-select {
    background: var(--bg-surface-raised);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.75rem;
    padding: 0.15rem 0.3rem;
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
