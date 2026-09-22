<script lang="ts">
  import { onMount } from "svelte";
  import {
    callLLM,
    providerSupportsImages,
    type LLMProvider,
  } from "../lib/llm-router";
  import { PROVIDERS, PROVIDER_ENTRIES, FALLBACK_PROVIDER, FALLBACK_MODEL } from "../lib/providers";
  import { loadEnvProviderKeys, resolveApiKey } from "../lib/provider-keys";
  import { sessions, activeSessionId, createSession, appendToSession } from "../lib/sessions";

  // Passed down from App.svelte rather than imported directly here, so
  // there's one import of the logo asset, not one per place it's shown.
  export let logoWordmark: string;

  interface AttachedImage {
    name: string;
    dataUrl: string;
  }

  let selectedProvider: LLMProvider = FALLBACK_PROVIDER;
  let selectedModel: string = FALLBACK_MODEL;
  let apiKey = "";
  let userMessage = "";
  let loading = false;

  // Messages now live in the sessions store (src/lib/sessions.ts), not
  // local component state — previously `responses` was ephemeral, lost on
  // every tab switch or restart, with no way to have more than one
  // conversation. Read-only here; sendMessage() below writes through
  // appendToSession() instead of mutating an array directly.
  $: responses = $sessions.find((s) => s.id === $activeSessionId)?.messages ?? [];

  let attachedImages: AttachedImage[] = [];
  let attachMenuOpen = false;
  let fileInput: HTMLInputElement;
  let attachError = "";

  function apiKeyStorageKey(providerId: LLMProvider): string {
    return `valhallaai-apikey-${providerId}`;
  }

  function loadApiKeyFor(providerId: LLMProvider): void {
    // .env wins when the desktop app can read it. A key saved in Settings
    // is the fallback for providers that file does not cover.
    const stored = localStorage.getItem(apiKeyStorageKey(providerId)) || "";
    apiKey = resolveApiKey(providerId, stored);
  }

  function loadGlobalDefaultProviderModel(): { provider: LLMProvider; model: string } {
    const prefs = localStorage.getItem("valhallaai-prefs");
    if (prefs) {
      const { defaultProvider, defaultModel } = JSON.parse(prefs) as {
        defaultProvider?: LLMProvider;
        defaultModel?: string;
      };
      // A previously-saved provider can disappear from the catalog (e.g. the
      // GitHub Copilot removal). Falling back here instead of trusting the
      // stored value keeps the model dropdown from silently rendering empty
      // and callLLM() from failing with "Unknown provider" on every send.
      if (defaultProvider && PROVIDERS[defaultProvider]) {
        return {
          provider: defaultProvider,
          model:
            defaultModel && PROVIDERS[defaultProvider].models.includes(defaultModel)
              ? defaultModel
              : PROVIDERS[defaultProvider].models[0],
        };
      }
    }
    return { provider: FALLBACK_PROVIDER, model: FALLBACK_MODEL };
  }

  // Single source of truth for what selectedProvider/selectedModel should
  // be: the active session's own provider/model if one exists (switching
  // to a past session restores what it was actually using), otherwise the
  // user's global default. Called once on mount AND every time the active
  // session id changes — both paths go through the same function instead
  // of two competing pieces of logic (which is what caused a real bug
  // here: onMount's prefs-load used to run after, and clobber, a separate
  // reactive block that restored the session's provider/model).
  function syncProviderModelToActiveSession(): void {
    const session = $sessions.find((s) => s.id === $activeSessionId);
    if (session) {
      selectedProvider = session.provider;
      selectedModel = session.model;
    } else {
      const defaults = loadGlobalDefaultProviderModel();
      selectedProvider = defaults.provider;
      selectedModel = defaults.model;
    }
    loadApiKeyFor(selectedProvider);
  }

  onMount(async () => {
    await loadEnvProviderKeys();
    syncProviderModelToActiveSession();
  });

  let lastActiveSessionId: string | null = null;
  $: if ($activeSessionId !== lastActiveSessionId) {
    lastActiveSessionId = $activeSessionId;
    syncProviderModelToActiveSession();
  }

  // Re-load the saved key whenever the provider changes, so switching
  // providers doesn't leave the previous provider's key sitting around (or
  // silently send it to the wrong API).
  $: loadApiKeyFor(selectedProvider);

  // Live warning as soon as a provider switch makes existing attachments
  // unsendable — don't wait until the user hits Send to tell them.
  $: imagesSupported = providerSupportsImages(selectedProvider);
  $: if (attachedImages.length > 0 && !imagesSupported) {
    attachError = `${PROVIDERS[selectedProvider]?.name} doesn't support image attachments. Remove the image(s) or switch providers.`;
  } else {
    attachError = "";
  }

  function toggleAttachMenu(): void {
    attachMenuOpen = !attachMenuOpen;
  }

  function closeAttachMenu(): void {
    attachMenuOpen = false;
  }

  function triggerFilePicker(): void {
    closeAttachMenu();
    fileInput.click();
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelect(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue; // matches accept="image/*", but File inputs can still surface other types on some platforms
      const dataUrl = await readFileAsDataUrl(file);
      attachedImages = [...attachedImages, { name: file.name, dataUrl }];
    }

    input.value = ""; // allow re-selecting the same file
  }

  function removeAttachment(index: number): void {
    attachedImages = attachedImages.filter((_, i) => i !== index);
  }

  async function sendMessage(): Promise<void> {
    if (!userMessage.trim() && attachedImages.length === 0) return;
    if (attachedImages.length > 0 && !imagesSupported) return; // attachError already shown

    loading = true;
    const imageUrls = attachedImages.map((img) => img.dataUrl);
    const imageCount = attachedImages.length;
    const outgoingText = userMessage;

    // A session gets created lazily, on the first message, rather than
    // requiring the "New Session" button first — the empty state's own
    // hint ("Send a message to start chatting") promises this works
    // without an extra click.
    let sessionId = $activeSessionId;
    if (!sessionId) {
      sessionId = createSession(selectedProvider, selectedModel);
    }

    // Send the FULL prior conversation as context, not just the new
    // message in isolation. Every message here used to go to the model
    // with zero memory of anything said before it, even mid-"session" —
    // that was true before sessions existed too, but it's a much more
    // visible gap now that there's an actual persisted conversation to
    // draw context from, so fixing it here rather than leaving sessions
    // as history-only-for-display.
    const priorTurns = responses.map((msg) => ({
      role: msg.type === "user" ? ("user" as const) : ("assistant" as const),
      content: msg.text,
    }));

    const response = await callLLM(
      {
        provider: selectedProvider,
        model: selectedModel,
        apiKey: apiKey,
      },
      [
        ...priorTurns,
        { role: "user", content: outgoingText, images: imageUrls.length > 0 ? imageUrls : undefined },
      ]
    );

    appendToSession(
      sessionId,
      [
        {
          type: "user",
          text: outgoingText,
          imageCount: imageCount > 0 ? imageCount : undefined,
        },
        {
          type: "assistant",
          text: response.success ? (response.content ?? "") : `Error: ${response.error}`,
          usage: response.usage,
        },
      ],
      selectedProvider,
      selectedModel
    );

    userMessage = "";
    attachedImages = [];
    loading = false;
  }
