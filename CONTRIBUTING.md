# Contributing to Vahalla

Right now this is a solo, local-only project (see [Why local-first](#why-local-first)). This document is the guideline set for right now — a future public version of this file will add PR process, code of conduct, etc. once the project actually has outside contributors.

## Why local-first

Build it for one real user (you) before building it for hypothetical ones.

- **You'll find real bugs, not imagined ones.** Daily use surfaces the actual pain points — a broken Ollama endpoint field, a stale default provider — faster than any amount of upfront design.
- **You avoid premature API stability promises.** Nobody is depending on this yet, so the router, the vault schema, and the agent config format can all change shape without a deprecation cycle.
- **Docs written against real usage are more honest.** [ARCHITECTURE.md](./ARCHITECTURE.md) and [POSITIONING.md](./POSITIONING.md) describe what the system actually does, not what it's aspired to do.

**Gate to open source** (see [ARCHITECTURE.md §9](./ARCHITECTURE.md#9-deployment-path-future)):
- ✅ 3+ agents coordinating via the vault in real, non-demo usage
- ✅ Agent runtime deployed to a cloud VPS and stable for a month
- ✅ UX pain points found and fixed through actual daily friction, not guesswork
- ✅ A deploy procedure that's been run more than once

Until then: no public repo, no "please star this," no premature audience.

## Project structure

```
Vahalla/
├─ ARCHITECTURE.md      — system design, diagrams (read this first)
├─ POSITIONING.md        — how this differs from everything else
├─ CONTRIBUTING.md       — this file
├─ README.md             — quick start
├─ src/                  — Svelte frontend
│  ├─ routes/            — page-level components (Settings, ModelPicker, VaultBrowser, AgentControl)
│  ├─ lib/llm-router.ts  — the ONLY place that talks to provider APIs
│  └─ App.svelte         — tab navigation shell
├─ agents/                — one folder per agent runtime (Docker)
├─ vault/                 — coordination log template
└─ docker-compose.local.yml
```

## Conventions

### Adding a new LLM provider
1. Add one `call<Provider>()` function to `src/lib/llm-router.ts`
2. Add the case to the `switch` in `callLLM()`
3. Add the provider name + model list to **both** `Settings.svelte` and `ModelPicker.svelte` (yes, both — they're kept in sync deliberately, see note below)
4. Providers list alphabetically; models within a provider are ordered newest/most-capable → oldest/cheapest
5. Update the provider count and list in [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-provider-catalog)

**Known duplication:** `Settings.svelte` and `ModelPicker.svelte` currently each hold their own copy of the `providers` object. This is flagged tech debt, not an oversight — extracting it to a shared `providers.ts` module is a good first refactor once the list stabilizes.

### Agent runtimes
- Each agent is a **one-shot container**, not a daemon, unless there's a specific reason it needs to stay running.
- Every agent reads its config from `vault/agents-config.json` and writes results to its *own* outbox file (`AGENT_OUTBOX_<name>.md`) — never write directly to `AGENT_SYNC.md`. See [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-data-flow-agent-run--vault-coordination) for why.

### Vault
- Never commit secrets, API keys, or credentials to `vault/` — it's the one thing that's expected to eventually sync to a git remote.
- Vault is coordination + config, not a database. If you're tempted to query it, that's a sign you need a different datastore (see [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-what-the-vault-is--and-isnt)).

### Commits
- Descriptive messages, present tense, explain *why* not just *what* when the reasoning isn't obvious from the diff
- One logical change per commit where reasonable

## Known open issues

Tracked here until there's a formal issue tracker.

**Fixed** (were flagged by code review, resolved in a follow-up pass):
- ~~Replicate's async prediction API wasn't polled~~ — `callReplicate()` now polls the prediction's status URL until it reaches a terminal state or times out (~60s)
- ~~`temperature: 0` was silently replaced with the default~~ — fixed across all provider functions (`config.temperature ?? 0.7`, not `||`)
- ~~No migration path for a removed default provider~~ — `Settings.svelte` and `ModelPicker.svelte` now fall back to Nous/grok-4.7 if a saved `defaultProvider` no longer exists in the catalog
- ~~Google Gemini folded `system` role into `user` role~~ — `callGoogle()` now extracts `system` messages into Gemini's `systemInstruction` field
- ~~Ollama endpoint field didn't reflect its saved value~~ — added `bind:value` + load-on-mount in `Settings.svelte`
- ~~External link missing `rel="noopener noreferrer"`~~ — fixed on the ollama.ai link
- ~~7 provider functions duplicated near-identical fetch boilerplate~~ — extracted into a shared `callOpenAICompatible()` helper in `llm-router.ts`; 9 providers (OpenRouter, ChatGPT, Grok, Nous, Fireworks, Groq, OpenClaw, Perplexity, Together) now share it

**Still open:**
- `Settings.svelte` and `ModelPicker.svelte` still each hold their own copy of the `providers` catalog object — extracting to a shared `providers.ts` module is the next real refactor (see [Adding a new LLM provider](#adding-a-new-llm-provider))
- Provider functions read credentials via `process.env.*`, which is a Node convention — needs verification this resolves correctly under Vite/Tauri's frontend bundling before any provider is used for real
- Dead `callDeepSeek()` function was removed during the router cleanup (DeepSeek isn't a standalone provider in the current catalog — it's reachable via Nous and OpenRouter's model lists instead)
