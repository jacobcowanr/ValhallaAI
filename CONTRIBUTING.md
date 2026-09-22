# Contributing to ValhallaAI

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
ValhallaAI/
├─ ARCHITECTURE.md         — system design, diagrams (read this first)
├─ POSITIONING.md          — how this differs from everything else
├─ CONTRIBUTING.md         — this file
├─ README.md               — quick start
├─ env.example             — .env template. Copy to .env. Never commit .env
├─ index.html              — Vite entry point
├─ vite.config.js          — Vite + Svelte plugin config
├─ svelte.config.js        — Svelte preprocessor config
├─ src/
│  ├─ main.js              — mounts App.svelte into index.html's #app
│  ├─ App.svelte           — sidebar shell (Models & Chat, Sessions, Vault, Agents, Settings)
│  ├─ routes/              — those screens
│  └─ lib/
│     ├─ llm-router.ts     — the ONLY place that talks to provider APIs
│     ├─ providers.ts      — the ONLY provider catalog
│     ├─ provider-keys.ts  — loads the allowlisted .env keys through Tauri
│     └─ sessions.ts       — chat sessions in localStorage
├─ src-tauri/src/main.rs   — run_agent, provider_keys, vault_status
├─ agents/                 — Claude and Grok images. Hermes runs on the host
├─ scripts/run_agent.sh    — one-shot runner shared by the UI and the terminal
├─ scripts/vault_relay.sh  — folds outboxes into AGENT_SYNC.md, commits, can push
├─ vault/                  — AGENT_SYNC.md and agents-config.json
└─ docker-compose.local.yml
```

## Conventions

### Adding a new LLM provider
1. Add one `call<Provider>()` function to `src/lib/llm-router.ts`, and add its case to the `switch` in `callLLM()`
2. Add the provider name + model list to `src/lib/providers.ts` — this is the **single** source of truth now; `Settings.svelte` and `ModelPicker.svelte` both import from it, so there's nothing else to update in either file
3. Providers list alphabetically; models within a provider are ordered newest/most-capable → oldest/cheapest
4. Provider *counts* in docs (README, ARCHITECTURE §8, POSITIONING) should be written as "N providers" where N is `Object.keys(PROVIDERS).length` — check it against `providers.ts` directly rather than incrementing a remembered number by hand. A hand-maintained count is exactly how the catalog drifted to 19 router cases / 18 catalog entries / "17" in prose before the providers.ts extraction.

### Agent runtimes
- Each agent run is **one-shot**, not a daemon — `restart: "no"` in `docker-compose.local.yml`, not `unless-stopped`. This was gotten wrong once already: `unless-stopped` on a container that calls a paid API and exits 0 is an unbounded billing loop. Caught by a 2026-09-21 verification pass before anyone actually ran it.
- Claude and Grok are containers. Hermes is not: `scripts/run_agent.sh hermes-agent` calls the host CLI. The Hermes image still has no `hermes` binary.
- Claude and Grok read `vault/agents-config.json`. All three runners append `vault/AGENT_OUTBOX_<name>.md` (gitignored). They do not write `AGENT_SYNC.md` directly. The relay does that. See [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-data-flow-agent-run--vault-coordination).
- Before wiring up a new agent's Dockerfile, actually run `docker-compose build <service>` — `agents/grok/agent.js` didn't exist for a full day while its Dockerfile's `COPY agent.js ./` referenced it, because nobody had tried building it.

### Vault
- Never commit secrets, API keys, or credentials to `vault/` — it's the one thing that's expected to eventually sync to a git remote.
- Vault is coordination + config, not a database. If you're tempted to query it, that's a sign you need a different datastore (see [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-what-the-vault-is--and-isnt)).

### Frontend credentials
`src/lib/llm-router.ts` reads API keys **only** from `config.apiKey` — never from `process.env`. The desktop app fills `config.apiKey` from the project `.env` for Anthropic, OpenAI, OpenRouter, Google, and xAI, and from Settings for everyone else. This code runs in the browser (inside the Tauri webview via Vite), where `process` doesn't exist unless polyfilled. Don't reintroduce `process.env`.

### Before claiming something works
Actually run it — all three of these, not just the first one:

```bash
npm run build              # vite build — does the frontend actually compile
npx tsc --noEmit           # .ts files only — see the caveat below
npm run check               # svelte-check — the .svelte files, which tsc alone SKIPS
```

**`npx tsc --noEmit` does not check `.svelte` files, silently.** It was run and reported "clean" throughout an earlier fix pass on this project, and that was true — and also missed 20 real type errors across all 4 interactive components, because plain `tsc` doesn't process Svelte SFCs at all (`tsc --listFiles` will show zero `.svelte` files even though `tsconfig.json`'s `include` lists them). Found by a third verification pass on 2026-09-22, after two earlier passes and a fix pass had all run `tsc` and called it clean. `svelte-check` is the tool that actually type-checks `.svelte` files; it's now a devDependency and `npm run check` runs it. There's no excuse for a claim like "provider count" or "desktop app ✅" to survive in a doc without whoever wrote it having run all three checks above, not just the ones that happened to pass.

### Cross-platform (macOS + Windows + Linux/Omarchy)
Standing constraint on every change — see [ARCHITECTURE.md §3.1](./ARCHITECTURE.md#31-cross-platform-constraint) for the full rationale and checklist. Before merging anything touching file paths, Docker volumes, or host shell-outs, check it against that table. When in doubt: no hardcoded `~`, no bare `/` path concatenation, no host-shell script that isn't also runnable on Windows (containerized scripts are fine — the container is always Linux). Linux specifically means **Arch-based distros too** (Omarchy) — don't assume a `.deb`/`.rpm` reaches every Linux user; the AppImage bundle target is the one that does.

### Commits
- Descriptive messages, present tense, explain *why* not just *what* when the reasoning isn't obvious from the diff
- One logical change per commit where reasonable

## Known open issues

Tracked here until there's a formal issue tracker.

**Current as of 2026-09-22.** The changelog under this section is history. This paragraph is the state to trust:

- Desktop app: `npm run tauri-dev`. Chat keys for Anthropic, OpenAI, OpenRouter, Google, and xAI come from `.env` when that file has them. Other providers still use a key saved in Settings. Nous Portal uses the Hermes proxy at `http://127.0.0.1:8645` and does not read `NOUS_API_KEY`.
- `.env` must be `NAME=value` lines and `#` comments. A label on its own line makes Docker Compose reject the whole file.
- Agents: `scripts/run_agent.sh <claude-agent|hermes-agent|grok-agent>`, or the Run button. Hermes is the host CLI. Claude needs `ANTHROPIC_API_KEY`. Grok needs `XAI_API_KEY` and `"enabled": true`. Do not use `docker compose up` to "start the agents."
- Vault Browser lists `vault/` and `git status`. It does not pull or push. The relay can fold and commit; push is still untested.
- `anthropic` and `anthropic_oauth` share `callAnthropic()` and the paid API key. `claude_directsdk` is meant to run the official `claude` CLI and strip `ANTHROPIC_API_KEY`, but the desktop command currently rejects the call before the CLI starts. See the 2026-09-22 02:00 handoff in `vault/AGENT_SYNC.md`.

