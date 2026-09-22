/**
 * LLM Router
 * Abstraction layer for multiple LLM providers.
 *
 * Credentials come from `config.apiKey`. The desktop app fills that from
 * the project .env for the providers that have a key there, and from
 * Settings otherwise. This file never reads `process.env`. It runs in the
 * browser (Vite-bundled, inside the Tauri webview), where `process` does
 * not exist unless polyfilled; referencing `process.env.X` here was a real
 * bug (not just a style choice) — it throws at call time for every provider
 * that used it, independent of whether the user had already supplied their
 * own key. Fixed 2026-09-21 after a verification pass caught it.
 *
 * Exception: Nous Portal (`callNous`) does not take a user key. It calls
 * the local Hermes subscription proxy, which attaches the Portal credential.
 */

export type LLMProvider = "anthropic" | "anthropic_oauth" | "chatgpt" | "claude_directsdk" | "fireworks" | "google" | "groq" | "huggingface" | "minimax" | "nous" | "ollama" | "openclaw" | "openrouter" | "perplexity" | "qwen" | "replicate" | "together" | "xai_grok";

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /** Data URLs (e.g. "data:image/png;base64,..."). Only sent if the
   * provider is in IMAGE_CAPABLE_PROVIDERS — see providerSupportsImages(). */
  images?: string[];
}

/**
 * Providers that speak the OpenAI-compatible dialect (callOpenAICompatible
 * below) accept the standard multimodal content-array format, so images
 * are wired in there once. The other 9 providers (Anthropic, Google,
 * MiniMax, Qwen, Hugging Face, Ollama, Replicate, Claude DirectSDK) each
 * have their own request shape and don't get image support in this pass —
 * that's real per-provider work, not something to fake. The UI checks this
 * before allowing an attachment to be sent, rather than silently dropping
 * the image for an unsupported provider.
 */
const IMAGE_CAPABLE_PROVIDERS: ReadonlySet<LLMProvider> = new Set([
  "openrouter",
  "chatgpt",
  "xai_grok",
  "nous",
  "fireworks",
  "groq",
  "openclaw",
  "perplexity",
  "together",
]);

export function providerSupportsImages(provider: LLMProvider): boolean {
  return IMAGE_CAPABLE_PROVIDERS.has(provider);
}

