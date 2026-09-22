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
import { customProvider, isCustomProviderId, loadCustomProviders, type CustomProvider } from "./custom-providers";

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
  // Ordered newest/most-capable first per CONTRIBUTING, which puts
  // claude-haiku-4-5-20251001 last even though it is FALLBACK_MODEL. That is
  // fine: the default is chosen by name, not by position. Nothing should take
  // models[0] as "the default" -- see the provider-change handler in
  // Settings.svelte.
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
    // Verified 2026-09-22 against Fireworks' live Serverless list, then cut
    // down. The full serverless set was 17 chat models, which is a catalog,
    // not a picker — Jacob asked for the newer models plus the older ones
    // that are still cheap and productive, not everything available.
    //
    // Every id was confirmed from that model's own page, which prints its
    // callable path. The path is always accounts/fireworks/models/<slug>
    // even when the page URL says a different publisher.
    //
    // Kept: the current cheap tier (DeepSeek V4.1 Flash, GLM 5.3 Flash),
    // Qwen 3.8 Max as the one full-price newer model, and the older models
    // whose price still justifies them — gpt-oss-120b at $0.15/$0.60 and
    // Nemotron Lightning at $0.05/$0.20, the cheapest productive model here.
    //
    // Dropped: the dated DeepSeek snapshots (V4-Pro-0813, V4-Flash-0731,
    // V4-Flash-Vision-Exp — superseded by V4.1 Flash), the full-price tiers
    // that duplicate a cheaper sibling (GLM-5.3, GLM 5.2, Kimi K3), the
    // older Kimi snapshots (K2.7 Code, K2.6), and the models with no stated
    // price (Muse Glimmer, MiniMax M3, Inkling). Two serverless entries were
    // never included: qwen3-reranker-8b and qwen3-embedding-8b are not chat
    // models.
    name: "Fireworks AI",
    models: [
      "accounts/fireworks/models/deepseek-v4p1-flash",
      "accounts/fireworks/models/glm-5p3-flash",
      "accounts/fireworks/models/qwen3p8-max",
      "accounts/fireworks/models/gpt-oss-120b",
      "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
    ],
  },
  google: {
    // Verified 2026-09-22 by actually POSTing generateContent, not by reading
    // GET /v1beta/models. That distinction is the whole lesson of this entry:
    // `gemini-2.5-pro`, `gemini-2.5-flash`, and `gemini-2.5-flash-lite` all
    // appear in the models list AND report generateContent support, but a real
    // request returns 404 "This model is no longer available to new users.
    // Please update your code to use models/gemini-3.6-flash". Listing is not
    // the same as callable, so a key-verified models list is still not proof.
    //
    // What a real request showed for this key (re-probed 2026-09-22 13:18, after
    // a user hit the 503 in the UI — a note from an hour earlier is not
    // evidence about now):
    //   gemini-3.6-flash   200
    //   gemini-3.5-flash   200 (callable; see the empty-content note below)
    //   gemini-3.8-flash   503 UNAVAILABLE "currently experiencing high demand"
    //                      -- the model exists and the key is valid; the
    //                      capacity is Google-side and temporary
    //   gemini-3.7-flash   503, the same message. The earlier note left this
    //                      one unrequested; requesting it closes the gap, and
    //                      the answer is the unfavourable one.
    //   gemini-2.5-flash   404, replaced by 3.6-flash per Google's own message
    //
    // Two of the four ids can be capacity-blocked *at once* while others answer
    // normally, so a 503 here is a per-model, Google-side condition. Do not read
    // it as a dead key, a dead id, or an app bug, and do not "fix" it by
    // deleting the entry — check again later. Cross-provider evidence that the
    // block is key-side capacity and not the id: the local Nous proxy serves
    // gemini-3.8-flash and genuinely answers ("PONG", 93 completion tokens)
    // while this key is 503ing on it.
    //
    // On "callable": a 200 does not prove an answer. `content` can come back
    // null with finish_reason "stop" — on a 16-token cap that is what happens,
    // because 91 of the model's completion tokens were *reasoning* tokens. The
    // app's own default is 2048 (`config.maxTokens ?? 2048`), which leaves room,
    // so this is a probing trap rather than a user-facing bug: do not conclude
    // a model is broken, or fine, from a tiny-cap probe.
    //
    // gemini-3.6-flash is FIRST on purpose. The picker selects models[0] when
    // the provider changes, so first place is the de facto default, and an
    // entry that is newest-but-503ing is a bad default. This is the one
    // exception to the newest-first ordering; re-check it before moving it.
    name: "Google (Gemini)",
    models: [
      "gemini-3.6-flash",
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.5-flash",
    ],
  },
  groq: {
    // Verified 2026-09-22 against console.groq.com/docs/models. The previous
    // list (mixtral-8x7b-32768, llama2-70b-4096, gemma-7b-it) is retired —
    // none of the three appear in the production table. Kept to the
    // production chat models with a published price; the Llama entries are
    // enterprise-only ("Contact sales") and Whisper is speech-to-text.
    name: "Groq (Fast Inference)",
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  },
  minimax: {
    // Verified 2026-09-22 against platform.minimax.io's text chat API
    // reference, which lists the accepted model ids. The previous list
    // (minimax-text-01, minimax-abab6.5s-chat) matches none of them.
    // M3 is the current generation; M2.5 is the prior one and the cheap
    // option (M2.7-highspeed is the pricier tier of the same generation).
    name: "MiniMax",
    models: ["MiniMax-M3", "MiniMax-M2.5"],
  },
  nous: {
    // Curated subset of the Portal catalog, not the full list. Checked
    // 2026-09-22 against the local Hermes proxy GET /v1/models (400 ids).
    // 18 slugs matched. The Qwen coder entry had been
    // qwen/qwen3-coder-480b-a35b; the live id for the model named
    // "Qwen3 Coder 480B A35B" is qwen/qwen3-coder.
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
    // Verified 2026-09-22 against docs.perplexity.ai. The previous list
    // (pplx-7b-online, pplx-70b-online) is retired. Perplexity warns that
    // Sonar Chat Completions moves to the Agent API and is supported only
    // until 2026-09-27, so these ids have a short life — re-check after
    // that date rather than assuming they still answer.
    name: "Perplexity (Search + LLM)",
    models: ["sonar", "sonar-pro", "sonar-reasoning-pro"],
  },
  qwen: {
    name: "Qwen Code",
    models: ["qwen-coder-32b", "qwen-turbo"],
  },
  xai_grok: {
    // Verified 2026-09-22 against docs.x.ai/developers/models. xAI's own
    // guidance is to use grok-4.7 for everything including code; grok-3 and
    // grok-vision are retired. grok-4.6 is the previous generation and the
    // cheaper fallback.
    name: "xAI Grok",
    models: ["grok-4.7", "grok-4.6"],
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

// Claude Subscription DirectSDK on Haiku is the default deliberately: it runs
// the `claude` CLI on the Pro/Max login and never touches ANTHROPIC_API_KEY, so
// the out-of-the-box path costs nothing per token. Haiku rather than Opus for
// the same reason -- a default should be the cheap, fast one, and anyone who
// wants Opus can pick it.
export const FALLBACK_PROVIDER: LLMProvider = "claude_directsdk";
export const FALLBACK_MODEL = "claude-haiku-4-5-20251001";

// --- Built-in + user-defined providers, for the UI ------------------------
//
// Settings and the chat picker have to offer both as one list. These read
// custom providers from localStorage on each call rather than caching them
// in a module-level variable: a provider added in Settings must show up in
// the picker without a reload, and a cache here would make it invisibly
// stale. localStorage reads are cheap; this is not a hot path.

function builtinEntry(id: string): ProviderEntry | undefined {
  return (PROVIDERS as Record<string, ProviderEntry>)[id];
}

/** True for a catalog id or a stored custom provider id. Used to validate a
 *  saved preference before trusting it (a provider can be removed between
 *  sessions — see the load path in Settings.svelte). */
export function isKnownProvider(id: string): boolean {
  return Boolean(builtinEntry(id)) || Boolean(customProvider(id));
}

export function providerName(id: string): string {
  return builtinEntry(id)?.name ?? customProvider(id)?.name ?? id;
}

export function providerModels(id: string): string[] {
  return builtinEntry(id)?.models ?? customProvider(id)?.models ?? [];
}

/** Every selectable provider, built-ins first in catalog order, then custom
 *  ones. Returns `string` ids rather than `LLMProvider` because the custom
 *  half is runtime-defined.
 *
 *  Pass `custom` when the caller already holds the list in component state:
 *  Settings must re-render when it changes, and Svelte cannot observe a
 *  localStorage read, so the dependency has to be the caller's variable. */
export function allProviderEntries(
  custom: CustomProvider[] = loadCustomProviders()
): [string, ProviderEntry][] {
  return [
    ...PROVIDER_ENTRIES,
    ...custom.map((p) => [p.id, { name: p.name, models: p.models }] as [string, ProviderEntry]),
  ];
}

export { isCustomProviderId };
