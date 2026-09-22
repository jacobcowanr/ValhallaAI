<script lang="ts">
  import { invoke } from "@tauri-apps/api/tauri";

  interface AgentStatus {
    name: string;
    blurb: string;
    status: "running" | "stopped" | "error";
    lastRun: string | null;
    output: string;
  }

  let agents: AgentStatus[] = [
    {
      name: "claude-agent",
      blurb: "One-shot Docker container. Needs ANTHROPIC_API_KEY in .env.",
      status: "stopped",
      lastRun: null,
      output: "",
    },
    {
      name: "hermes-agent",
      blurb: "Runs the Hermes CLI on this Mac, one shot, then exits.",
      status: "stopped",
      lastRun: null,
      output: "",
    },
    {
      name: "grok-agent",
      blurb: "One-shot Docker container. Disabled in agents-config.json until XAI_API_KEY is set.",
      status: "stopped",
      lastRun: null,
      output: "",
    },
  ];

  function inTauri(): boolean {
    return typeof window !== "undefined" && "__TAURI__" in window;
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
      agent.output = await invoke<string>("run_agent", { service: agent.name });
      agent.status = "stopped";
    } catch (error) {
      agent.status = "error";
      agent.output = typeof error === "string" ? error : error instanceof Error ? error.message : "Run failed";
    }
    agent.lastRun = new Date().toLocaleString();
  }
</script>

<div class="container">
  <h2>Agent Control</h2>
  <p class="mock-notice">
    Run starts that agent once and waits until it exits. Output is also appended to
    <code>vault/AGENT_OUTBOX_&lt;agent&gt;.md</code>.
  </p>

  <div class="agents-grid">
    {#each agents as agent}
      <div class="agent-card">
        <div class="agent-header">
          <h3>{agent.name}</h3>
          <span class="status {agent.status}">{agent.status}</span>
        </div>

        <div class="agent-body">
          <p>{agent.blurb}</p>
          {#if agent.lastRun}
            <p>Last run: {agent.lastRun}</p>
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
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
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
