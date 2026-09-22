<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/tauri";
  import {
    AGENT_RUNTIMES,
    RUNTIME_BLURB,
    addCustomAgent,
    buildCustomAgent,
    loadCustomAgents,
    removeCustomAgent,
    type CustomAgent,
  } from "../lib/custom-agents";

  interface AgentStatus {
    name: string;
    blurb: string;
    status: "running" | "stopped" | "error";
    /** Timestamp of the last real run, recovered from the agent's outbox. */
    lastRun: string | null;
    /** "OK" / "ERROR" from that run. */
    lastResult: string;
    /** From agents-config.json, not hardcoded. */
    enabled: boolean;
    output: string;
    /** Set only for a user-defined agent: which built-in agent it runs as.
     *  The built-in cards have no runtime of their own — they ARE the runtime. */
    runtime?: string;
    /** True for an agent the user added. Controls the Remove button. */
    custom?: boolean;
  }

  /** Shape of the agent_status command's reply. */
  interface AgentInfo {
    name: string;
    enabled: boolean;
    lastRun: string;
    lastStatus: string;
  }

  let agents: AgentStatus[] = [
    {
      name: "claude-agent",
      blurb: "Subscription first via `claude auth login`. Falls back to the Docker container on ANTHROPIC_API_KEY only when there is no subscription login.",
      status: "stopped",
      lastRun: null,
      lastResult: "",
      enabled: true,
      output: "",
    },
    {
      name: "hermes-agent",
      blurb: "Runs the Hermes CLI on this Mac, one shot, then exits.",
      status: "stopped",
      lastRun: null,
      lastResult: "",
      enabled: true,
      output: "",
    },
    {
      name: "grok-build",
      // Was grok-agent, a one-shot Docker container billed against
      // XAI_API_KEY -- which is empty on this machine, so it could not run.
      // The host Grok Build CLI (`grok`, logged in via grok.com) is now the
      // preferred path, which is why the name changed: this is Grok Build.
      blurb: "Subscription first via the host Grok Build CLI on your grok.com login. Falls back to the Docker container on XAI_API_KEY only when there is no login.",
      status: "stopped",
      lastRun: null,
      lastResult: "",
      enabled: true,
      output: "",
    },
  ];

  let customAgents: CustomAgent[] = [];
  let caName = "";
  let caRuntime = "hermes-agent";
  let caNote = "";
  let caError = "";
  let caSaved = false;

  function inTauri(): boolean {
    return typeof window !== "undefined" && "__TAURI__" in window;
  }

  /** Format an outbox timestamp for display, falling back to the raw value if
   * it is not a date this runtime can parse. */
  function formatStamp(raw: string): string {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleString();
  }

  /**
   * Pull real state from disk.
   *
   * The cards used to say "Never run" on every launch, because last-run lived
   * in component state and reset each time. The outbox files are the durable
   * record of what actually happened, so they are the source here.
   */
  async function loadStatus(): Promise<void> {
    if (!inTauri()) return;
    try {
      const info = await invoke<AgentInfo[]>("agent_status");
      const byName = new Map(info.map((a) => [a.name, a]));
      agents = agents.map((a) => {
        const live = byName.get(a.name);
        if (!live) return a;
        return {
          ...a,
          enabled: live.enabled,
          lastRun: live.lastRun ? formatStamp(live.lastRun) : a.lastRun,
          lastResult: live.lastStatus || a.lastResult,
        };
      });
    } catch {
      // Non-fatal: the cards still render and Run still works, they just
      // cannot show history. Better than blocking the page on it.
    }
  }

  onMount(() => {
    customAgents = loadCustomAgents();
    void loadStatus();
  });

  /** Built-in cards first, then the user's, as one list for the grid. */
  function cardFor(agent: CustomAgent): AgentStatus {
    return {
      name: agent.name,
      blurb: agent.note || RUNTIME_BLURB[agent.runtime],
      status: "stopped",
      lastRun: null,
      lastResult: "",
      enabled: true,
      output: "",
      runtime: agent.runtime,
      custom: true,
    };
  }

  $: allAgents = [...agents, ...customAgents.map(cardFor)];

  function submitCustomAgent(): void {
    const draft = buildCustomAgent(
      { name: caName, runtime: caRuntime, note: caNote },
      customAgents
    );
    if (draft.error || !draft.agent) {
      caError = draft.error ?? "Could not add that agent.";
      return;
    }
    customAgents = addCustomAgent(draft.agent, customAgents);
    caName = "";
    caNote = "";
    caError = "";
    caSaved = true;
    setTimeout(() => {
      caSaved = false;
    }, 2000);
  }

  function deleteCustomAgent(name: string): void {
    customAgents = removeCustomAgent(name, customAgents);
  }

  async function runAgent(agent: AgentStatus): Promise<void> {
    if (agent.status === "running") return;
    agent.status = "running";
    agent.output = "";
    try {
      if (!inTauri()) {
        throw new Error(
          `Not inside the desktop app. From a terminal: scripts/run_agent.sh ${agent.name}`
        );
      }
      agent.output = await invoke<string>("run_agent", {
        service: agent.name,
        // Only a custom agent passes a runtime. The Rust side re-checks it
        // against the allowlist and runs THAT, never the display name.
        runtime: agent.runtime ?? null,
      });
      agent.status = "stopped";
    } catch (error) {
      agent.status = "error";
      agent.output = typeof error === "string" ? error : error instanceof Error ? error.message : "Run failed";
    }
    agents = agents;
    // Re-read from disk rather than stamping the clock locally, so the card
    // shows what the outbox actually recorded -- including a run that failed
    // before it could write one.
    await loadStatus();
  }
