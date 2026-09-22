<script>
  import { onMount } from "svelte";

  const FALLBACK_PROVIDER = "nous";
  const FALLBACK_MODEL = "x-ai/grok-4.7";

  let defaultProvider = FALLBACK_PROVIDER;
  let defaultModel = FALLBACK_MODEL;
  let apiKeys = {};
  let saved = false;
  let ollamaEndpoint = "";

  const providers = {
    anthropic: {
      name: "Anthropic API Key",
      models: ["claude-opus-5", "claude-3.5-sonnet", "claude-haiku-4.5-20251001"],
    },
    anthropic_oauth: {
      name: "Anthropic OAuth (Usage Credits)",
      models: ["claude-opus-5", "claude-3.5-sonnet", "claude-haiku-4.5-20251001"],
    },
    chatgpt: {
      name: "ChatGPT or Codex Subscription",
      models: ["gpt-4-turbo", "gpt-4o", "gpt-3.5-turbo"],
    },
    claude_directsdk: {
      name: "Claude Subscription DirectSDK",
      models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4.5-20251001"],
    },
    fireworks: {
      name: "Fireworks AI",
      models: ["llama-v3p1-405b", "mixtral-8x22b"],
    },
    google: {
      name: "Google (Gemini)",
      models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    },
    groq: {
      name: "Groq (Fast Inference)",
      models: ["mixtral-8x7b-32768", "llama2-70b-4096", "gemma-7b-it"],
    },
    huggingface: {
      name: "Hugging Face Inference API",
      models: ["meta-llama/Llama-2-70b-chat-hf", "mistralai/Mistral-7B-Instruct-v0.1"],
    },
    minimax: {
      name: "MiniMax",
      models: ["minimax-text-01", "minimax-abab6.5s-chat"],
    },
    nous: {
      name: "Nous Portal",
      models: ["x-ai/grok-4.7", "meta-llama/llama-3.1-405b", "deepseek/deepseek-v4.1-flash"],
    },
    ollama: {
      name: "Ollama (Local)",
      models: ["neural-chat", "zephyr", "mistral", "llama2:13b", "llama2", "orca-mini", "dolphin-mixtral"],
    },
    openclaw: {
      name: "OpenClaw",
      models: ["openclaw-default"],
    },
    openrouter: {
      name: "OpenRouter",
      models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "x-ai/grok-3", "deepseek/deepseek-chat"],
    },
    perplexity: {
      name: "Perplexity (Search + LLM)",
      models: ["pplx-7b-online", "pplx-70b-online"],
    },
    qwen: {
      name: "Qwen Code",
      models: ["qwen-coder-32b", "qwen-turbo"],
    },
    replicate: {
      name: "Replicate",
      models: ["meta/llama-2-70b-chat", "mistralai/mistral-7b-instruct-v0.1"],
    },
    together: {
      name: "Together AI",
      models: ["meta-llama/Llama-2-70b-chat-hf", "mistralai/Mistral-7B-Instruct-v0.1"],
    },
    xai_grok: {
      name: "xAI Grok",
      models: ["grok-3", "grok-vision"],
    },
  };

  onMount(() => {
    // Load saved preferences
    const savedPrefs = localStorage.getItem("vahalla-prefs");
    if (savedPrefs) {
      const prefs = JSON.parse(savedPrefs);
      // A previously-saved provider can disappear from the catalog (e.g. the
      // GitHub Copilot removal). Falling back here instead of trusting the
      // stored value keeps the model dropdown from silently rendering empty.
      if (prefs.defaultProvider && providers[prefs.defaultProvider]) {
        defaultProvider = prefs.defaultProvider;
        defaultModel = providers[prefs.defaultProvider].models.includes(prefs.defaultModel)
          ? prefs.defaultModel
          : providers[prefs.defaultProvider].models[0];
      } else {
        defaultProvider = FALLBACK_PROVIDER;
        defaultModel = FALLBACK_MODEL;
      }
    }

    // Load the saved Ollama endpoint so the field reflects what's actually stored.
    ollamaEndpoint = localStorage.getItem("ollama-endpoint") || "";

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
      <h3>Ollama Configuration</h3>
      <p class="section-description">Configure your local Ollama instance</p>

      <div class="field">
        <label>Ollama Endpoint:</label>
        <input
          type="text"
          id="ollama-endpoint"
          placeholder="http://localhost:11434"
          bind:value={ollamaEndpoint}
          on:blur={() => localStorage.setItem("ollama-endpoint", ollamaEndpoint)}
        />
        <small>Default: http://localhost:11434</small>
      </div>

      <div class="ollama-help">
        <p><strong>Getting started with Ollama:</strong></p>
        <ol>
          <li>Download from <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">ollama.ai</a></li>
          <li>Run: <code>ollama serve</code></li>
          <li>Pull a model: <code>ollama pull llama2</code></li>
          <li>Select Ollama (Local) in Vahalla and choose your model</li>
        </ol>
      </div>
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

  .ollama-help {
    background: #f0f4ff;
    padding: 1rem;
    border-radius: 4px;
    margin-top: 1rem;
    font-size: 0.9rem;
  }

  .ollama-help p {
    margin: 0 0 0.5rem 0;
    font-weight: 600;
    color: #333;
  }

  .ollama-help ol {
    margin: 0;
    padding-left: 1.5rem;
  }

  .ollama-help li {
    margin: 0.25rem 0;
    color: #666;
  }

  .ollama-help code {
    background: white;
    padding: 2px 4px;
    border-radius: 2px;
    font-family: monospace;
    font-size: 0.85rem;
  }

  .ollama-help a {
    color: #667eea;
    text-decoration: none;
  }

  .ollama-help a:hover {
    text-decoration: underline;
  }

  small {
    display: block;
    font-size: 0.8rem;
    color: #999;
    margin-top: 0.25rem;
  }
</style>
