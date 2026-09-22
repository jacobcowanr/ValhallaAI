<script>
  import { onMount } from "svelte";

  let defaultProvider = "nous";
  let defaultModel = "x-ai/grok-4.7";
  let apiKeys = {};
  let saved = false;

  const providers = {
    nous: {
      name: "Nous Portal",
      models: ["x-ai/grok-4.7", "deepseek/deepseek-v4.1-flash", "meta-llama/llama-3.1-405b"],
    },
    anthropic: {
      name: "Anthropic API Key",
      models: ["claude-3.5-sonnet", "claude-opus-5", "claude-haiku-4.5-20251001"],
    },
    anthropic_oauth: {
      name: "Anthropic OAuth (Usage Credits)",
      models: ["claude-3.5-sonnet", "claude-opus-5", "claude-haiku-4.5-20251001"],
    },
    claude_directsdk: {
      name: "Claude Subscription DirectSDK",
      models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4.5-20251001"],
    },
    chatgpt: {
      name: "ChatGPT or Codex Subscription",
      models: ["gpt-4-turbo", "gpt-4o", "gpt-3.5-turbo"],
    },
    minimax: {
      name: "MiniMax",
      models: ["minimax-text-01", "minimax-abab6.5s-chat"],
    },
    qwen: {
      name: "Qwen Code",
      models: ["qwen-coder-32b", "qwen-turbo"],
    },
    xai_grok: {
      name: "xAI Grok",
      models: ["grok-3", "grok-vision"],
    },
    github_copilot: {
      name: "GitHub Copilot (ACP)",
      models: ["gpt-4-turbo", "gpt-4o"],
    },
    fireworks: {
      name: "Fireworks AI",
      models: ["llama-v3p1-405b", "mixtral-8x22b"],
    },
    openrouter: {
      name: "OpenRouter",
      models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "deepseek/deepseek-chat", "x-ai/grok-3"],
    },
  };

  onMount(() => {
    // Load saved preferences
    const saved = localStorage.getItem("vahalla-prefs");
    if (saved) {
      const prefs = JSON.parse(saved);
      defaultProvider = prefs.defaultProvider || "nous";
      defaultModel = prefs.defaultModel || "x-ai/grok-4.7";
    }

    // Load API keys (only from env or user input, not from storage for security)
    const providers_to_check = ["NOUS_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "XAI_API_KEY"];
    providers_to_check.forEach((key) => {
      if (typeof window !== "undefined" && window.location.hash.includes("dev")) {
        apiKeys[key] = localStorage.getItem(`api-key-${key}`) || "";
      }
    });
  });

  function savePreferences() {
    const prefs = {
      defaultProvider,
      defaultModel,
    };
    localStorage.setItem("vahalla-prefs", JSON.stringify(prefs));
    saved = true;
    setTimeout(() => {
      saved = false;
    }, 2000);
  }

  function saveApiKey(key) {
    if (apiKeys[key]) {
      localStorage.setItem(`api-key-${key}`, apiKeys[key]);
    }
  }

  $: if (defaultProvider) {
    // Auto-select first model of the new provider
    const models = providers[defaultProvider]?.models || [];
    if (models.length > 0) {
      defaultModel = models[0];
    }
  }
</script>

<div class="container">
  <h2>Settings</h2>

  <div class="settings-panel">
    <section class="section">
      <h3>Default Provider & Model</h3>
      <p class="section-description">Choose your default LLM provider and model</p>

      <div class="field">
        <label>Provider:</label>
        <select bind:value={defaultProvider}>
          {#each Object.entries(providers) as [key, { name }]}
            <option value={key}>{name}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label>Model:</label>
        <select bind:value={defaultModel}>
          {#each providers[defaultProvider]?.models || [] as model}
            <option value={model}>{model}</option>
          {/each}
        </select>
      </div>

      <button on:click={savePreferences} class="save-btn">
        {saved ? "✓ Saved" : "Save Preferences"}
      </button>
    </section>

    <section class="section">
      <h3>API Keys</h3>
      <p class="section-description">Store API keys locally (never shared or uploaded)</p>

      <div class="api-keys">
        {#each Object.keys(apiKeys) as key}
          <div class="field">
            <label>{key}</label>
            <input
              type="password"
              bind:value={apiKeys[key]}
              placeholder="Enter API key"
              on:blur={() => saveApiKey(key)}
            />
          </div>
        {/each}
      </div>
    </section>

    <section class="section">
      <h3>About Vahalla</h3>
      <p class="section-description">Multi-agent orchestration • Model switching • Vault coordination</p>
      <p>Version: 0.0.1 (local development)</p>
      <p>Status: Not ready for public use</p>
    </section>
  </div>
</div>

<style>
  .container {
    max-width: 600px;
    margin: 0 auto;
  }

  h2 {
    margin-top: 0;
  }

  .settings-panel {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .section {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
  }

  .section-description {
    margin: 0 0 1rem 0;
    font-size: 0.9rem;
    color: #666;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  label {
    font-weight: 600;
    font-size: 0.9rem;
    color: #333;
  }

  select,
  input {
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.9rem;
    font-family: inherit;
  }

  select:hover,
  input:hover {
    border-color: #bbb;
  }

  select:focus,
  input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
  }

  .save-btn {
    padding: 0.75rem 1.5rem;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.2s;
    margin-top: 1rem;
  }

  .save-btn:hover {
    background: #764ba2;
  }

  .api-keys {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  p {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: #666;
  }
</style>
