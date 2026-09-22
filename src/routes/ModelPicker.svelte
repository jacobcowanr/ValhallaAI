<script lang="ts">
  import { onMount } from "svelte";
  import { callLLM, type LLMProvider, type LLMResponse } from "../lib/llm-router";
  import { PROVIDERS, PROVIDER_ENTRIES, FALLBACK_PROVIDER, FALLBACK_MODEL } from "../lib/providers";

  interface ChatMessage {
    type: "user" | "assistant";
    text: string;
    usage?: LLMResponse["usage"];
  }

  let selectedProvider: LLMProvider = FALLBACK_PROVIDER;
  let selectedModel: string = FALLBACK_MODEL;
  let apiKey = "";
  let userMessage = "";
  let responses: ChatMessage[] = [];
  let loading = false;

  function apiKeyStorageKey(providerId: LLMProvider): string {
    return `valhallaai-apikey-${providerId}`;
  }

  function loadApiKeyFor(providerId: LLMProvider): void {
    // Read-only here — the API key field itself lives in Settings now, not
    // on this screen. Still needed so sendMessage() has a key to send.
    apiKey = localStorage.getItem(apiKeyStorageKey(providerId)) || "";
  }

  onMount(() => {
    // Load user's saved preferences
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
        selectedProvider = defaultProvider;
        selectedModel =
          defaultModel && PROVIDERS[defaultProvider].models.includes(defaultModel)
            ? defaultModel
            : PROVIDERS[defaultProvider].models[0];
      } else {
        selectedProvider = FALLBACK_PROVIDER;
        selectedModel = FALLBACK_MODEL;
      }
    }
    loadApiKeyFor(selectedProvider);
  });

  // Re-load the saved key whenever the provider changes, so switching
  // providers doesn't leave the previous provider's key sitting around (or
  // silently send it to the wrong API).
  $: loadApiKeyFor(selectedProvider);

  async function sendMessage(): Promise<void> {
    if (!userMessage.trim()) return;

    loading = true;
    const response = await callLLM(
      {
        provider: selectedProvider,
        model: selectedModel,
        apiKey: apiKey,
      },
      [{ role: "user", content: userMessage }]
    );

    responses = [
      ...responses,
      {
        type: "user",
        text: userMessage,
      },
      {
        type: "assistant",
        text: response.success ? (response.content ?? "") : `Error: ${response.error}`,
        usage: response.usage,
      },
    ];

    userMessage = "";
    loading = false;
  }
</script>

<div class="screen">
  <div class="messages">
    {#if responses.length === 0}
      <div class="empty-state">
        <p>Send a message to start chatting.</p>
        {#if !apiKey && selectedProvider !== "ollama"}
          <p class="hint">
            No API key set for {PROVIDERS[selectedProvider]?.name} yet — add one in
            <strong>⚙ Settings</strong>.
          </p>
        {/if}
      </div>
    {/if}
    {#each responses as msg}
      <div class="message {msg.type}">
        <div class="content">{msg.text}</div>
        {#if msg.usage}
          <div class="usage">
            {msg.usage.inputTokens} in • {msg.usage.outputTokens} out
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="composer">
    <div class="input-area">
      <textarea
        bind:value={userMessage}
        placeholder="Send a message..."
        on:keydown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
      />
      <button on:click={sendMessage} disabled={loading}>{loading ? "Sending..." : "Send"}</button>
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

  .messages {
    flex: 1;
    overflow-y: auto;
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
    max-width: 75%;
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

  /* Everything below the message list: input row, then the horizontal
     provider/model bar underneath it — both pinned to the bottom of the
     screen, chat gets all the remaining (and dominant) vertical space. */
  .composer {
    flex-shrink: 0;
    border-top: 1px solid var(--border-color);
    background: var(--bg-surface);
  }

  .input-area {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 2rem;
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

  button {
    padding: 0 1.75rem;
    background: var(--accent);
    color: var(--accent-text);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.2s;
  }

  button:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* The horizontal provider/model bar — a slim strip along the very
     bottom of the window, distinct from the input row above it. */
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
