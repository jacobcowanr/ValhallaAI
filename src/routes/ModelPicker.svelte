<script>
  import { callLLM } from "../lib/llm-router";

  let selectedProvider = "openrouter";
  let selectedModel = "openai/gpt-4o";
  let apiKey = "";
  let userMessage = "";
  let responses = [];
  let loading = false;

  const providers = {
    openrouter: {
      name: "OpenRouter",
      models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "deepseek/deepseek-chat"],
    },
    openai: {
      name: "OpenAI",
      models: ["gpt-4-turbo", "gpt-4o", "gpt-3.5-turbo"],
    },
    deepseek: {
      name: "DeepSeek",
      models: ["deepseek-chat", "deepseek-coder"],
    },
    anthropic: {
      name: "Anthropic",
      models: ["claude-3.5-sonnet", "claude-opus-5", "claude-haiku-4.5"],
    },
    grok: {
      name: "Grok (X.AI)",
      models: ["grok-3", "grok-vision"],
    },
    local: {
      name: "Local (Ollama)",
      models: ["llama2", "mistral", "neural-chat"],
    },
  };

  async function sendMessage() {
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
        text: response.success ? response.content : `Error: ${response.error}`,
        usage: response.usage,
      },
    ];

    userMessage = "";
    loading = false;
  }
</script>

<div class="container">
  <div class="config">
    <div class="field">
      <label>Provider:</label>
      <select bind:value={selectedProvider}>
        {#each Object.entries(providers) as [key, { name }]}
          <option value={key}>{name}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label>Model:</label>
      <select bind:value={selectedModel}>
        {#each providers[selectedProvider]?.models || [] as model}
          <option value={model}>{model}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label>API Key:</label>
      <input type="password" bind:value={apiKey} placeholder="Enter API key (optional if env var set)" />
    </div>
  </div>

  <div class="chat">
    <div class="messages">
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

    <div class="input-area">
      <textarea
        bind:value={userMessage}
        placeholder="Send a message..."
        on:keydown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
      />
      <button on:click={sendMessage} disabled={loading}> {loading ? "Sending..." : "Send"}</button>
    </div>
  </div>
</div>

<style>
  .container {
    display: flex;
    gap: 2rem;
    height: 100%;
  }

  .config {
    flex: 0 0 250px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-weight: 600;
    font-size: 0.9rem;
    color: #333;
  }

  select,
  input {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    padding: 1rem;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .message {
    padding: 1rem;
    border-radius: 8px;
    background: #f5f5f5;
  }

  .message.user {
    align-self: flex-end;
    max-width: 70%;
    background: #667eea;
    color: white;
  }

  .message.assistant {
    align-self: flex-start;
    max-width: 70%;
  }

  .content {
    margin-bottom: 0.5rem;
    line-height: 1.5;
  }

  .usage {
    font-size: 0.8rem;
    color: #666;
    opacity: 0.7;
  }

  .message.user .usage {
    color: rgba(255, 255, 255, 0.7);
  }

  .input-area {
    display: flex;
    gap: 0.5rem;
  }

  textarea {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.9rem;
    resize: none;
    min-height: 60px;
  }

  button {
    padding: 0.75rem 1.5rem;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.2s;
  }

  button:hover:not(:disabled) {
    background: #764ba2;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
