<script lang="ts">
  import { onMount } from "svelte";
  import type { LLMProvider } from "../lib/llm-router";
  import { PROVIDERS, PROVIDER_ENTRIES, FALLBACK_PROVIDER, FALLBACK_MODEL } from "../lib/providers";

  let defaultProvider: LLMProvider = FALLBACK_PROVIDER;
  let defaultModel: string = FALLBACK_MODEL;
  let apiKeys: Record<string, string> = {};
  let saved = false;
  let ollamaEndpoint = "";

  function apiKeyStorageKey(providerId: LLMProvider): string {
    return `valhallaai-apikey-${providerId}`;
  }

  onMount(() => {
    // Load saved preferences
    const savedPrefs = localStorage.getItem("valhallaai-prefs");
    if (savedPrefs) {
      const prefs = JSON.parse(savedPrefs) as {
        defaultProvider?: LLMProvider;
        defaultModel?: string;
      };
      // A previously-saved provider can disappear from the catalog (e.g. the
      // GitHub Copilot removal). Falling back here instead of trusting the
      // stored value keeps the model dropdown from silently rendering empty.
      if (prefs.defaultProvider && PROVIDERS[prefs.defaultProvider]) {
        defaultProvider = prefs.defaultProvider;
        defaultModel =
          prefs.defaultModel && PROVIDERS[prefs.defaultProvider].models.includes(prefs.defaultModel)
            ? prefs.defaultModel
            : PROVIDERS[prefs.defaultProvider].models[0];
      } else {
        defaultProvider = FALLBACK_PROVIDER;
        defaultModel = FALLBACK_MODEL;
      }
    }

    // Load the saved Ollama endpoint so the field reflects what's actually stored.
    ollamaEndpoint = localStorage.getItem("ollama-endpoint") || "";

    // Load any previously-saved per-provider API keys. Ollama needs none
    // (local, no auth) so it's excluded from this list.
    for (const providerId of Object.keys(PROVIDERS) as LLMProvider[]) {
      if (providerId === "ollama") continue;
      apiKeys[providerId] = localStorage.getItem(apiKeyStorageKey(providerId)) || "";
    }
  });

  function savePreferences(): void {
    const prefs = {
      defaultProvider,
      defaultModel,
    };
    localStorage.setItem("valhallaai-prefs", JSON.stringify(prefs));
    saved = true;
    setTimeout(() => {
      saved = false;
    }, 2000);
  }

  function saveApiKey(providerId: LLMProvider): void {
    // Uses the SAME localStorage key ModelPicker reads from
    // (valhallaai-apikey-<providerId>), so a key saved here actually shows up
    // there. Previously these were two disconnected storage schemes.
    if (apiKeys[providerId]) {
      localStorage.setItem(apiKeyStorageKey(providerId), apiKeys[providerId]);
    } else {
      localStorage.removeItem(apiKeyStorageKey(providerId));
    }
  }

  $: if (defaultProvider) {
    // Auto-select first model of the new provider
    const models = PROVIDERS[defaultProvider]?.models || [];
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
        <label for="default-provider">Provider:</label>
        <select id="default-provider" bind:value={defaultProvider}>
          {#each PROVIDER_ENTRIES as [key, { name }]}
            <option value={key}>{name}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label for="default-model">Model:</label>
        <select id="default-model" bind:value={defaultModel}>
          {#each PROVIDERS[defaultProvider]?.models || [] as model}
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
        <label for="ollama-endpoint">Ollama Endpoint:</label>
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
          <li>Select Ollama (Local) in ValhallaAI and choose your model</li>
        </ol>
      </div>
    </section>

    <section class="section">
      <h3>API Keys</h3>
      <p class="section-description">
        Stored locally only (browser localStorage inside the Tauri webview) — never sent anywhere but the
        provider's own API. Ollama needs no key. Leave a field blank to use that provider's manual
        per-message key entry in Models &amp; Chat instead.
      </p>

      <div class="api-keys">
        {#each PROVIDER_ENTRIES as [providerId, { name }]}
          {#if providerId !== "ollama"}
            <div class="field">
              <label for={`apikey-${providerId}`}>{name}</label>
              <input
                id={`apikey-${providerId}`}
                type="password"
                bind:value={apiKeys[providerId]}
                placeholder="Enter API key"
                on:blur={() => saveApiKey(providerId)}
              />
            </div>
          {/if}
        {/each}
      </div>
    </section>

    <section class="section">
      <h3>About ValhallaAI</h3>
      <p class="section-description">Multi-agent orchestration • Model switching • Vault coordination</p>
      <p>Version: 0.1.0 (local development)</p>
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
    font-family: var(--font-display);
    font-weight: 400;
    letter-spacing: 0.02em;
    color: var(--text-primary);
  }

  .settings-panel {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .section {
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
  }

  .section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    color: var(--text-primary);
  }

  .section-description {
    margin: 0 0 1rem 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
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
    color: var(--text-primary);
  }

  select,
  input {
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 0.9rem;
    font-family: inherit;
    background: var(--bg-surface-raised);
    color: var(--text-primary);
  }

  select:hover,
  input:hover {
    border-color: var(--text-muted);
  }

  select:focus,
  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft-bg);
  }

  .save-btn {
    padding: 0.75rem 1.5rem;
    background: var(--accent);
    color: var(--accent-text);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.2s;
    margin-top: 1rem;
  }

  .save-btn:hover {
    background: var(--accent-hover);
  }

  .api-keys {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  p {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .ollama-help {
    background: var(--accent-soft-bg);
    border: 1px solid var(--accent-soft-border);
    padding: 1rem;
    border-radius: 4px;
    margin-top: 1rem;
    font-size: 0.9rem;
  }

  .ollama-help p {
    margin: 0 0 0.5rem 0;
    font-weight: 600;
    color: var(--text-primary);
  }

  .ollama-help ol {
    margin: 0;
    padding-left: 1.5rem;
  }

  .ollama-help li {
    margin: 0.25rem 0;
    color: var(--text-secondary);
  }

  .ollama-help code {
    background: var(--bg-surface-raised);
    color: var(--text-primary);
    padding: 2px 4px;
    border-radius: 2px;
    font-family: monospace;
    font-size: 0.85rem;
  }

  .ollama-help a {
    color: var(--accent);
    text-decoration: none;
  }

  .ollama-help a:hover {
    color: var(--accent-hover);
    text-decoration: underline;
  }

  small {
    display: block;
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }
</style>
