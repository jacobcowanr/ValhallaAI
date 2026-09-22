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

// Claude model ids, current as of 2026-09-22. The two Claude providers do
// NOT share one vocabulary, which is why these lists differ on purpose:
//
// `anthropic_oauth` was REMOVED on 2026-09-22. It was labelled "Anthropic
// OAuth (Usage Credits)" but provider-keys.ts copied the paid
// ANTHROPIC_API_KEY into it and it routed to callAnthropic() — so picking it
// billed the API key while telling the user it did not. Anthropic has no
// third-party OAuth API flow to implement instead; the subscription login
// that does exist is the `claude` CLI one, which claude_directsdk already
// uses. A second entry that lied about billing was worse than one fewer
// provider. Do not re-add it without a real auth flow behind it.
//
//   anthropic -> Anthropic Messages API via the
//     `anthropic_messages` command. Needs ids the API itself accepts.
//     `claude-sonnet-4-5` is kept because it was deliberately set in 335994f
//     against the real account; `claude-sonnet-5` is listed above it rather
//     than replacing it, so a wrong guess about account access can't remove
//     a model that was known to work.
//
//   claude_directsdk -> the `claude` CLI via the `claude_subscription`
//     command. `claude --model` accepts full ids *or* aliases ("opus",
//     "sonnet", "fable"), per `claude --help`. Full ids are used here so the
//     picker shows exactly what gets sent.
//
// `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5-1` and
// `claude-haiku-4-5-20251001` were each confirmed on 2026-09-22 by running
// `claude -p --model <id>` with the Anthropic env vars stripped, and each
// returned a reply. Deprecated/legacy dated snapshots are deliberately NOT
// listed: their exact id strings are easy to get wrong from memory, and a
// wrong id in this file is a broken send. Pull them from
// `GET https://api.anthropic.com/v1/models` if the historical set is ever
// needed, rather than hand-writing them here.
export const PROVIDERS: Record<LLMProvider, ProviderEntry> = {
  anthropic: {
    name: "Anthropic API Key",
    models: [
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-fable-5-1",
      "claude-haiku-4-5-20251001",
    ],
  },
  chatgpt: {
    name: "ChatGPT or Codex Subscription",
    models: ["gpt-4-turbo", "gpt-4o", "gpt-3.5-turbo"],
  },
  claude_directsdk: {
    name: "Claude Subscription DirectSDK",
    models: [
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-fable-5-1",
      "claude-haiku-4-5-20251001",
    ],
  },
  fireworks: {
    name: "Fireworks AI",
    models: ["llama-v3p1-405b", "mixtral-8x22b"],
  },
  google: {
    // Verified 2026-09-22 against GET /v1beta/models with the live key: every
    // id below is present and reports generateContent support. The previous
    // list (gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash) was entirely
    // dead -- none of the three existed any more, so every send on this
    // provider 404'd. Check against that endpoint rather than writing ids
    // from memory; Gemini retires them faster than any other provider here.
    name: "Google (Gemini)",
    models: [
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ],
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
    // Curated subset of the Portal catalog, not the full list. Checked
    // 2026-09-22 against the local Hermes proxy GET /v1/models (400 ids).
    // 18 slugs matched. The Qwen coder entry had been
    // qwen/qwen3-coder-480b-a35b; the live id for the model named
    // "Qwen3 Coder 480B A35B" is qwen/qwen3-coder.
    // x-ai/grok-4.7 stays first: it is FALLBACK_MODEL below.
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
      "qwen/qwen3-coder",
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
  // Verified 2026-09-22 against GET https://openrouter.ai/api/v1/models.
  // Four ids were dead (claude-3.5-sonnet, gemini-pro-1.5, grok-3,
  // llama-3.1-405b-instruct) and have been swapped for live equivalents.
  // Check against that endpoint rather than editing from memory.
  openrouter: {
    // Same situation as Nous above: OpenRouter aggregates hundreds of
    // models. Curated a similarly-sized subset rather than the full
    // catalog. Confidence differs by entry, worth being explicit about:
    // the well-established models (gpt-4o, claude-3.5-sonnet, the Llama/
    // Mistral/DeepSeek entries, gemini-pro-1.5) use OpenRouter's real,
    // long-documented slug format. The newer entries (claude-opus-5,
    // grok-4.7, glm-4.6, kimi-k2, qwen3-235b) are past this project's
    // knowledge cutoff and built to match OpenRouter's known naming
    // pattern, same as Nous's list — not individually verified live.
    name: "OpenRouter",
    models: [
      "anthropic/claude-opus-5",
      "anthropic/claude-sonnet-5",
      "anthropic/claude-haiku-4.5",
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "openai/gpt-4.1",
      "openai/o3",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
      "x-ai/grok-4.7",
      "x-ai/grok-4.6",
      "meta-llama/llama-4-maverick",
      "meta-llama/llama-4-scout",
      "mistralai/mistral-large",
      "deepseek/deepseek-r1",
      "deepseek/deepseek-chat",
      "qwen/qwen3-235b-a22b",
      "moonshotai/kimi-k2",
      "z-ai/glm-4.6",
    ],
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