</script>

<div class="container">
  <h2>Agent Control</h2>
  <p class="mock-notice">
    Run starts that agent once and waits until it exits. Output is also appended to
    <code>vault/AGENT_OUTBOX_&lt;agent&gt;.md</code>.
  </p>

  <div class="agents-grid">
    {#each allAgents as agent}
      <div class="agent-card">
        <div class="agent-header">
          <h3>{agent.name}</h3>
          {#if agent.custom && agent.runtime}
            <span class="status runtime" title="Runs as {agent.runtime}">via {agent.runtime}</span>
          {/if}
          {#if !agent.enabled}
            <span class="status disabled" title="enabled: false in vault/agents-config.json">disabled</span>
          {/if}
          <span class="status {agent.status}">{agent.status}</span>
        </div>

        <div class="agent-body">
          <p>{agent.blurb}</p>
          {#if agent.lastRun}
            <p class="last-run">
              Last run: {agent.lastRun}
              {#if agent.lastResult}
                <span class="result {agent.lastResult === 'OK' ? 'ok' : 'bad'}">{agent.lastResult}</span>
              {/if}
            </p>
          {:else}
            <p class="empty">Never run</p>
          {/if}
          {#if agent.output}
            <pre class="output">{agent.output}</pre>
          {/if}
        </div>

        <div class="agent-footer">
          <button
            on:click={() => runAgent(agent)}
            class="primary"
            disabled={agent.status === "running"}
          >
            {agent.status === "running" ? "Running..." : "Run"}
          </button>
          {#if agent.custom}
            <button class="remove" on:click={() => deleteCustomAgent(agent.name)}>Remove</button>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <section class="add-agent">
    <h3>Add an agent</h3>
    <p class="add-description">
      Add an agent that is not listed above. It runs as one of the three existing agents — a custom
      agent is a name and an entry point, not a new runtime, so it cannot run anything those three
      cannot already run.
    </p>

    <div class="field">
      <label for="ca-name">Name:</label>
      <input id="ca-name" type="text" bind:value={caName} placeholder="Research agent" />
    </div>

    <div class="field">
      <label for="ca-runtime">Runs as:</label>
      <select id="ca-runtime" bind:value={caRuntime}>
        {#each AGENT_RUNTIMES as runtime}
          <option value={runtime}>{runtime} — {RUNTIME_BLURB[runtime]}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label for="ca-note">Note (optional):</label>
      <input id="ca-note" type="text" bind:value={caNote} placeholder="What you use this one for" />
    </div>

    {#if caError}
      <p class="ca-error">{caError}</p>
    {/if}

    <button class="add-btn" on:click={submitCustomAgent}>
      {caSaved ? "✓ Added" : "Add Agent"}
    </button>
  </section>
</div>

<style>
  .status.disabled {
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
  }

  .last-run {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .result {
    padding: 0.05rem 0.35rem;
    font-size: 0.7rem;
    font-weight: 600;
    border-radius: 4px;
  }

  .result.ok {
    color: #7ee2a8;
    background: rgba(126, 226, 168, 0.12);
  }

  .result.bad {
    color: #ff8a80;
    background: rgba(255, 138, 128, 0.12);
  }

  .container {
    max-width: 1000px;
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
    margin: 0 0 1.5rem 0;
  }

  .mock-notice code {
    background: var(--bg-surface-raised);
    color: var(--text-primary);
    padding: 2px 4px;
    border-radius: 2px;
    font-family: monospace;
    font-size: 0.8rem;
  }

  .agents-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
  }

  .agent-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
  }

  .agent-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .agent-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-primary);
  }

  .status {
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
  }

  .status.running {
    background: var(--success-bg);
    color: var(--success-text);
  }

  .status.stopped {
    background: var(--bg-surface-raised);
    color: var(--text-secondary);
  }

  .status.error {
    background: var(--danger-bg, #f8d7da);
    color: var(--danger-text, #721c24);
  }

  .output {
    margin: 0.75rem 0 0 0;
    max-height: 160px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.75rem;
    background: var(--bg-surface-raised);
    color: var(--text-primary);
    padding: 0.5rem;
    border-radius: 4px;
  }

  .agent-body {
    flex: 1;
    margin-bottom: 1rem;
  }

  .agent-body p {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .agent-body p.empty {
    color: var(--text-muted);
    font-style: italic;
  }

  .agent-footer {
    display: flex;
    gap: 0.5rem;
  }

  button {
    flex: 1;
    padding: 0.5rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.2s;
  }

  button.primary {
    background: var(--accent);
    color: var(--accent-text);
  }

  button.primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

</style>
