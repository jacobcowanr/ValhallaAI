<script>
  let agents = [
    { name: "claude-agent", status: "stopped", lastRun: null },
    { name: "hermes-agent", status: "stopped", lastRun: null },
    { name: "grok-agent", status: "stopped", lastRun: null },
  ];

  function toggleAgent(agent) {
    if (agent.status === "running") {
      agent.status = "stopped";
    } else {
      agent.status = "running";
      agent.lastRun = new Date().toLocaleString();
    }
  }
</script>

<div class="container">
  <h2>Agent Control</h2>

  <div class="agents-grid">
    {#each agents as agent}
      <div class="agent-card">
        <div class="agent-header">
          <h3>{agent.name}</h3>
          <span class="status {agent.status}">{agent.status}</span>
        </div>

        <div class="agent-body">
          {#if agent.lastRun}
            <p>Last run: {agent.lastRun}</p>
          {:else}
            <p class="empty">Never run</p>
          {/if}
        </div>

        <div class="agent-footer">
          <button
            on:click={() => toggleAgent(agent)}
            class={agent.status === "running" ? "danger" : "primary"}
          >
            {agent.status === "running" ? "Stop" : "Start"}
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
  }

  .agents-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
  }

  .agent-card {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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
  }

  .status {
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
  }

  .status.running {
    background: #d4edda;
    color: #155724;
  }

  .status.stopped {
    background: #f8d7da;
    color: #721c24;
  }

  .agent-body {
    flex: 1;
    margin-bottom: 1rem;
  }

  .agent-body p {
    margin: 0;
    font-size: 0.9rem;
    color: #666;
  }

  .agent-body p.empty {
    color: #999;
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
    background: #667eea;
    color: white;
  }

  button.primary:hover {
    background: #764ba2;
  }

  button.danger {
    background: #dc3545;
    color: white;
  }

  button.danger:hover {
    background: #c82333;
  }
</style>