export interface LLMResponse {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Route a request to the appropriate LLM provider
 */
export async function callLLM(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  try {
    switch (config.provider) {
      case "anthropic":
      case "anthropic_oauth":
        return await callAnthropic(config, messages);
      case "chatgpt":
        return await callOpenAI(config, messages);
      case "claude_directsdk":
        return await callClaudeDirectSDK(config, messages);
      case "fireworks":
        return await callFireworks(config, messages);
      case "google":
        return await callGoogle(config, messages);
      case "groq":
        return await callGroq(config, messages);
      case "huggingface":
        return await callHuggingFace(config, messages);
      case "minimax":
        return await callMiniMax(config, messages);
      case "nous":
        return await callNous(config, messages);
      case "ollama":
        return await callOllama(config, messages);
      case "openclaw":
        return await callOpenClaw(config, messages);
      case "openrouter":
        return await callOpenRouter(config, messages);
      case "perplexity":
        return await callPerplexity(config, messages);
      case "qwen":
        return await callQwen(config, messages);
      case "replicate":
        return await callReplicate(config, messages);
      case "together":
        return await callTogether(config, messages);
      case "xai_grok":
        return await callGrok(config, messages);
      default:
        return {
          success: false,
          error: `Unknown provider: ${config.provider}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function requireApiKey(config: LLMConfig): LLMResponse | null {
  if (!config.apiKey) {
    return {
      success: false,
      error: `No API key set for ${config.provider}. Add one in Settings.`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared helper for OpenAI-compatible providers
// ---------------------------------------------------------------------------

interface OpenAICompatibleOptions {
  endpoint: string;
  authHeader: (apiKey: string) => Record<string, string>;
  extraHeaders?: Record<string, string>;
}

/**
 * Most providers speak the same dialect: POST {model, messages, temperature,
 * max_tokens} and get back {choices: [{message: {content}}], usage: {...}}.
 * This is the single place that dialect is implemented — provider-specific
 * functions below are thin wrappers that only supply the endpoint and auth.
 *
 * Fixing something here (error handling, the temperature-0 bug, etc.) fixes
 * it for every provider that uses it, instead of needing a matching edit in
 * N near-identical functions.
 */
/**
 * OpenAI's multimodal content-array format: content is either a plain
 * string (text-only, the common case) or an array mixing text and
 * image_url blocks. Messages with no images stay as plain strings —
 * only messages that actually carry attachments get the array form.
 */
function toOpenAICompatibleMessage(msg: LLMMessage): Record<string, unknown> {
  if (!msg.images || msg.images.length === 0) {
    return { role: msg.role, content: msg.content };
  }
  return {
    role: msg.role,
    content: [
      { type: "text", text: msg.content },
      ...msg.images.map((url) => ({ type: "image_url", image_url: { url } })),
    ],
  };
}

async function callOpenAICompatible(
  config: LLMConfig,
  messages: LLMMessage[],
  opts: OpenAICompatibleOptions
): Promise<LLMResponse> {
  const missingKey = requireApiKey(config);
  if (missingKey) return missingKey;

  const response = await fetch(opts.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...opts.authHeader(config.apiKey as string),
      ...opts.extraHeaders,
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(toOpenAICompatibleMessage),
      // `?? 0.7` (not `|| 0.7`) so an explicit temperature of 0
      // (deterministic output) isn't silently replaced with the default.
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 2048,
    }),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const error = await response.json();
      errorMessage = error.error?.message || errorMessage;
    } catch {
      // Response body wasn't JSON (e.g. an HTML error page) — keep the
      // HTTP status as the error message rather than throwing here.
    }
    return { success: false, error: errorMessage };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.choices?.[0]?.message?.content,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}

function bearer(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}` };
}

// ---------------------------------------------------------------------------
// Provider implementations
// ---------------------------------------------------------------------------

/**
 * OpenRouter: aggregated endpoint for multiple models
 */
async function callOpenRouter(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  return callOpenAICompatible(config, messages, {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    authHeader: bearer,
    extraHeaders: {
      "HTTP-Referer": "https://valhallaai.local",
      "X-Title": "ValhallaAI",
    },
  });
}

/**
 * OpenAI / ChatGPT: direct endpoint
 */
async function callOpenAI(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  return callOpenAICompatible(config, messages, {
    endpoint: "https://api.openai.com/v1/chat/completions",
    authHeader: bearer,
  });
}

/**
 * Anthropic (Claude): direct API (not OpenAI-compatible — different
 * request/response shape, so it stays a standalone implementation).
 */
async function callAnthropic(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const missingKey = requireApiKey(config);
  if (missingKey) return missingKey;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey as string,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens ?? 2048,
      temperature: config.temperature ?? 0.7,
      messages: messages,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return {
      success: false,
      error: error.error?.message || `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.content[0]?.text,
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    },
  };
}

/**
 * Claude Subscription DirectSDK.
 *
 * NOT YET IMPLEMENTED as a distinct path — this currently aliases straight
 * to callAnthropic() with a plain x-api-key, same as `anthropic` and
 * `anthropic_oauth`. All three provider ids are listed separately because
 * they're distinct *products* (a plain API key vs. Claude.ai OAuth vs.
 * the Hermes DirectSDK plugin that spawns the local `claude` CLI against a
 * Pro/Max subscription — see the Obsidian vault's Hermes — Local Setup.md
 * for how that actually works today in Hermes itself), but ValhallaAI doesn't
 * yet implement the OAuth or CLI-spawn flows — only the API-key path is
 * real. Flagged honestly rather than left to look implemented.
 */
async function callClaudeDirectSDK(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  return await callAnthropic(config, messages);
}

/**
 * Grok (xAI): direct endpoint
 */
async function callGrok(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  return callOpenAICompatible(config, messages, {
    endpoint: "https://api.x.ai/v1/chat/completions",
    authHeader: bearer,
  });
}

/**
 * Local Hermes subscription proxy. Nous's documented path for a third-party
 * app to use an existing `hermes portal` login:
 * https://hermes-agent.nousresearch.com/docs/user-guide/features/subscription-proxy
 *
 * Direct calls to inference-api.nousresearch.com need a static Portal API
 * key from the dashboard. This machine's login is the OAuth flow Hermes
 * keeps in its own auth file, so a pasted "API key" 401s. The proxy accepts
 * any bearer, ignores it, and attaches the real credential.
 *
 * Prerequisite: `hermes portal` once, then `hermes proxy start` left running.
 * The placeholder below is the docs' own example, not a credential.
 */
const HERMES_PROXY_ORIGIN = "http://127.0.0.1:8645";
const HERMES_PROXY_PLACEHOLDER_KEY = "sk-unused";

async function callNous(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  try {
    return await callOpenAICompatible(
      { ...config, apiKey: HERMES_PROXY_PLACEHOLDER_KEY },
      messages,
      {
        endpoint: `${HERMES_PROXY_ORIGIN}/v1/chat/completions`,
        authHeader: bearer,
      }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error:
        `Cannot reach the Hermes subscription proxy at ${HERMES_PROXY_ORIGIN}. ` +
        "Run `hermes portal` once, then leave `hermes proxy start` running. " +
        `(${detail})`,
    };
  }
}

/**
 * Fireworks AI: direct endpoint
 */
async function callFireworks(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  return callOpenAICompatible(config, messages, {
    endpoint: "https://api.fireworks.ai/inference/v1/chat/completions",
    authHeader: bearer,
  });
}

/**
 * Groq: fast inference
 */
async function callGroq(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  return callOpenAICompatible(config, messages, {
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    authHeader: bearer,
  });
}

/**
 * OpenClaw
 */
async function callOpenClaw(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  return callOpenAICompatible(config, messages, {
    endpoint: "https://api.openclaw.ai/v1/chat/completions",
    authHeader: bearer,
  });
}

/**
 * Perplexity: search + LLM
 */
async function callPerplexity(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  return callOpenAICompatible(config, messages, {
    endpoint: "https://api.perplexity.ai/chat/completions",
    authHeader: bearer,
  });
}

/**
 * Together AI
 */
async function callTogether(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  return callOpenAICompatible(config, messages, {
    endpoint: "https://api.together.xyz/v1/chat/completions",
    authHeader: bearer,
  });
}

/**
 * MiniMax: different request/response shape from the OpenAI dialect,
 * so it stays a standalone implementation.
 */
async function callMiniMax(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const missingKey = requireApiKey(config);
  if (missingKey) return missingKey;

  const response = await fetch("https://api.minimax.chat/v1/text/chatcompletion", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages,
      temperature: config.temperature ?? 0.7,
      tokens_to_generate: config.maxTokens ?? 2048,
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.reply,
  };
}

/**
 * Qwen: different request/response shape (DashScope), stays standalone.
 */
async function callQwen(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const missingKey = requireApiKey(config);
  if (missingKey) return missingKey;

  const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: {
        messages: messages,
      },
      parameters: {
        temperature: config.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 2048,
      },
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.output?.text,
  };
}

/**
 * Hugging Face Inference API: different shape, stays standalone.
 */
async function callHuggingFace(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const missingKey = requireApiKey(config);
  if (missingKey) return missingKey;

  const response = await fetch("https://api-inference.huggingface.co/models/" + config.model, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: messages.map((m) => m.content).join(" "),
      parameters: {
        temperature: config.temperature ?? 0.7,
        max_new_tokens: config.maxTokens ?? 2048,
      },
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data[0]?.generated_text || data.text,
  };
}

/**
 * Google Gemini. Different request shape (contents/parts) AND semantics —
 * unlike the OpenAI-style providers, Gemini has a dedicated systemInstruction
 * field rather than a "system" role turn inside the conversation. Messages
 * with role "system" are extracted and sent there instead of being folded
 * into the conversation as a user turn.
 */
async function callGoogle(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const missingKey = requireApiKey(config);
  if (missingKey) return missingKey;

  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const turnMessages = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    contents: turnMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.maxTokens ?? 2048,
    },
  };

  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.candidates?.[0]?.content?.parts?.[0]?.text,
  };
}

/**
 * Replicate: model hosting. Predictions are created asynchronously —
 * the initial POST returns a "starting"/"processing" prediction, not the
 * final output, so this polls the prediction's status URL until it reaches
 * a terminal state (succeeded/failed/canceled) or times out.
 */
async function callReplicate(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const missingKey = requireApiKey(config);
  if (missingKey) return missingKey;

  const authHeaders = {
    "Authorization": `Token ${config.apiKey}`,
    "Content-Type": "application/json",
  };

  const createResponse = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      version: config.model,
      input: {
        prompt: messages[messages.length - 1]?.content || "",
      },
    }),
  });

  if (!createResponse.ok) {
    return {
      success: false,
      error: `HTTP ${createResponse.status}`,
    };
  }

  let prediction = await createResponse.json();

  const POLL_INTERVAL_MS = 1000;
  const MAX_POLLS = 60; // ~60s timeout — Replicate predictions can run long
  const terminalStates = new Set(["succeeded", "failed", "canceled"]);
  let polls = 0;

  while (!terminalStates.has(prediction.status) && polls < MAX_POLLS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusURL = prediction.urls?.get;
    if (!statusURL) {
      return { success: false, error: "Replicate response missing status URL" };
    }

    const pollResponse = await fetch(statusURL, {
      headers: { "Authorization": `Token ${config.apiKey}` },
    });
    if (!pollResponse.ok) {
      return {
        success: false,
        error: `Replicate polling failed: HTTP ${pollResponse.status}`,
      };
    }

    prediction = await pollResponse.json();
    polls++;
  }

  if (prediction.status === "succeeded") {
    const output = Array.isArray(prediction.output)
      ? prediction.output.join("")
      : prediction.output;
    return { success: true, content: output };
  }

  if (prediction.status === "failed" || prediction.status === "canceled") {
    return {
      success: false,
      error: prediction.error || `Replicate prediction ${prediction.status}`,
    };
  }

  return {
    success: false,
    error: `Replicate prediction did not complete within ${MAX_POLLS}s (still ${prediction.status})`,
  };
}

/**
 * Ollama: local LLM runtime. No API key required — falls back through
 * config.baseURL, then the endpoint saved in Settings (localStorage), then
 * the Ollama default.
 */
async function callOllama(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const baseURL =
    config.baseURL ||
    (typeof localStorage !== "undefined" && localStorage.getItem("ollama-endpoint")) ||
    "http://localhost:11434";

  try {
    const response = await fetch(`${baseURL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        temperature: config.temperature ?? 0.7,
        stream: false,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Ollama error: HTTP ${response.status}. Make sure Ollama is running at ${baseURL}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      content: data.message?.content,
      usage: {
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to connect to Ollama at ${baseURL}. Is it running? (ollama serve)`,
    };
  }
}

/**
 * Get available models from OpenRouter
 */
export async function getOpenRouterModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.data?.map((m: any) => m.id) || [];
  } catch {
    return [];
  }
}
