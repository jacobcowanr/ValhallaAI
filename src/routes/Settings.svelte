<script lang="ts">
  import { onMount } from "svelte";
  import {
    FALLBACK_PROVIDER,
    FALLBACK_MODEL,
    allProviderEntries,
    isKnownProvider,
    providerModels,
    providerName,
  } from "../lib/providers";
  import {
    addCustomProvider,
    buildCustomProvider,
    initCustomProviders,
    isCustomProviderId,
    removeCustomProvider,
    type CustomProvider,
  } from "../lib/custom-providers";
  import { envKeyFor, loadEnvProviderKeys, resolveApiKey } from "../lib/provider-keys";
  import { scopedKey } from "../lib/profiles";

  // Provider ids are plain strings here rather than the LLMProvider union:
  // a custom provider's id is created at runtime. The union still types the
  // built-in half — see allProviderEntries() in providers.ts.
  let defaultProvider: string = FALLBACK_PROVIDER;
  let defaultModel: string = FALLBACK_MODEL;
  let apiKeys: Record<string, string> = {};
  let envKeys: Record<string, boolean> = {};
  let saved = false;
  let ollamaEndpoint = "";

  // --- Custom providers (add-your-own, for providers not in the catalog) ---
  let customProviders: CustomProvider[] = [];
  let cpName = "";
  let cpEndpoint = "";
  let cpModels = "";
  let cpError = "";
  let cpSaved = false;

  // Which provider's key the dropdown below is currently showing/editing.
  // Was previously every non-Ollama provider's key field shown at once —
  // a wall of 17 inputs. One at a time, picked via dropdown, like the
  // Default Provider & Model section above it.
  let apiKeyProvider: string = FALLBACK_PROVIDER;
  // Ollama is local and unauthenticated. Nous Portal goes through the
  // Hermes subscription proxy, which attaches its own credential, so a
  // pasted key is not sent.
  const KEYLESS_PROVIDERS = new Set<string>(["ollama", "nous", "claude_directsdk"]);
  // Reactive so a provider added below appears in the key dropdown without a
  // reload. Depends on customProviders explicitly: allProviderEntries() reads
  // localStorage, which Svelte cannot observe.
  $: keyEditableProviders = allProviderEntries(customProviders).filter(
    ([id]) => !KEYLESS_PROVIDERS.has(id)
  );

  function defaultKeyProvider(preferred: string): string {
    if (!KEYLESS_PROVIDERS.has(preferred)) return preferred;
    return keyEditableProviders[0][0];
  }

  // Was: the masked password field sat there permanently, always visible
  // and always editable, even after a key was already saved. Now it's a
  // saved/edit toggle — a saved key shows only a confirmation (the same
  // checkmark used in the dropdown), not an editable field, until you
  // explicitly click Edit. pendingKeyValue is a draft that's only
  // committed on Submit, not on every keystroke or blur.
  let editingKey = false;
  let pendingKeyValue = "";

  // Svelte's template-expression parser doesn't support TS `as` casts
  // inline in markup (only inside the script block's own function
  // bodies) — this wrapper exists so the <select>'s on:change handler in
  // the template can stay a plain function reference instead of an
  // inline arrow function with a cast, which fails to parse there.
  function handleApiKeyProviderChange(e: Event): void {
    const value = (e.currentTarget as HTMLSelectElement).value;
    selectApiKeyProvider(value);
  }

  function selectApiKeyProvider(providerId: string): void {
    apiKeyProvider = providerId;
    // Existing key -> show the saved confirmation. No key yet -> go
    // straight to the input so there's no extra click for a first-time setup.
    editingKey = !apiKeys[providerId];
    pendingKeyValue = "";
  }

  function startEditingKey(): void {
    // Deliberately NOT pre-filling with the existing saved value — you're
    // pasting a replacement key, not character-editing a masked one, and
    // re-displaying a saved secret (even masked) is unnecessary exposure.
    pendingKeyValue = "";
    editingKey = true;
  }

  function submitApiKey(): void {
    saveApiKey(apiKeyProvider, pendingKeyValue);
    pendingKeyValue = "";
    editingKey = !apiKeys[apiKeyProvider]; // stay in edit mode only if it was cleared (delete), not a real key
  }

  function apiKeyStorageKey(providerId: string): string {
    return scopedKey(`valhallaai-apikey-${providerId}`);
  }

  onMount(async () => {
    await loadEnvProviderKeys();

    // Register stored custom providers with the router before anything is
    // rendered, so one saved in a previous session is routable immediately
    // rather than only after this page is opened.
    customProviders = initCustomProviders();

    // Load saved preferences
    const savedPrefs = localStorage.getItem(scopedKey("valhallaai-prefs"));
    if (savedPrefs) {
      const prefs = JSON.parse(savedPrefs) as {
        defaultProvider?: string;
        defaultModel?: string;
      };
      // A previously-saved provider can disappear from the catalog (e.g. the
      // GitHub Copilot removal, or a custom provider the user deleted).
      // Falling back here instead of trusting the stored value keeps the
      // model dropdown from silently rendering empty.
      if (prefs.defaultProvider && isKnownProvider(prefs.defaultProvider)) {
        const models = providerModels(prefs.defaultProvider);
        defaultProvider = prefs.defaultProvider;
        defaultModel =
          prefs.defaultModel && models.includes(prefs.defaultModel)
            ? prefs.defaultModel
            : models[0];
      } else {
        defaultProvider = FALLBACK_PROVIDER;
        defaultModel = FALLBACK_MODEL;
      }
    }

    // Load the saved Ollama endpoint so the field reflects what's actually stored.
    ollamaEndpoint = localStorage.getItem("ollama-endpoint") || "";

    // Load any previously-saved per-provider API keys. Keyless providers
    // (Ollama, Nous Portal) are excluded — there is nothing to paste. Custom
    // providers are included: their endpoint is a real API and takes a key.
    for (const [providerId] of allProviderEntries()) {
      if (KEYLESS_PROVIDERS.has(providerId)) continue;
      const stored = localStorage.getItem(apiKeyStorageKey(providerId)) || "";
      // .env is read through the Rust side, whose provider table only knows
      // the built-in ids — a custom provider can never have an entry there.
      envKeys[providerId] = isCustomProviderId(providerId) ? false : Boolean(envKeyFor(providerId));
      apiKeys[providerId] = resolveApiKey(providerId, stored);
    }

    // Default the key-editor dropdown to the user's default provider when
    // that provider actually takes a key. Nous is the app default and is
    // keyless, so falling back to FALLBACK_PROVIDER would select a provider
    // that is not in the dropdown.
    selectApiKeyProvider(defaultKeyProvider(defaultProvider));
  });

  function savePreferences(): void {
    const prefs = {
      defaultProvider,
      defaultModel,
    };
    localStorage.setItem(scopedKey("valhallaai-prefs"), JSON.stringify(prefs));
    saved = true;
    setTimeout(() => {
      saved = false;
    }, 2000);
  }

  function saveApiKey(providerId: string, value: string): void {
    // Uses the SAME localStorage key ModelPicker reads from
    // (valhallaai-apikey-<providerId>), so a key saved here actually shows up
    // there. Previously these were two disconnected storage schemes.
    apiKeys[providerId] = value;
    if (value) {
      localStorage.setItem(apiKeyStorageKey(providerId), value);
    } else {
      localStorage.removeItem(apiKeyStorageKey(providerId));
    }
  }

  // Reset the model only when the provider actually CHANGES, and only when the
  // current model does not belong to the new one.
  //
  // This used to assign models[0] on every run of the reactive, which includes
  // the initial load -- so a saved default model was overwritten the moment the
  // page mounted, and FALLBACK_MODEL never survived either. With the default
  // now being Claude DirectSDK, that bug would have silently promoted the
  // picker from haiku to claude-opus-5, the most expensive model in the list.
  let lastProvider: string | null = null;
  $: if (defaultProvider && defaultProvider !== lastProvider) {
    const models = providerModels(defaultProvider);
    if (models.length > 0 && !models.includes(defaultModel)) {
      defaultModel = models[0];
    }
    lastProvider = defaultProvider;
  }

  // One list for both dropdowns, re-derived when the custom list changes.
  $: providerEntries = allProviderEntries(customProviders);

  function submitCustomProvider(): void {
    const draft = buildCustomProvider(
      { name: cpName, endpoint: cpEndpoint, models: cpModels },
      customProviders
    );
    if (draft.error || !draft.provider) {
      cpError = draft.error ?? "Could not save that provider.";
      return;
    }
    customProviders = addCustomProvider(draft.provider, customProviders);

    // Seed a key slot so the provider shows up in the API Keys dropdown
    // without a reload — most people add one because they have a key for it.
    if (!KEYLESS_PROVIDERS.has(draft.provider.id)) {
      apiKeys = { ...apiKeys, [draft.provider.id]: apiKeys[draft.provider.id] ?? "" };
    }

    cpName = "";
    cpEndpoint = "";
    cpModels = "";
    cpError = "";
    cpSaved = true;
    setTimeout(() => {
      cpSaved = false;
    }, 2000);
  }

  function deleteCustomProvider(id: string): void {
    // Removing a provider the app is currently pointed at would leave the
    // picker on an id that no longer routes, so fall back to the default.
    if (defaultProvider === id) {
      defaultProvider = FALLBACK_PROVIDER;
      defaultModel = FALLBACK_MODEL;
    }
    if (apiKeyProvider === id) {
      selectApiKeyProvider(defaultKeyProvider(FALLBACK_PROVIDER));
    }
    // The saved key is deliberately left in place: re-adding the provider
    // under the same name restores it, and deleting a provider should not
    // silently destroy a credential the user may still need elsewhere.
    customProviders = removeCustomProvider(id, customProviders);
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
          {#each providerEntries as [key, { name }]}
            <option value={key}>{name}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label for="default-model">Model:</label>
        <select id="default-model" bind:value={defaultModel}>
          {#each providerModels(defaultProvider) as model}
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
      <h3>Nous Portal</h3>
      <p class="section-description">
        Uses the local Hermes subscription proxy. No API key to paste.
      </p>
      <div class="ollama-help">
        <p><strong>Getting started:</strong></p>
        <ol>
          <li>One-time login: <code>hermes portal</code></li>
          <li>Leave this running: <code>hermes proxy start</code></li>
          <li>It listens on <code>http://127.0.0.1:8645</code> and attaches your Portal login</li>
        </ol>
      </div>
    </section>

    <section class="section">
      <h3>API Keys</h3>
      <p class="section-description">
        A provider with a key in the project .env uses that key. Otherwise a key saved here is stored in this
        app only and sent only to that provider. Ollama, Nous Portal, and Claude Subscription DirectSDK need no key.
        DirectSDK uses the Claude CLI login.
      </p>

      <div class="field">
        <label for="apikey-provider">Provider:</label>
        <select
          id="apikey-provider"
          value={apiKeyProvider}
          on:change={handleApiKeyProviderChange}
        >
          {#each keyEditableProviders as [providerId, { name }]}
            <option value={providerId}>{name}{apiKeys[providerId] ? " ✓" : ""}</option>
          {/each}
        </select>
      </div>

      {#key apiKeyProvider}
        {#if envKeys[apiKeyProvider]}
          <p class="key-saved-status">✓ {providerName(apiKeyProvider)} key loaded from .env</p>
        {:else if editingKey}
          <div class="field">
            <label for="apikey-value">{providerName(apiKeyProvider)} API Key:</label>
            <div class="key-edit-row">
              <input
                id="apikey-value"
                type="password"
                bind:value={pendingKeyValue}
                placeholder="Enter API key"
                on:keydown={(e) => e.key === "Enter" && submitApiKey()}
              />
              <button class="submit-key-btn" on:click={submitApiKey}>Submit</button>
            </div>
          </div>
        {:else}
          <div class="field key-saved-row">
            <span class="key-saved-status">✓ {providerName(apiKeyProvider)} key saved</span>
            <button class="edit-key-btn" on:click={startEditingKey}>Edit</button>
          </div>
        {/if}
      {/key}
      <small>✓ next to a provider means a key is available, from .env or saved in the app.</small>
    </section>

    <section class="section">
      <h3>Custom Providers</h3>
      <p class="section-description">
        Add a provider that is not in the list above — no source change needed. It has to speak the
        OpenAI chat-completions dialect, which is what the seven built-in OpenAI-compatible providers
        use and the only shape this app can call without new code. That covers LiteLLM, vLLM,
        llama.cpp's server, LM Studio, and most internal gateways.
      </p>

      <div class="field">
        <label for="cp-name">Name:</label>
        <input id="cp-name" type="text" bind:value={cpName} placeholder="My Gateway" />
      </div>

      <div class="field">
        <label for="cp-endpoint">Chat completions URL:</label>
        <input
          id="cp-endpoint"
          type="text"
          bind:value={cpEndpoint}
          placeholder="https://api.example.com/v1/chat/completions"
        />
        <small>The full endpoint, not just the base URL — this is what gets POSTed to.</small>
      </div>

      <div class="field">
        <label for="cp-models">Models:</label>
        <textarea
          id="cp-models"
          rows="4"
          bind:value={cpModels}
          placeholder={"one-model-id-per-line"}
        ></textarea>
        <small>One model id per line. The first is selected when you pick this provider.</small>
      </div>

      {#if cpError}
        <p class="cp-error">{cpError}</p>
      {/if}

      <button class="save-btn" on:click={submitCustomProvider}>
        {cpSaved ? "✓ Added" : "Add Provider"}
      </button>

      {#if customProviders.length > 0}
        <ul class="cp-list">
          {#each customProviders as provider (provider.id)}
            <li>
              <div class="cp-meta">
                <strong>{provider.name}</strong>
                <span class="cp-endpoint-url">{provider.endpoint}</span>
                <span class="cp-count">
                  {provider.models.length} model{provider.models.length === 1 ? "" : "s"} · key {apiKeys[
                    provider.id
                  ]
                    ? "saved"
                    : "not set"}
                </span>
              </div>
              <button class="edit-key-btn" on:click={() => deleteCustomProvider(provider.id)}>
                Remove
              </button>
            </li>
          {/each}
        </ul>
        <small>
          A custom provider's key is set under API Keys above, the same way as a built-in one.
        </small>
      {/if}
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

  .key-edit-row {
    display: flex;
    gap: 0.5rem;
  }

  .key-edit-row input {
    flex: 1;
  }

  .submit-key-btn {
    padding: 0.75rem 1.25rem;
    background: var(--accent);
    color: var(--accent-text);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    white-space: nowrap;
    transition: background 0.2s;
  }

  .submit-key-btn:hover {
    background: var(--accent-hover);
  }

  .key-saved-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--success-bg);
    border: 1px solid var(--accent-soft-border);
    border-radius: 4px;
    padding: 0.75rem 1rem;
  }

  .key-saved-status {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--success-text);
  }

  .edit-key-btn {
    padding: 0.4rem 0.9rem;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .edit-key-btn:hover {
    background: var(--bg-surface-hover);
    border-color: var(--text-muted);
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

  textarea {
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 0.9rem;
    font-family: monospace;
    background: var(--bg-surface-raised);
    color: var(--text-primary);
    resize: vertical;
  }

  textarea:hover {
    border-color: var(--text-muted);
  }

  textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft-bg);
  }

  .cp-error {
    color: var(--danger);
    font-size: 0.9rem;
    margin: 0 0 0.5rem 0;
  }

  .cp-list {
    list-style: none;
    margin: 1rem 0 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .cp-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background: var(--bg-surface-raised);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 0.75rem 1rem;
  }

  .cp-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .cp-meta strong {
    color: var(--text-primary);
    font-size: 0.9rem;
  }

  .cp-endpoint-url {
    color: var(--text-secondary);
    font-family: monospace;
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }

  .cp-count {
    color: var(--text-muted);
    font-size: 0.8rem;
  }
</style>
