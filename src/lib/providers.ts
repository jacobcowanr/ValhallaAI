/**
 * Canonical provider catalog — the single source of truth for provider
 * names, display names, and model lists.
 *
 * Settings.svelte and ModelPicker.svelte both import this instead of each
 * keeping their own copy (they used to; a 2026-09-21 verification pass
 * found the two copies were byte-identical, meaning they hadn't drifted
 * *yet* — this module is what keeps it that way).
 *
 * This list is also the ground truth for "how many providers ValhallaAI
 * supports." Docs (README, ARCHITECTURE, POSITIONING) should say
 * Object.keys(PROVIDERS).length, not a hand-maintained number — that
 * number drifted out of sync with the code before (19 router cases vs. 18
 * catalog entries vs. "17" in prose) specifically because it lived in
 * three places by hand.
 */

import type { LLMProvider } from "./llm-router";

export interface ProviderEntry {
  name: string;
  models: string[];
}

export const PROVIDERS: Record<LLMProvider, ProviderEntry> = {
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
    // Nous Portal aggregates 300+ models across vendors (OpenRouter-style
    // catalog). This is a curated subset — flagship/notable models per
    // major vendor, not the full list, which would make the dropdown
    // unusable. Slugs follow the vendor/model-name convention already
    // used elsewhere in this file; they're constructed to match that
    // pattern, not individually verified against a live Nous API call —
    // same approach as every other provider's model list in this project.
    // x-ai/grok-4.7 stays first: it's the actual configured default
    // elsewhere (FALLBACK_MODEL below, Hermes's own default), not just
    // alphabetically/chronologically first.
    name: "Nous Portal",
    models: [
      "x-ai/grok-4.7",
      "x-ai/grok-4.6",
      "anthropic/claude-opus-5",
      "anthropic/claude-sonnet-5",
      "anthropic/claude-haiku-4.5",
      "openai/gpt-6-astra",
      "openai/gpt-5.6-terra",
      "openai/gpt-5.5",
      "google/gemini-3.8-flash",
      "google/gemini-3.1-pro-preview",
      "deepseek/deepseek-v4.1-flash",
      "deepseek/deepseek-v4-pro-0813",
      "qwen/qwen3.8-max-0902",
      "qwen/qwen3-coder-480b-a35b",
      "meta-llama/llama-4-maverick",
      "meta-llama/llama-3.3-70b-instruct",
      "moonshotai/kimi-k3",
      "z-ai/glm-5.3",
      "minimax/minimax-m3",
    ],
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
    name: "Replicate (image/video/audio models, not chat LLMs)",
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

export const PROVIDER_COUNT = Object.keys(PROVIDERS).length;

// Object.entries() widens keys to `string` even when the source object is
// typed Record<LLMProvider, ...> — every `{#each Object.entries(PROVIDERS)}`
// in the Svelte components hit that widening once they were actually
// typechecked (svelte-check had never run on them before 2026-09-22; tsc
// alone silently skips .svelte files). Exporting the properly-typed tuple
// list once here, instead of casting at every call site.
export const PROVIDER_ENTRIES: [LLMProvider, ProviderEntry][] = Object.entries(PROVIDERS) as [
  LLMProvider,
  ProviderEntry
][];

export const FALLBACK_PROVIDER: LLMProvider = "nous";
export const FALLBACK_MODEL = "x-ai/grok-4.7";
