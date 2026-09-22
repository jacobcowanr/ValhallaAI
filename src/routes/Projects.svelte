<script lang="ts">
  /**
   * Projects — sessions grouped by what they are about.
   *
   * A project is a label on a session, not a folder holding it. Two
   * consequences the UI is careful about:
   *   - Deleting a project unassigns its sessions and says so, rather than
   *     deleting them. The confirm copy names that explicitly, because
   *     "delete" is the one word a user is right to be afraid of here.
   *   - "Unassigned" is always present, so a session can never become
   *     unreachable by having no project.
   */
  import {
    sessions,
    projects,
    activeSessionId,
    projectNames,
    createProject,
    deleteProject,
    assignSessionProject,
    sessionsInProject,
    type ChatSession,
  } from "../lib/sessions";
  import { providerName } from "../lib/providers";

  export let onSelect: () => void;

  // Selected project name, or null when there is nothing to show yet.
  let selected: string | null = null;
  let newName = "";
  let error = "";
  let confirmingDelete: string | null = null;

  $: names = projectNames($sessions, $projects);
  // Auto-select the first project so the page opens with content rather than
  // an empty pane requiring a click.
  $: if (names.length > 0 && (selected === null || !names.includes(selected))) {
    selected = names[0];
  }
  $: listed = selected === null ? [] : sessionsInProject($sessions, selected);
  $: selectedCount = listed.length;
  // Unfiled chats live in Recent, not here — this is only to say so.
  $: unfiledCount = sessionsInProject($sessions, null).length;

  function activity(project: string | null): number {
    const list = sessionsInProject($sessions, project);
    return list.length > 0 ? list[0].updatedAt : 0;
  }

  function formatTimestamp(ms: number): string {
    if (!ms) return "no sessions yet";
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function addProject(): void {
    const created = createProject(newName);
    if (created === null) {
      error = newName.trim()
        ? `"${newName.trim()}" already exists.`
        : "Give the project a name first.";
      return;
    }
    error = "";
    newName = "";
    selected = created; // jump straight into the new project
  }

  function handleDelete(name: string): void {
    deleteProject(name);
    confirmingDelete = null;
    if (selected === name) selected = null;
  }

  function openSession(id: string): void {
    activeSessionId.set(id);
    onSelect();
  }

  function preview(session: ChatSession): string {
    const last = session.messages[session.messages.length - 1];
    if (!last) return "No messages yet";
    return last.text.slice(0, 90) + (last.text.length > 90 ? "…" : "");
  }
</script>

<div class="container">
  <h2>Projects</h2>
  <p class="lede">
    Conversations grouped by what they are about. A project is a label on a session — removing
    one never deletes the chats inside it.
  </p>

  <div class="new-project">
    <input
      type="text"
      bind:value={newName}
      placeholder="New project name (e.g. CareConnectLite)"
      on:keydown={(e) => e.key === "Enter" && addProject()}
    />
    <button on:click={addProject}>Add project</button>
  </div>
  {#if error}
    <p class="error">⚠ {error}</p>
  {/if}

  {#if names.length === 0}
    <div class="empty-state">
      <p>No projects yet.</p>
      <p class="hint">
        Create one above, then file conversations into it from the model bar while chatting, or
        from Recent. Unfiled chats stay in Recent.
      </p>
    </div>
  {:else}
    <div class="project-list">
      {#each names as name (name)}
        <div class="project-card" class:active={selected === name}>
          <button class="project-main" on:click={() => (selected = name)}>
            <span class="project-name">{name}</span>
            <span class="project-meta">
              {sessionsInProject($sessions, name).length} session{sessionsInProject($sessions, name).length === 1 ? "" : "s"}
              · {formatTimestamp(activity(name))}
            </span>
          </button>
          {#if confirmingDelete === name}
            <span class="confirm">
              <span class="confirm-text">Remove the project? The chats stay, unfiled.</span>
              <button class="confirm-yes" on:click={() => handleDelete(name)}>Remove</button>
              <button class="confirm-no" on:click={() => (confirmingDelete = null)}>Cancel</button>
            </span>
          {:else}
            <button
              class="remove-btn"
              title="Remove this project (keeps its sessions)"
              on:click={() => (confirmingDelete = name)}
            >
              ✕
            </button>
          {/if}
        </div>
      {/each}
    </div>

    <div class="detail">
      <h3>
        {selected}
        <span class="count">{selectedCount}</span>
      </h3>

      {#if unfiledCount > 0}
        <p class="unfiled-note">
          {unfiledCount} conversation{unfiledCount === 1 ? "" : "s"} not filed yet — those live in
          <strong>Recent</strong>.
        </p>
      {/if}

      {#if listed.length === 0}
        <p class="hint">
          No conversations here yet. File one from Recent, or from the project picker in the model
          bar while chatting.
        </p>
      {:else}
        <div class="session-list">
          {#each listed as session (session.id)}
            <div class="session-card" class:active={session.id === $activeSessionId}>
              <button class="session-main" on:click={() => openSession(session.id)}>
                <span class="session-title">{session.title}</span>
                <span class="session-preview">{preview(session)}</span>
              </button>
              <div class="session-meta">
                <span class="session-provider">{providerName(session.provider)}</span>
                <span class="session-time">{formatTimestamp(session.updatedAt)}</span>
                <!-- Moving a session between projects, including out of one.
                     This is the only way a session's project changes, so a
                     misfiled chat is always one click from fixed. -->
                <select
                  class="project-select"
                  value={session.project ?? ""}
                  on:change={(e) => assignSessionProject(session.id, e.currentTarget.value)}
                  title="Move to a project"
                >
                  <option value="">Unassigned</option>
                  {#each names as name (name)}
                    <option value={name}>{name}</option>
                  {/each}
                </select>
              </div>
            </div>
          {/each}
        </div>
      {/if}
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

  h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-display);
    font-weight: 400;
    color: var(--text-primary);
  }

  .count {
    font-size: 0.75rem;
    color: var(--text-muted);
    background: var(--bg-surface-raised);
    border-radius: 10px;
    padding: 0.1rem 0.5rem;
  }

  .lede {
    color: var(--text-secondary);
    font-size: 0.9rem;
    margin-top: 0;
  }

  .new-project {
    display: flex;
    gap: 0.5rem;
    margin: 1rem 0;
  }

  .new-project input {
    flex: 1;
    padding: 0.6rem 0.8rem;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 0.9rem;
  }

  .new-project input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .new-project button {
    padding: 0.6rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--accent-soft-border);
    background: var(--accent-soft-bg);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.9rem;
  }

  .new-project button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .error {
    color: var(--warning-text);
    font-size: 0.8rem;
    margin: 0 0 0.75rem 0;
  }

  .empty-state {
    text-align: center;
    color: var(--text-secondary);
    padding: 3rem 1rem;
  }

  .empty-state p {
    margin: 0.25rem 0;
  }

  .empty-state .hint,
  .hint {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .unfiled-note {
    font-size: 0.85rem;
    color: var(--text-secondary);
    background: var(--bg-surface-raised);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    margin: 0 0 1rem 0;
  }

  .project-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .project-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding-right: 0.75rem;
  }

  .project-card.active {
    border-color: var(--accent);
    background: var(--accent-soft-bg);
  }

  .project-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    padding: 0.85rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .project-name {
    color: var(--text-primary);
    font-weight: 600;
  }

  .project-meta {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .confirm {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .confirm-text {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .confirm-yes,
  .confirm-no {
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    background: none;
    color: var(--text-primary);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .confirm-yes:hover {
    background: var(--danger);
    border-color: var(--danger);
    color: white;
  }

  .remove-btn {
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

  .remove-btn:hover {
    background: var(--danger);
    color: white;
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
</style>
