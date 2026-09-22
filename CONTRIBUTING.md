# Contributing to Vahalla

Right now this is a solo, local-only project (see [Why local-first](#why-local-first)). This document is the guideline set for right now — a future public version of this file will add PR process, code of conduct, etc. once the project actually has outside contributors.

## Why local-first

Build it for one real user (you) before building it for hypothetical ones.

- **You'll find real bugs, not imagined ones.** A 2026-09-21 verification pass (two independent agents, both cross-checking docs against actual code) found the app didn't compile at all — a missing `</script>` tag and a missing Vite entry point, neither of which surfaced until someone actually tried to build it. Daily use surfaces exactly this kind of gap between what's documented and what's built.
- **You avoid premature API stability promises.** Nobody is depending on this yet, so the router, the vault schema, and the agent config format can all change shape without a deprecation cycle.
- **Docs written against real usage are more honest.** [ARCHITECTURE.md](./ARCHITECTURE.md) and [POSITIONING.md](./POSITIONING.md) describe what the system actually does, not what it's aspired to do — that same 2026-09-21 pass found both docs had drifted into describing unbuilt features as shipped (see "Fixed" below). Local-first daily use is what catches this before it reaches anyone else.

**Gate to open source** (see [ARCHITECTURE.md §9](./ARCHITECTURE.md#9-deployment-path-future)). None of these are met yet — this is a checklist of what's required, not a record of what's done:
- [ ] 3+ agents coordinating via the vault in real, non-demo usage
- [ ] Agent runtime deployed to a cloud VPS and stable for a month
- [ ] UX pain points found and fixed through actual daily friction, not guesswork
- [ ] A deploy procedure that's been run more than once

*(A previous version of this list used ✅ next to each item, which read as "met" despite the surrounding text saying the opposite — the doc contradicted itself. Fixed to unchecked boxes.)*

Until then: no public repo, no "please star this," no premature audience.

## Project structure

```
Vahalla/
├─ ARCHITECTURE.md      — system design, diagrams (read this first)
├─ POSITIONING.md        — how this differs from everything else
├─ CONTRIBUTING.md       — this file
├─ README.md             — quick start
├─ index.html            — Vite entry point
├─ vite.config.js        — Vite + Svelte plugin config
├─ svelte.config.js      — Svelte preprocessor config
├─ src/                  — Svelte frontend
│  ├─ main.js            — mounts App.svelte into index.html's #app
│  ├─ App.svelte         — tab navigation shell
│  ├─ routes/            — page-level components (Settings, ModelPicker, VaultBrowser, AgentControl)
│  └─ lib/
│     ├─ llm-router.ts   — the ONLY place that talks to provider APIs
│     └─ providers.ts    — the ONLY place the provider catalog is defined (Settings.svelte and ModelPicker.svelte both import it)
├─ agents/                — one folder per agent runtime (Docker)
├─ scripts/vault_relay.sh — folds agent outboxes into AGENT_SYNC.md, commits, pushes
├─ vault/                 — coordination log template
└─ docker-compose.local.yml
```

## Conventions

### Adding a new LLM provider
1. Add one `call<Provider>()` function to `src/lib/llm-router.ts`, and add its case to the `switch` in `callLLM()`
2. Add the provider name + model list to `src/lib/providers.ts` — this is the **single** source of truth now; `Settings.svelte` and `ModelPicker.svelte` both import from it, so there's nothing else to update in either file
3. Providers list alphabetically; models within a provider are ordered newest/most-capable → oldest/cheapest
4. Provider *counts* in docs (README, ARCHITECTURE §8, POSITIONING) should be written as "N providers" where N is `Object.keys(PROVIDERS).length` — check it against `providers.ts` directly rather than incrementing a remembered number by hand. A hand-maintained count is exactly how the catalog drifted to 19 router cases / 18 catalog entries / "17" in prose before the providers.ts extraction.

### Agent runtimes
- Each agent is a **one-shot container**, not a daemon — `restart: "no"` in `docker-compose.local.yml`, not `unless-stopped`. This was gotten wrong once already: `unless-stopped` on a container that calls a paid API and exits 0 is an unbounded billing loop, not a doc mismatch. Caught by a 2026-09-21 verification pass before anyone actually ran it.
- Every agent reads its config from `vault/agents-config.json` and writes results to its *own* outbox file (`AGENT_OUTBOX_<name>.md`) — never write directly to `AGENT_SYNC.md`. See [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-data-flow-agent-run--vault-coordination) for why.
- Before wiring up a new agent's Dockerfile, actually run `docker-compose build <service>` — `agents/grok/agent.js` didn't exist for a full day while its Dockerfile's `COPY agent.js ./` referenced it, because nobody had tried building it.

### Vault
- Never commit secrets, API keys, or credentials to `vault/` — it's the one thing that's expected to eventually sync to a git remote.
- Vault is coordination + config, not a database. If you're tempted to query it, that's a sign you need a different datastore (see [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-what-the-vault-is--and-isnt)).

### Frontend credentials
`src/lib/llm-router.ts` reads API keys **only** from `config.apiKey` (user-supplied via Settings or the per-message field in Models & Chat) — never from `process.env`. This code runs in the browser (inside the Tauri webview via Vite), where `process` doesn't exist unless polyfilled; referencing `process.env.X` there isn't a style issue, it throws at call time. Don't reintroduce it.

### Before claiming something works
Actually run it. `npx vite build` and `npx tsc --noEmit -p tsconfig.json` are both fast — there's no excuse for a claim like "17 providers" or "desktop app ✅" to survive in a doc without whoever wrote it having built the thing it describes. The whole "does it compile" question sat unverified across several sessions of otherwise careful work until an explicit verification pass caught it.

### Cross-platform (macOS + Windows + Linux/Omarchy)
Standing constraint on every change — see [ARCHITECTURE.md §3.1](./ARCHITECTURE.md#31-cross-platform-constraint) for the full rationale and checklist. Before merging anything touching file paths, Docker volumes, or host shell-outs, check it against that table. When in doubt: no hardcoded `~`, no bare `/` path concatenation, no host-shell script that isn't also runnable on Windows (containerized scripts are fine — the container is always Linux). Linux specifically means **Arch-based distros too** (Omarchy) — don't assume a `.deb`/`.rpm` reaches every Linux user; the AppImage bundle target is the one that does.

### Commits
- Descriptive messages, present tense, explain *why* not just *what* when the reasoning isn't obvious from the diff
- One logical change per commit where reasonable

## Known open issues

Tracked here until there's a formal issue tracker.

**Fixed 2026-09-21** (found by two independent verification passes cross-checking docs against actual code, one of them mislabeled "Hermes" in the vault log despite running as Opus 5 in Claude Desktop's cowork — worth knowing for the record):
- ~~`src/App.svelte` had an opening `<script>` and no closing `</script>`~~ — hard Svelte compile error, broken in the committed version, not just a working-tree typo. **The app has never actually built until this fix.**
- ~~No Vite/Svelte scaffolding existed at all~~ — `vite.config.js`, `svelte.config.js`, `index.html`, `src/main.js`, `tsconfig.json` were all missing, so even with `App.svelte` fixed there was no entry point for anything to mount to. Added all five, plus `tsconfig.node.json` and `src/vite-env.d.ts` for the `.svelte`-import type declarations TypeScript needs. **Verified with a real `npx vite build` (succeeds, 39 modules) and `npx tsc --noEmit` (clean) — not just file existence.**
- ~~`restart: unless-stopped` on one-shot agents~~ — `claude-agent` and `hermes-agent` call a paid API and exit 0; `unless-stopped` restarted them in an unbounded loop, re-billing each cycle. This was the one finding with a real money cost. Changed to `restart: "no"`.
- ~~`process.env.*` referenced in browser code~~ — thrown at call time in a Vite-bundled webview, independent of whether the user supplied their own key. Removed entirely; every provider function now requires `config.apiKey` and returns a clear "no API key set" error instead of crashing.
- ~~`Settings.svelte` and `ModelPicker.svelte` each held their own copy of the provider catalog~~ — extracted to `src/lib/providers.ts`, both files import from it now. This also fixed the count mismatch at its root (removed the dead `local`/`callLocal` case, which duplicated `ollama`'s `localhost:11434` target under a second name) — router, Settings, and ModelPicker now all agree: **18 providers**, not 19/18/18/"17".
- ~~`agents/grok/Dockerfile` `COPY`'d a nonexistent `agent.js`~~ — build target failed outright (mitigated by `grok-agent` being `enabled: false` by default, but still broken). Added a real implementation.
- ~~`vault-relay` only ran `git pull`, never committed or pushed~~ — contradicted ARCHITECTURE §6's diagram outright. `scripts/vault_relay.sh` now folds each agent's outbox into `AGENT_SYNC.md`, commits, and pushes.
- ~~`AgentControl`/`VaultBrowser` looked functional but were mocks~~ — `main.rs` registers zero Tauri commands, so there was never an IPC path from either component to Docker or git. Both now show a visible "not wired up yet" notice and the code is commented accordingly, instead of silently pretending.
- ~~CONTRIBUTING's gate checkmarks read as "met"~~ — see above, now unchecked boxes.
- ~~`docker-compose.local.yml`'s Windows-path comment contained a literal `~` character~~ — harmless in effect (not inside an actual path), but made an earlier "no tilde in this file" claim literally false. Reworded.
- ~~Version drift~~ — `package.json` and `Settings.svelte` said `0.0.1`, `tauri.conf.json`/`Cargo.toml` said `0.1.0`. Aligned to `0.1.0` everywhere.
- ~~`.gitignore` excluded `package-lock.json` while the file existed locally~~ — a fresh clone got no lockfile, non-reproducible installs against README's own `npm install` instruction. Now tracked.
- ~~`tauri.conf.json`'s placeholder `com.tauri.dev` identifier~~ — set to `com.jacobcowan.vahalla`.
- Earlier fixes (temperature-0 bug, Replicate polling, Google system-role mapping, stale-default-provider fallback, Ollama endpoint `bind:value`, `rel=noopener`, the 9-provider `callOpenAICompatible()` extraction) from a prior review pass — see git history for that entry; still holding.

**Still open:**
- **`anthropic`, `anthropic_oauth`, and `claude_directsdk` all currently alias to the same `callAnthropic()` with a plain API key** — OAuth and the Hermes-DirectSDK-style CLI-spawn flow are listed as distinct providers but not yet implemented as distinct code paths. Documented honestly in `llm-router.ts`'s comment on `callClaudeDirectSDK()`; not fixed, since actually implementing two more auth flows is real feature work, not a bug fix.
- **`AgentControl`/`VaultBrowser` are marked as mocks, not wired up.** `main.rs` needs a real `.invoke_handler()` with Tauri commands that shell out to `docker-compose` and `git` before either component can do anything. This is the next substantial feature, not a quick fix — deliberately not rushed into this same pass.
- **`agents/hermes` doesn't install the `hermes` CLI.** Real containerization of Hermes (git-based install, its own home-directory state, OAuth-authenticated providers) is nontrivial and wasn't attempted — the container fails cleanly (`exit 1` with a clear outbox message) instead of silently doing nothing, but it doesn't actually run Hermes today.
- **Windows path untested end-to-end.** `docker-compose.local.yml`'s `${HOST_HERMES_DIR}`/`${HOST_SSH_DIR}` fix (replacing `~` tilde mounts) has only been verified on macOS.
- **Linux/Omarchy path untested end-to-end.** Nothing in the stack — Tauri build, Docker agent runtime, or the app itself — has actually run on an Omarchy machine. Tauri's `pacman` prerequisites (see [ARCHITECTURE.md §3.1](./ARCHITECTURE.md#31-cross-platform-constraint)) haven't been verified there either.
- **No secret-scanning tool in CI.** Two independent hand-written scanners have found nothing secret-shaped across all 10 commits so far — genuinely clean — but both explicitly caveat that a hand-rolled scanner is best-effort, not tool-certified. Add gitleaks or trufflehog before this repo ever goes public.
