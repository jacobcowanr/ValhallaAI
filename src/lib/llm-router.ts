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
 *
 * Anthropic calls from this window fail with "Load failed" (WebKit hides
 * the CORS rejection). Those go through the `anthropic_messages` command
 * in the desktop process instead.
 */

import { invoke } from "@tauri-apps/api/tauri";
import { inTauri } from "./provider-keys";

/** The built-in provider set. The catalog (providers.ts) is keyed by this,
 *  and it is what the compile-time-known code paths switch on.
 *
 *  It is deliberately NOT the type of a provider id in flight: a
 *  user-defined provider's id is created at runtime, so LLMConfig.provider
 *  and the UI state are plain strings that this set is a subset of. */
export type LLMProvider = "anthropic" | "chatgpt" | "claude_directsdk" | "fireworks" | "google" | "groq" | "minimax" | "nous" | "ollama" | "openrouter" | "perplexity" | "qwen" | "xai_grok";

export interface LLMConfig {
  /** A built-in id or a `custom:<slug>` id registered at runtime. */
  provider: string;
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
 * Providers that can receive images, and the shape each one takes:
 *
 * - OpenAI-compatible dialect (callOpenAICompatible, plus MiniMax and Qwen,
 *   which accept the same content array): the standard image_url block.
 * - Google: `inlineData` parts, built in callGoogle. Verified live.
 * - Anthropic: content blocks with a base64 `source`, built by
 *   toAnthropicContent. The webview path sends these straight to the API, and
 *   `anthropic_messages` in Rust forwards the blocks untouched.
 * - Ollama: a raw-base64 `images` array alongside the text.
 *
 * Deliberately NOT capable:
 * - Claude DirectSDK (the `claude` CLI on the Pro/Max subscription). That
 *   path builds a single text prompt and pipes it to the CLI, so there is no
 *   field an image can travel in — Rust's AnthropicTurn::text() takes the
 *   text and nothing else. Attaching an image here would silently drop it
 *   while the UI implied otherwise, so the provider is left out and the app
 *   says so. Making it work means writing images to files and letting the CLI
 *   read them, which changes what tools the CLI is permitted to use — a
 *   separate decision, not a payload tweak.
 * - Replicate and Hugging Face were removed from the app entirely, so there is
 *   no provider left whose request body has no field for an image except the
 *   CLI path above.
 */
const IMAGE_CAPABLE_PROVIDERS: ReadonlySet<LLMProvider> = new Set([
  "openrouter",
  "chatgpt",
  "xai_grok",
  "nous",
  "fireworks",
  "groq",
  "perplexity",
  "google",
  "anthropic",
  "minimax",
  "qwen",
  "ollama",
]);

/**
 * User-defined providers, registered by lib/custom-providers.ts from
 * localStorage. Kept here as a lookup rather than a second catalog so
 * callLLM() stays the only place that decides which implementation runs.
 *
 * `LLMProvider` stays a closed union on purpose: the built-in set is
 * compile-time known, and widening it to `string` would cost type safety
 * at all ~40 reference sites to support a runtime-defined case. A custom
 * provider is matched here by id instead, at the one place that needs it.
 */
interface CustomEndpoint {
  name: string;
  endpoint: string;
}

const customEndpoints = new Map<string, CustomEndpoint>();

export function registerCustomProviders(
  list: { id: string; name: string; endpoint: string }[]
): void {
  customEndpoints.clear();
  for (const provider of list) {
    customEndpoints.set(provider.id, { name: provider.name, endpoint: provider.endpoint });
  }
}

export function resolveCustomEndpoint(provider: string): CustomEndpoint | undefined {
  return customEndpoints.get(provider);
}

export function providerSupportsImages(provider: LLMProvider | string): boolean {
  // A custom provider goes through callOpenAICompatible and inherits its
  // multimodal handling, so it can be offered the same attachment UI as the
  // built-ins that share that helper.
  if (customEndpoints.has(provider)) return true;
  return IMAGE_CAPABLE_PROVIDERS.has(provider as LLMProvider);
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
      case "minimax":
        return await callMiniMax(config, messages);
      case "nous":
        return await callNous(config, messages);
      case "ollama":
        return await callOllama(config, messages);
      case "openrouter":
        return await callOpenRouter(config, messages);
      case "perplexity":
        return await callPerplexity(config, messages);
      case "qwen":
        return await callQwen(config, messages);
      case "xai_grok":
        return await callGrok(config, messages);
      default: {
        // A user-defined provider (Settings → Custom Providers). It speaks
        // the OpenAI dialect by definition, so it goes through the same
        // helper as the seven built-ins that do, not a second code path.
        const custom = resolveCustomEndpoint(config.provider);
        if (custom) {
          return await callOpenAICompatible(config, messages, {
            endpoint: custom.endpoint,
            authHeader: bearerIfPresent,
          });
        }
        return {
          success: false,
          error: `Unknown provider: ${config.provider}`,
        };
      }
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

/**
 * Turn a failed Response into something a person can act on.
 *
 * Returning `HTTP 503` on its own is what made a transient Google capacity
 * spike look like a broken API key — Google's body said "this model is
 * currently experiencing high demand", and the app threw that away. Most
 * providers explain themselves in the body; the status code alone discards
 * the only part that says what to do next.
 */
async function describeHttpError(response: Response): Promise<string> {
  const status = `HTTP ${response.status}`;
  try {
    const text = await response.text();
    if (!text) return status;
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    const message = parsed?.error?.message;
    if (typeof message === "string" && message) {
      return `${status}: ${message}`;
    }
    // A non-JSON error body (an HTML gateway page, say) is still worth a
    // short slice — better than nothing at all.
    return `${status}: ${text.slice(0, 200).trim()}`;
  } catch {
    // Body already consumed or not readable. The status is all we have.
    return status;
  }
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
 * Split a data URL into its media type and base64 payload.
 *
 * Images arrive as `data:image/png;base64,....` and every provider wants
 * those two halves apart — but each wants them in a different field name and
 * a different nesting. One parser, several emitters, so the splitting is not
 * reimplemented (and re-bugged) per provider.
 *
 * Returns null for anything that is not a base64 data URL, so a malformed
 * attachment is skipped rather than sent as a string the provider will reject.
 */
function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

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

/**
 * Anthropic's content blocks. Same idea as the OpenAI array, different
 * field names: `source` carries the media type and the base64 separately,
 * and the data URL wrapper must NOT be included — Anthropic rejects it.
 */
function toAnthropicContent(msg: LLMMessage): string | Record<string, unknown>[] {
  if (!msg.images || msg.images.length === 0) return msg.content;
  const blocks: Record<string, unknown>[] = [{ type: "text", text: msg.content }];
  for (const url of msg.images) {
    const parsed = parseDataUrl(url);
    if (!parsed) continue;
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: parsed.mimeType, data: parsed.base64 },
    });
  }
  return blocks;
}

