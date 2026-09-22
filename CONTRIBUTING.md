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

Tracked here until there's a formal issue tracker (see the most recent code review findings for current details):
- Replicate's async prediction API isn't polled — `callReplicate()` returns the immediate (often empty) response instead of waiting for completion
- `temperature: 0` is silently replaced with the default in several provider functions (`config.temperature || 0.7` treats `0` as falsy)
- No migration path if a previously-saved default provider is later removed from the provider list (e.g. the GitHub Copilot removal)
- Google Gemini's `callGoogle()` folds `system` role messages into `user` role instead of using Gemini's `systemInstruction` field