</script>

<div class="screen">
  <div class="messages">
    <div class="messages-inner">
      {#if responses.length === 0}
        <div class="empty-state">
          <img class="empty-logo" src={logoWordmark} alt="ValhallaAI" />
          <p class="tagline">Multi-agent orchestration • Model switching • Vault coordination</p>
          <p class="hint-primary">Send a message to start chatting.</p>
          {#if selectedProvider === "nous"}
            <p class="hint">
              Nous Portal uses the local Hermes proxy. Run <code>hermes portal</code> once, then leave
              <code>hermes proxy start</code> running. No API key.
            </p>
          {:else if !apiKey && selectedProvider !== "ollama"}
            <p class="hint">
              No API key set for {PROVIDERS[selectedProvider]?.name} yet — add one in
              <strong>⚙ Settings</strong>.
            </p>
          {/if}
        </div>
      {/if}
      {#each responses as msg}
        <div class="message {msg.type}">
          {#if msg.imageCount}
            <div class="attachment-note">📎 {msg.imageCount} image{msg.imageCount > 1 ? "s" : ""} attached</div>
          {/if}
          <div class="content">{msg.text}</div>
          {#if msg.usage}
            <div class="usage">
              {msg.usage.inputTokens} in • {msg.usage.outputTokens} out
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="composer">
    <div class="composer-inner">
      {#if attachedImages.length > 0}
        <div class="attachments">
          {#each attachedImages as img, i}
            <div class="attachment-chip">
              <img src={img.dataUrl} alt={img.name} />
              <button class="remove-chip" on:click={() => removeAttachment(i)} title="Remove">✕</button>
            </div>
          {/each}
        </div>
      {/if}

      {#if attachError}
        <p class="attach-error">⚠ {attachError}</p>
      {/if}

      <div class="input-area">
        <div class="attach-wrapper">
          <button
            class="attach-btn"
            on:click={toggleAttachMenu}
            title="Attach"
            aria-haspopup="true"
            aria-expanded={attachMenuOpen}
          >
            +
          </button>
          {#if attachMenuOpen}
            <button class="menu-backdrop" on:click={closeAttachMenu} aria-label="Close menu"></button>
            <div class="attach-menu">
              <button class="attach-menu-item" on:click={triggerFilePicker}>
                <span class="menu-icon">🖼</span> Upload image{!imagesSupported ? " (not supported by this provider)" : ""}
              </button>
            </div>
          {/if}
        </div>

        <input
          type="file"
          accept="image/*"
          multiple
          bind:this={fileInput}
          on:change={handleFileSelect}
          style="display: none;"
        />

        <textarea
          bind:value={userMessage}
          placeholder="Send a message..."
          on:keydown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
        />
        <button
          class="send-btn"
          on:click={sendMessage}
          disabled={loading || (attachedImages.length > 0 && !imagesSupported)}
        >
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </div>

    <div class="model-bar">
      <div class="picker">
        <label class="picker-label" for="model-bar-provider">Provider</label>
        <select id="model-bar-provider" bind:value={selectedProvider}>
          {#each PROVIDER_ENTRIES as [key, { name }]}
            <option value={key}>{name}</option>
          {/each}
        </select>
      </div>

      <div class="picker">
        <label class="picker-label" for="model-bar-model">Model</label>
        <select id="model-bar-model" bind:value={selectedModel}>
          {#each PROVIDERS[selectedProvider]?.models || [] as model}
            <option value={model}>{model}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    /* .content in App.svelte already has 2rem of padding; pull the composer
       out to the very edges so the model bar can span the full width. */
    margin: -2rem;
    padding: 2rem 2rem 0 2rem;
  }

  /* Narrow, centered chat column — the background stays full-bleed dark,
     only the actual conversation content is constrained, similar to
     Gemini's centered input/conversation column. */
  .messages {
    flex: 1;
    overflow-y: auto;
    display: flex;
    justify-content: center;
  }

  .messages-inner {
    width: 100%;
    max-width: 720px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-bottom: 1rem;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--text-secondary);
    min-height: 320px;
  }

  .empty-logo {
    height: 72px;
    width: auto;
    margin-bottom: 1.25rem;
  }

  .empty-state .tagline {
    margin: 0 0 2rem 0;
    font-size: 0.95rem;
    color: var(--text-secondary);
  }

  .empty-state .hint-primary {
    margin: 0 0 0.25rem 0;
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0.25rem 0;
  }

  .empty-state .hint {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .message {
    padding: 1rem 1.25rem;
    border-radius: 12px;
    background: var(--bg-surface);
    color: var(--text-primary);
    max-width: 85%;
    line-height: 1.6;
  }

  .message.user {
    align-self: flex-end;
    background: var(--accent);
    color: var(--accent-text);
  }

  .message.assistant {
    align-self: flex-start;
    border: 1px solid var(--border-color);
  }

  .attachment-note {
    font-size: 0.8rem;
    opacity: 0.85;
    margin-bottom: 0.35rem;
  }

  .content {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .usage {
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
    opacity: 0.8;
  }

  .message.user .usage {
    color: rgba(255, 255, 255, 0.75);
  }

  /* Everything below the message list: attachments, input row, then the
     horizontal provider/model bar underneath — pinned to the bottom of
     the screen, chat gets all the remaining (and dominant) vertical space. */
  .composer {
    flex-shrink: 0;
    border-top: 1px solid var(--border-color);
    background: var(--bg-surface);
  }

  .composer-inner {
    max-width: 720px;
    margin: 0 auto;
    padding: 1rem 2rem;
  }

  .attachments {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }

  .attachment-chip {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border-color);
  }

  .attachment-chip img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .remove-chip {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    font-size: 0.65rem;
    line-height: 1;
    cursor: pointer;
  }

  .attach-error {
    margin: 0 0 0.5rem 0;
    font-size: 0.8rem;
    color: var(--warning-text);
  }

  .input-area {
    display: flex;
    align-items: flex-end;
    gap: 0.6rem;
  }

  .attach-wrapper {
    position: relative;
  }

  .attach-btn {
    width: 40px;
    height: 40px;
    padding: 0;
    border-radius: 50%;
    background: var(--bg-surface-raised);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    font-size: 1.3rem;
    font-weight: 400;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .attach-btn:hover {
    background: var(--bg-surface-hover);
  }

  .menu-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    padding: 0;
    cursor: default;
    z-index: 5;
  }

  .attach-menu {
    position: absolute;
    bottom: 48px;
    left: 0;
    min-width: 240px;
    background: var(--bg-surface-raised);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    padding: 0.4rem;
    z-index: 10;
  }

  .attach-menu-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.6rem 0.75rem;
    background: none;
    border: none;
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
  }

  .attach-menu-item:hover {
    background: var(--bg-surface-hover);
  }

  .menu-icon {
    font-size: 1rem;
  }

  textarea {
    flex: 1;
    padding: 0.85rem 1rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.95rem;
    resize: none;
    min-height: 52px;
    max-height: 200px;
    background: var(--bg-surface-raised);
    color: var(--text-primary);
  }

  textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  .send-btn {
    padding: 0 1.75rem;
    height: 52px;
    background: var(--accent);
    color: var(--accent-text);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.2s;
    flex-shrink: 0;
  }

  .send-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* The horizontal provider/model bar — a slim strip along the very
     bottom of the window, distinct from the input row above it, and
     deliberately full-width (unlike the narrower chat column) since it
     reads as a footer/status bar. */
  .model-bar {
    display: flex;
    gap: 1.5rem;
    padding: 0.6rem 2rem;
    border-top: 1px solid var(--border-color);
    background: var(--bg-surface-raised);
  }

  .picker {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .picker-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .picker select {
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 0.85rem;
    background: var(--bg-surface);
    color: var(--text-primary);
  }

  .picker select:focus {
    outline: none;
    border-color: var(--accent);
  }
</style>