async function callOpenAICompatible(
  config: LLMConfig,
  messages: LLMMessage[],
  opts: OpenAICompatibleOptions
): Promise<LLMResponse> {
  // A user-defined provider is allowed to be keyless. A self-hosted gateway
  // (LiteLLM, vLLM, llama.cpp, LM Studio) usually sits on localhost with no
  // auth at all, and refusing client-side would make exactly the case this
  // feature exists for unusable. We cannot know either way for an arbitrary
  // URL, so the request goes out and the endpoint's own 401 is the error the
  // user sees — which names the real problem better than a blanket refusal.
  if (!resolveCustomEndpoint(config.provider)) {
    const missingKey = requireApiKey(config);
    if (missingKey) return missingKey;
  }

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

/** For a user-defined endpoint that may want no Authorization header at all:
 *  send one when a key was configured, omit the header otherwise. */
function bearerIfPresent(key: string): Record<string, string> {
  return key ? bearer(key) : {};
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
 * Anthropic rejects a `system` role inside `messages`, and it rejects an
 * empty turn. The chat history stores those anyway when a previous reply
 * had no text.
 */
function toAnthropicMessages(messages: LLMMessage[]): { role: "user" | "assistant"; content: string | Record<string, unknown>[] }[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    // Keep a turn that has an image even when its text is empty — a screenshot
    // dropped with no caption is still a real message, and dropping it here
    // would silently lose the image.
    .filter((message) => message.content.trim().length > 0 || (message.images?.length ?? 0) > 0)
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: toAnthropicContent(message),
    }));
}

