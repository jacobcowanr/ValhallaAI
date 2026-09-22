<script lang="ts">
  import { onMount } from "svelte";
  import type { LLMProvider } from "../lib/llm-router";
  import { PROVIDERS, PROVIDER_ENTRIES, FALLBACK_PROVIDER, FALLBACK_MODEL } from "../lib/providers";
  import { invoke } from "@tauri-apps/api/tauri";
  import { envKeyFor, loadEnvProviderKeys, resolveApiKey, inTauri } from "../lib/provider-keys";
  import {
    scopedKey,
    profiles,
    activeProfileId,
    createProfile,
    updateProfile,
    deleteProfile,
    switchProfile,
    isSignedIn,
  } from "../lib/profiles";

  // --- Profiles -----------------------------------------------------
  $: activeProfile = $profiles.find((p) => p.id === $activeProfileId) ?? null;

  // Public by design: a Desktop-app client id ships inside the binary, and
  // PKCE -- not a secret -- is what protects the exchange. Read from .env
  // only so a different machine can use a different client without a code
  // change. There is no client secret anywhere in this app.
  const googleClientId: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

  let signingIn = false;
  let signInError = "";

  // Names the app assigned, not ones the user chose. Signing in overwrites
  // these with the Google display name; a profile the user deliberately
  // renamed keeps its name.
  const AUTO_PROFILE_NAMES = new Set(["Local", "New profile"]);

  async function signInWithGoogle(): Promise<void> {
    if (!activeProfile || signingIn) return;
    signingIn = true;
    signInError = "";
    try {
      const identity = await invoke<{ email: string; name: string; avatarUrl: string }>(
        "google_sign_in",
        { clientId: googleClientId }
      );
      const patch: Record<string, unknown> = {
        email: identity.email,
        avatarUrl: identity.avatarUrl,
        authProvider: "google",
      };
      if (identity.name && AUTO_PROFILE_NAMES.has(activeProfile.name)) {
        patch.name = identity.name;
      }
      updateProfile(activeProfile.id, patch);
    } catch (err) {
      signInError = typeof err === "string" ? err : err instanceof Error ? err.message : "Sign-in failed.";
    } finally {
      signingIn = false;
    }
  }

  function signOut(): void {
    if (!activeProfile) return;
    // Clears the identity, not the profile: sessions, keys, and prefs are
    // this machine's data and have nothing to do with the Google account.
    updateProfile(activeProfile.id, {
      email: undefined,
      avatarUrl: undefined,
      authProvider: undefined,
    });
    signInError = "";
  }

  let newProfileName = "";
  let renameValue = "";
  let renaming = false;
  let profileNotice = "";

  function beginRename(): void {
    renameValue = activeProfile?.name ?? "";
    renaming = true;
  }

  function commitRename(): void {
    const name = renameValue.trim();
    if (name && activeProfile) updateProfile(activeProfile.id, { name });
    renaming = false;
  }

  function addProfile(): void {
    const name = newProfileName.trim();
    if (!name) return;
    const id = createProfile(name);
    newProfileName = "";
    // Switch immediately: creating a profile you are not put into reads as
    // a no-op. switchProfile reloads, so nothing below this runs.
    switchProfile(id);
  }

  function removeActiveProfile(): void {
    if (!activeProfile) return;
    const target = activeProfile;
    const ok = confirm(
      `Delete the profile "${target.name}"?\n\n` +
        "Its chat sessions, saved API keys, and default model are erased from " +
        "this machine. Keys in .env are not touched. This cannot be undone."
    );
    if (!ok) return;
    if (!deleteProfile(target.id)) {
      // Guarded in profiles.ts: deleting the only profile would leave the
      // next load to mint a fresh empty one, which reads as data loss.
      profileNotice = "This is the only profile, so it can't be deleted. Create another one first.";
      return;
    }
    location.reload();
  }

  function toggleIgnoreEnv(e: Event): void {
    if (!activeProfile) return;
    const on = (e.currentTarget as HTMLInputElement).checked;
    updateProfile(activeProfile.id, { ignoreEnvKeys: on });
    // envKeyFor() consults the profile, so the "from .env" badges and the
    // key each provider would actually use both change with this. Reload
    // so every already-read value is re-resolved rather than half-stale.
    location.reload();
  }

  let defaultProvider: LLMProvider = FALLBACK_PROVIDER;
  let defaultModel: string = FALLBACK_MODEL;
  let apiKeys: Record<string, string> = {};
  let envKeys: Record<string, boolean> = {};
  let saved = false;
  let ollamaEndpoint = "";

  // Which provider's key the dropdown below is currently showing/editing.
  // Was previously every non-Ollama provider's key field shown at once —
  // a wall of 17 inputs. One at a time, picked via dropdown, like the
  // Default Provider & Model section above it.
  let apiKeyProvider: LLMProvider = FALLBACK_PROVIDER;
  // Ollama is local and unauthenticated. Nous Portal goes through the
  // Hermes subscription proxy, which attaches its own credential, so a
  // pasted key is not sent.
  const KEYLESS_PROVIDERS = new Set<LLMProvider>(["ollama", "nous", "claude_directsdk"]);
  const KEY_EDITABLE_PROVIDERS = PROVIDER_ENTRIES.filter(([id]) => !KEYLESS_PROVIDERS.has(id));

  function defaultKeyProvider(preferred: LLMProvider): LLMProvider {
    if (!KEYLESS_PROVIDERS.has(preferred)) return preferred;
    return KEY_EDITABLE_PROVIDERS[0][0];
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
    const value = (e.currentTarget as HTMLSelectElement).value as LLMProvider;
    selectApiKeyProvider(value);
  }

  function selectApiKeyProvider(providerId: LLMProvider): void {
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

  function apiKeyStorageKey(providerId: LLMProvider): string {
    return scopedKey(`valhallaai-apikey-${providerId}`);
  }

  onMount(async () => {
    await loadEnvProviderKeys();
    // Load saved preferences
    const savedPrefs = localStorage.getItem(scopedKey("valhallaai-prefs"));
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

    // Load any previously-saved per-provider API keys. Keyless providers
    // (Ollama, Nous Portal) are excluded — there is nothing to paste.
    for (const providerId of Object.keys(PROVIDERS) as LLMProvider[]) {
      if (KEYLESS_PROVIDERS.has(providerId)) continue;
      const stored = localStorage.getItem(apiKeyStorageKey(providerId)) || "";
      envKeys[providerId] = Boolean(envKeyFor(providerId));
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

  function saveApiKey(providerId: LLMProvider, value: string): void {
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
  let lastProvider: LLMProvider | null = null;
  $: if (defaultProvider && defaultProvider !== lastProvider) {
    const models = PROVIDERS[defaultProvider]?.models || [];
    if (models.length > 0 && !models.includes(defaultModel)) {
      defaultModel = models[0];
    }
    lastProvider = defaultProvider;
  }
</script>

<div class="container">
  <h2>Settings</h2>

  <div class="settings-panel">
    <section class="section">
      <h3>Profile</h3>
      <p class="section-hint">
        A profile keeps its own chat sessions, default model, and saved API keys.
        Everything stays on this machine — there is no account and nothing syncs.
      </p>

      <div class="profile-row">
        {#if activeProfile?.avatarUrl}
          <img class="avatar" src={activeProfile.avatarUrl} alt="" />
        {:else}
          <span class="avatar avatar-initial">
            {(activeProfile?.name ?? "L").trim().charAt(0).toUpperCase()}
          </span>
        {/if}
        <div class="profile-id">
          {#if renaming}
            <input
              class="rename-input"
              bind:value={renameValue}
              on:keydown={(e) => e.key === "Enter" && commitRename()}
              placeholder="Profile name"
            />
            <button class="link-btn" on:click={commitRename}>Save</button>
            <button class="link-btn" on:click={() => (renaming = false)}>Cancel</button>
          {:else}
            <strong>{activeProfile?.name ?? "Local"}</strong>
            <button class="link-btn" on:click={beginRename}>Rename</button>
          {/if}
          <div class="profile-email">{activeProfile?.email ?? "Not signed in"}</div>
        </div>
      </div>

      <div class="signin-block">
        {#if isSignedIn(activeProfile)}
          <button class="signin-btn" on:click={signOut}>Sign out of Google</button>
          <p class="section-hint">
            Signed in as {activeProfile?.email}. Signing out clears the name, email,
            and avatar only — this profile's chats, keys, and settings stay put.
          </p>
        {:else}
          <button
            class="signin-btn"
            on:click={signInWithGoogle}
            disabled={!googleClientId || !inTauri() || signingIn}
            title={!inTauri()
              ? "Only works in the desktop app"
              : !googleClientId
                ? "Set VITE_GOOGLE_CLIENT_ID in .env"
                : "Sign in with Google"}
          >
            <span class="g-mark">G</span>
            {signingIn ? "Waiting for your browser…" : "Sign in with Google"}
          </button>
          <p class="section-hint">
            {#if !inTauri()}
              Sign-in only runs in the desktop app — it needs a local port the
              browser can't open.
            {:else if !googleClientId}
              Set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code> (see
              <code>env.example</code>), then restart the dev server.
            {:else}
              Attaches a name, email, and avatar to this profile. Nothing syncs —
              there is no server. No access or refresh token is kept, because
              nothing here calls a Google API.
            {/if}
          </p>
        {/if}
        {#if signInError}
          <p class="signin-error">{signInError}</p>
        {/if}
      </div>

      <div class="field">
        <label class="checkbox-row" for="ignore-env">
          <input
            id="ignore-env"
            type="checkbox"
            checked={activeProfile?.ignoreEnvKeys ?? false}
            on:change={toggleIgnoreEnv}
          />
          <span>Ignore <code>.env</code> keys for this profile</span>
        </label>
        <small>
          Off: a key in <code>.env</code> wins over one saved here, so rotating the
          file changes what the next chat uses. On: this profile uses only its own
          saved keys. <code>.env</code> stays shared either way — the agent scripts
          and docker-compose read that same file with no idea which profile is active.
        </small>
      </div>

      <div class="field">
        <label for="new-profile">Add a profile:</label>
        <div class="inline-row">
          <input
            id="new-profile"
            bind:value={newProfileName}
            placeholder="e.g. Work"
            on:keydown={(e) => e.key === "Enter" && addProfile()}
          />
          <button on:click={addProfile} disabled={!newProfileName.trim()}>Create</button>
        </div>
      </div>

      {#if profileNotice}
        <p class="profile-notice">{profileNotice}</p>
      {/if}

      <button class="danger-btn" on:click={removeActiveProfile}>
        Delete this profile
      </button>
    </section>

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
          {#each KEY_EDITABLE_PROVIDERS as [providerId, { name }]}
            <option value={providerId}>{name}{apiKeys[providerId] ? " ✓" : ""}</option>
          {/each}
        </select>
      </div>

      {#key apiKeyProvider}
        {#if envKeys[apiKeyProvider]}
          <p class="key-saved-status">✓ {PROVIDERS[apiKeyProvider]?.name} key loaded from .env</p>
        {:else if editingKey}
          <div class="field">
            <label for="apikey-value">{PROVIDERS[apiKeyProvider]?.name} API Key:</label>
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
            <span class="key-saved-status">✓ {PROVIDERS[apiKeyProvider]?.name} key saved</span>
            <button class="edit-key-btn" on:click={startEditingKey}>Edit</button>
          </div>
        {/if}
      {/key}
      <small>✓ next to a provider means a key is available, from .env or saved in the app.</small>
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
  .section-hint {
    font-size: 0.82rem;
    color: var(--text-muted);
    margin: 0 0 1rem;
    line-height: 1.5;
  }

  .profile-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .avatar {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
  }

  .avatar-initial {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }

  .profile-id {
    min-width: 0;
  }

  .profile-email {
    font-size: 0.8rem;
    opacity: 0.7;
  }

  .link-btn {
    padding: 0 0.35rem;
    margin-left: 0.4rem;
    font-family: inherit;
    font-size: 0.78rem;
    color: var(--accent);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
  }

  .rename-input {
    font-family: inherit;
    font-size: 0.9rem;
    padding: 0.25rem 0.4rem;
  }

  .signin-block {
    margin-bottom: 1rem;
  }

  .signin-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.9rem;
    font-family: inherit;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-surface);
    color: var(--text-primary);
    cursor: pointer;
  }

  .signin-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .g-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
    font-size: 0.72rem;
  }

  .signin-error {
    margin: 0.5rem 0 0;
    font-size: 0.82rem;
    line-height: 1.5;
    color: #ff8a80;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 400;
  }

  .inline-row {
    display: flex;
    gap: 0.5rem;
  }

  .inline-row input {
    flex: 1;
  }

  .profile-notice {
    font-size: 0.82rem;
    color: var(--text-secondary);
  }

  .danger-btn {
    font-family: inherit;
    font-size: 0.85rem;
    padding: 0.4rem 0.8rem;
    color: #b42318;
    background: transparent;
    border: 1px solid #b42318;
    border-radius: 6px;
    cursor: pointer;
  }

  .danger-btn:hover {
    background: rgba(180, 35, 24, 0.08);
  }

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
</style>