**Fixed 2026-09-21** (found by two independent verification passes cross-checking docs against actual code, one of them mislabeled "Hermes" in the vault log despite running as Opus 5 in Claude Desktop's cowork — worth knowing for the record):
- ~~`src/App.svelte` had an opening `<script>` and no closing `</script>`~~ — hard Svelte compile error, broken in the committed version, not just a working-tree typo. **The app has never actually built until this fix.**
- ~~No Vite/Svelte scaffolding existed at all~~ — `vite.config.js`, `svelte.config.js`, `index.html`, `src/main.js`, `tsconfig.json` were all missing, so even with `App.svelte` fixed there was no entry point for anything to mount to. Added all five, plus `tsconfig.node.json` and `src/vite-env.d.ts` for the `.svelte`-import type declarations TypeScript needs. **Verified with a real `npx vite build` (succeeds, 39 modules) and `npx tsc --noEmit` (clean) — not just file existence.**
- ~~`restart: unless-stopped` on one-shot agents~~ — `claude-agent` and `hermes-agent` call a paid API and exit 0; `unless-stopped` restarted them in an unbounded loop, re-billing each cycle. This was the one finding with a real money cost. Changed to `restart: "no"`.
- ~~`process.env.*` referenced in browser code~~ — thrown at call time in a Vite-bundled webview, independent of whether the user supplied their own key. Removed entirely; every provider function now requires `config.apiKey` and returns a clear "no API key set" error instead of crashing.
- ~~`Settings.svelte` and `ModelPicker.svelte` each held their own copy of the provider catalog~~ — extracted to `src/lib/providers.ts`, both files import from it now. This also fixed the count mismatch at its root (removed the dead `local`/`callLocal` case, which duplicated `ollama`'s `localhost:11434` target under a second name) — router, Settings, and ModelPicker now all agree: **18 providers**, not 19/18/18/"17".
- ~~`agents/grok/Dockerfile` `COPY`'d a nonexistent `agent.js`~~ — build target failed outright (mitigated by `grok-agent` being `enabled: false` by default, but still broken). Added a real implementation.
- ~~`vault-relay` only ran `git pull`, never committed or pushed~~ — contradicted ARCHITECTURE §6's diagram outright. `scripts/vault_relay.sh` now folds each agent's outbox into `AGENT_SYNC.md`, commits, and pushes.
- ~~`AgentControl`/`VaultBrowser` looked functional but were mocks~~ — on 2026-09-21 `main.rs` registered no commands, and the fix that day was an honest "not wired" notice. **Superseded later on 2026-09-22:** Agent Control runs `scripts/run_agent.sh`, and Vault Browser lists files and git status. Neither pulls nor pushes.
- ~~CONTRIBUTING's gate checkmarks read as "met"~~ — see above, now unchecked boxes.
- ~~`docker-compose.local.yml`'s Windows-path comment contained a literal `~` character~~ — harmless in effect (not inside an actual path), but made an earlier "no tilde in this file" claim literally false. Reworded.
- ~~Version drift~~ — `package.json` and `Settings.svelte` said `0.0.1`, `tauri.conf.json`/`Cargo.toml` said `0.1.0`. Aligned to `0.1.0` everywhere.
- ~~`.gitignore` excluded `package-lock.json` while the file existed locally~~ — a fresh clone got no lockfile, non-reproducible installs against README's own `npm install` instruction. Now tracked.
- ~~`tauri.conf.json`'s placeholder `com.tauri.dev` identifier~~ — set to `com.jacobcowan.valhallaai`.
- Earlier fixes (temperature-0 bug, Replicate polling, Google system-role mapping, stale-default-provider fallback, Ollama endpoint `bind:value`, `rel=noopener`, the 9-provider `callOpenAICompatible()` extraction) from a prior review pass — see git history for that entry; still holding.

**Fixed 2026-09-22** (found by a third verification pass, after the app-builds fix and the Vahalla→ValhallaAI rename):
- ~~`tsc --noEmit` was reported clean but never actually checked any `.svelte` file~~ — plain `tsc` silently skips Svelte SFCs even though `tsconfig.json` lists them in `include`. Installed `svelte-check` (`npm run check`), which found **20 real type errors** across all 4 interactive components — all implicit-`any` issues (untyped state, function params, and `Object.entries()` widening `LLMProvider` keys to `string`). Fixed by converting all 5 `.svelte` files to `<script lang="ts">` with real types, and adding a properly-typed `PROVIDER_ENTRIES` export to `providers.ts` so the `Object.entries()` widening has one fix instead of three casts. **Both `npx tsc --noEmit` and `npm run check` are now clean — verified by running both, along with a fresh `npx vite build`.**
- ~~The vault relay's logic was correct but couldn't run in its container~~ — `image: alpine:latest` had no git binary (busybox base, no Dockerfile), `vault/` has no `.git` of its own (it's a tracked subfolder of this repo, not a separate git repo — despite `VAULT_REPO` implying otherwise), and `set -eu` around unguarded git commands meant the container would crash-loop on its first cycle. Rewrote as `scripts/vault_relay.Dockerfile` (installs git + openssh-client), changed the compose mount to the whole repo (`.:/repo`) instead of just `./vault:/vault` so `.git` actually exists, and rewrote the script to set git identity explicitly and handle each git step's failure without crash-looping. **Verified the fold + scoped-commit logic end-to-end in a real git repo outside Docker** (Docker/OrbStack was down on this machine, same as the pass that found the bug — so the actual containerized run is still unexecuted, flagged below, not claimed as tested).
- ~~`vault/AGENT_SYNC.md`'s header still said "Vahalla" and `jacobcowanr/Vahalla`~~ after the rename — the header is the live preamble, not a dated log entry, so the rename's "don't rewrite history" rule didn't apply to it and it got missed. Fixed, with a note explaining why it's exempt from the append-only rule.

**Fixed 2026-09-22 (later same day), execution-verified:** once OrbStack came up, actually ran the vault-relay container against an isolated throwaway git repo (not the live one — a bug in an untested container landing an unwanted commit in the real repo was the risk being avoided). Built the real image (`docker build -f scripts/vault_relay.Dockerfile`), ran the real entrypoint twice: once with a populated outbox, once with an empty one.
- ~~Vault-relay container was logic-verified outside Docker but never actually run~~ — **now genuinely execution-verified**: `git --version` confirmed present in the built image, the fold correctly appended the outbox content into `AGENT_SYNC.md` with a timestamp header, the outbox was cleared to 0 bytes, the commit landed with the correct scoped identity (`ValhallaAI Relay <valhallaai-relay@local>`), and `git status` was clean afterward. Re-ran with an empty outbox to confirm the idempotent no-op case: zero log output, container stayed healthy (didn't crash-loop), no spurious empty commit.
- **Still not tested:** `VAULT_REPO` was left unset for both runs (no push attempted), since that requires a real remote and a mounted SSH key to test properly — a bad test here risks a bad push to a real repo, not just a local mistake. The pull/push code paths (`if [ -n "${VAULT_REPO:-}" ]`) remain logic-reviewed but execution-unverified.

**Fixed 2026-09-22 (Nous Portal).** Direct calls to `inference-api.nousresearch.com` 401 when the only login on the machine is `hermes portal` OAuth, because that flow never produces a key you can paste. `callNous()` now posts to the local Hermes subscription proxy at `http://127.0.0.1:8645/v1`, which is Nous's documented path for third-party apps. Checked against a running proxy: `GET /v1/models` returned 400 ids, 18 of the 19 curated slugs matched, and `qwen/qwen3-coder-480b-a35b` was replaced with the live id `qwen/qwen3-coder` (display name "Qwen3 Coder 480B A35B"). Settings and the chat empty-state no longer ask for a Nous API key. **Verified end to end on 2026-09-22:** `hermes portal info` reports `Auth: ✓ logged in`, the proxy answers on `127.0.0.1:8645`, and a real `POST /v1/chat/completions` on `x-ai/grok-4.7` returned a reply with a usage payload.

**Added 2026-09-22: image attachments in Models & Chat, real for 9/18 providers.** `LLMMessage` gained an optional `images?: string[]` field (data URLs). `callOpenAICompatible()` builds the standard OpenAI multimodal content array (`[{type:"text"}, {type:"image_url"}, ...]`) when a message carries images — wired in once at the shared helper, so it covers all 9 providers that use it (OpenRouter, ChatGPT, xAI Grok, Nous, Fireworks, Groq, OpenClaw, Perplexity, Together) for free. `providerSupportsImages()` is exported so the UI can gate on it.

**Still open:**
- **Sessions (`src/lib/sessions.ts`) persist to `localStorage`, with no size cap or eviction policy.** Fine for normal use, but there's no limit on how many sessions or how much message history accumulates — a very long-running install could eventually hit `localStorage`'s per-origin quota (typically 5-10MB depending on platform). the internal `persist()` function's `try/catch` means a quota failure degrades to "this session's latest messages don't persist" rather than crashing, but there's no user-facing warning when that happens, and no pruning/archiving of old sessions. A real fix would be IndexedDB (much higher quota) or an explicit "delete old sessions" affordance — neither attempted here.
- **`src/assets/fonts/Norse.otf` and `Norse-Bold.otf` are licensed, not public-domain or npm-distributed.** Joël Carrouché Free Font License: free to use and embed in apps/web pages, but explicitly prohibits redistributing or sharing the font files "for download" without written permission. Fine while this repo is private — becomes a real question the moment `CONTRIBUTING.md`'s open-source gate is met, since a public GitHub repo lets anyone clone it and extract the raw `.otf` files. Revisit before going public: either get permission, find a differently-licensed alternative, or strip the font files from the public history/release while keeping the private repo as-is.
- **The other 9 providers (Anthropic, Google, MiniMax, Qwen, Hugging Face, Ollama, Replicate, Claude DirectSDK/OAuth) don't support image attachments.** Each has its own request shape and its own multimodal format (Anthropic's `image` content blocks, Google's `inline_data`, etc.) — implementing all of them is real per-provider work, not something to fake. The UI (`ModelPicker.svelte`) checks `providerSupportsImages()` before allowing a send: attaching an image while on an unsupported provider shows a live warning and disables Send, rather than silently dropping the image or sending it somewhere it'll be ignored.
- **Only images, not arbitrary files.** The attach menu offers "Upload image" only — no PDF/document upload or text-extraction pipeline. That's a materially different feature (needs its own ingestion/chunking story) and wasn't implied by what was asked.
- **`anthropic_oauth` still aliases to `callAnthropic()` with the paid API key.** `claude_directsdk` is written to run `claude -p` and remove `ANTHROPIC_API_KEY`, but the running app rejects the call with `missing field apiKey` (see the 2026-09-22 02:00 handoff). OAuth usage-credits login is still not a separate flow.
- **`VaultBrowser` lists files and git status. It does not pull or push.** `vault_status` is read-only. `VAULT_REPO` can be empty. A push from the app is still not implemented.
- **The Hermes Docker image still does not contain the Hermes CLI.** The agent runs via the host CLI instead (`scripts/run_agent.sh hermes-agent`). Putting a second Hermes install in a Linux container and mounting the same home would race the proxy already running on this Mac. The container's `run.sh` still exits 1 if someone starts that service directly.
- **Vault-relay's push path (`VAULT_REPO` set, real remote, mounted SSH key) is untested** — see above. The pull/fold/commit path is now execution-verified; push isn't.
- **Windows path untested end-to-end.** `docker-compose.local.yml`'s `${HOST_HERMES_DIR}`/`${HOST_SSH_DIR}` fix (replacing `~` tilde mounts) has only been verified on macOS.
- **Linux/Omarchy path untested end-to-end.** Nothing in the stack — Tauri build, Docker agent runtime, or the app itself — has actually run on an Omarchy machine. Tauri's `pacman` prerequisites (see [ARCHITECTURE.md §3.1](./ARCHITECTURE.md#31-cross-platform-constraint)) haven't been verified there either.
- **No secret-scanning tool in CI.** Multiple independent hand-written scanners across several verification passes have found nothing secret-shaped in the full commit history — genuinely clean — but all explicitly caveat that a hand-rolled scanner is best-effort, not tool-certified. Add gitleaks or trufflehog before this repo ever goes public.