/**
 * Anthropic (Claude): direct API (not OpenAI-compatible — different
 * request/response shape, so it stays a standalone implementation).
 *
 * A request from the webview sends an Origin header. Without
 * `anthropic-dangerous-direct-browser-access`, Anthropic answers 401 and
 * omits CORS headers, so the app sees a failed fetch and no reply.
 */
async function callAnthropic(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const missingKey = requireApiKey(config);
  if (missingKey) return missingKey;

  const turns = toAnthropicMessages(messages);
  if (inTauri()) {
    try {
      return await invoke<LLMResponse>("anthropic_messages", {
        request: {
          apiKey: config.apiKey,
          model: config.model,
          maxTokens: config.maxTokens ?? 2048,
          temperature: config.temperature ?? 0.7,
          messages: turns,
        },
      });
    } catch (error) {
      const message = typeof error === "string" ? error : error instanceof Error ? error.message : "Anthropic request failed";
      return { success: false, error: message };
    }
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey as string,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens ?? 2048,
      temperature: config.temperature ?? 0.7,
      messages: turns,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    return {
      success: false,
      error: error?.error?.message || `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  const blocks = Array.isArray(data.content) ? data.content : [];
  const content = blocks
    .map((block: { type?: string; text?: string }) => (typeof block?.text === "string" ? block.text : ""))
    .filter(Boolean)
    .join("\n");
  if (!content) {
    const types = blocks.map((block: { type?: string }) => block?.type).filter(Boolean).join(", ") || "none";
    return {
      success: false,
      error: `Anthropic returned no text (blocks: ${types})`,
    };
  }
  return {
    success: true,
    content,
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    },
  };
}

/**
 * Claude Subscription DirectSDK.
 *
 * Spawns the official `claude` CLI, which is already logged in to the
 * Pro/Max subscription. The paid `ANTHROPIC_API_KEY` is stripped from that
 * process. `anthropic` still uses the paid API key.
 */
async function callClaudeDirectSDK(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  if (!inTauri()) {
    return {
      success: false,
      error: "Claude Subscription DirectSDK only runs inside the desktop app. It uses `claude auth login`, not the API key.",
    };
  }
  try {
    return await invoke<LLMResponse>("claude_subscription", {
      request: {
        model: config.model,
        messages: toAnthropicMessages(messages),
      },
    });
  } catch (error) {
    const message = typeof error === "string" ? error : error instanceof Error ? error.message : "Claude CLI request failed";
    return { success: false, error: message };
  }
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
      messages: messages.map(toOpenAICompatibleMessage),
      temperature: config.temperature ?? 0.7,
      tokens_to_generate: config.maxTokens ?? 2048,
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      error: await describeHttpError(response),
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
        messages: messages.map(toOpenAICompatibleMessage),
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
      error: await describeHttpError(response),
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.output?.text,
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
    contents: turnMessages.map((m) => {
      // Gemini's parts array. Text is one part; each image is an `inlineData`
      // part with the media type and raw base64 split apart (camelCase — the
      // snake_case form is rejected). Shape verified against the live API:
      // a request with an inlineData part was answered correctly.
      const parts: Record<string, unknown>[] = [{ text: m.content }];
      for (const url of m.images ?? []) {
        const parsed = parseDataUrl(url);
        if (!parsed) continue;
        parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } });
      }
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    }),
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
      error: await describeHttpError(response),
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.candidates?.[0]?.content?.parts?.[0]?.text,
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
        // Ollama's own image field: an array of raw base64 strings alongside
        // the text, NOT the OpenAI content array. A vision model (llava and
        // similar) reads `images`; a text-only model ignores it, which is why
        // this is safe to always include.
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          images: m.images?.map((url) => parseDataUrl(url)?.base64).filter(Boolean),
        })),
        temperature: config.temperature ?? 0.7,
        stream: false,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        // Ollama's own body explains most failures (a missing model names
        // itself), so keep it AND the hint -- the hint alone is no help when
        // Ollama is up but the model was never pulled.
        error: `Ollama error at ${baseURL}: ${await describeHttpError(response)}`,
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
