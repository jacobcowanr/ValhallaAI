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
│  ├─ App.svelte           — sidebar shell (Models & Chat, Recent, Projects, Sessions, Vault, Agents, Profile, Settings)
│  ├─ routes/              — those screens
│  └─ lib/
│     ├─ llm-router.ts     — the ONLY place that talks to provider APIs
│     ├─ providers.ts      — the ONLY provider catalog
│     ├─ provider-keys.ts  — loads the allowlisted .env keys through Tauri
│     ├─ sessions.ts       — chat sessions in localStorage; project is a label, not a container
│     ├─ custom-providers.ts — user-defined providers, registered at startup
│     └─ custom-agents.ts  — user-defined agents, bound to an allowlisted runtime
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

### Profiles and per-profile storage

A profile is a **namespace over `localStorage`**, not an account. There is no
server, so there is nothing to log in to and nothing syncs anywhere.

The UI for this — identity, sign-in, rename/create/delete, the
`ignoreEnvKeys` toggle — is `src/routes/Profile.svelte`, reached from the
sidebar's profile chip and deliberately separate from `Settings.svelte`
(provider defaults, API keys, Ollama). Split 2026-09-22: they were one page
sharing nothing but a section heading. See
[ARCHITECTURE.md §4.2b](./ARCHITECTURE.md#42b-profile-srcroutesprofilesvelte).

`src/lib/profiles.ts` is the single source of truth. Anything per-user goes
through `scopedKey(base)`, which prefixes with `vai:<profileId>:`.

| Scoped per profile | Global per machine |
|---|---|
| chat sessions, active session | sidebar open/closed |
| default provider + model prefs | Ollama endpoint |
| API keys pasted into Settings | `.env` |

**`.env` stays global on purpose.** `scripts/run_agent.sh` and
`docker-compose.local.yml` read the same file, and agents run from a terminal
with no app open and no notion of an active profile — a per-profile `.env`
would break them. A profile wanting full isolation sets `ignoreEnvKeys`, which
makes `envKeyFor()` return empty so it falls through to its own pasted keys.

Two ordering rules that are easy to break:

1. `initProfiles()` runs at **module-evaluation time**, not in `onMount`.
   `sessions.ts` calls `scopedKey()` at import time, so a deferred init would
   build `vai::valhallaai-sessions` and silently show an empty history. Same
   reasoning as `loadSessions()` — see the comment there.
2. `switchProfile()` **reloads the window**. Re-reading stores in place would
   mean every module growing a "profile changed" subscriber, and any module
   that missed one would serve the previous profile's data — that class of bug
   leaks one profile's chat history into another. A reload cannot.

Adding a new piece of per-user state means routing it through `scopedKey()`
**and** adding it to `LEGACY_SCOPED_KEYS` if installs already have it flat,
or existing users silently lose it.

### Sign in with Google

**Working end to end as of 2026-09-22** — real round trip against the
`valhallaai` Google project: browser consent, loopback callback, `state` check,
token exchange, and name/email/avatar rendered on the profile.

Identity only. It attaches a name, email, and avatar to a local profile and
**nothing else** — there is no backend, so there is nothing to authorize
against and nothing syncs. The only network traffic is the handshake.

- **Rust command `google_sign_in`** in `main.rs`. A desktop client cannot keep
  a secret, so this is OAuth 2.0 + **PKCE** with a **loopback redirect**
  (RFC 8252 §7.3): bind `127.0.0.1:0`, open the system browser, catch the one
  callback, exchange `code` + `code_verifier` at Google's token endpoint.
- **Why Rust and not the webview:** the flow needs a real listening socket,
  which the webview cannot open. The allowlist stays `{"all": false}` — no
  `http` or `shell` entries were added for this.
- **Two variables, and the prefix difference is load-bearing.**
  `VITE_GOOGLE_CLIENT_ID` is read by the frontend, so it needs the `VITE_`
  prefix and is inlined into the bundle — public by design, since it ships
  inside the binary anyway. `GOOGLE_CLIENT_SECRET` has **no** prefix on
  purpose: it is read by the Rust process via `envfile::value()`, and a `VITE_`
  prefix would inline it into the JS bundle for no reason.
- **The secret is required**, contrary to what a plain reading of RFC 8252
  suggests. Google's "Desktop app" client type still demands `client_secret` at
  the token endpoint even with PKCE, and answers
  `400 invalid_request: client_secret is missing` without it. Google treats it
  as a low-value secret (it ships in every installed copy); PKCE is the actual
  protection.
- **No token is stored.** Nothing here calls a Google API, so keeping an access
  or refresh token would be holding a credential for no reason. The three
  display fields are read out of the `id_token` and the rest is dropped.
- **The `state` check is not optional.** Without it the loopback callback is
  forgeable by anything that can reach localhost.
- **The `id_token` signature is not verified locally**, deliberately: it
  arrives straight from Google's token endpoint over TLS, which is the case
  Google's docs exempt. If that token ever starts arriving from anywhere else —
  a redirect fragment, a cache, another process — that reasoning stops holding
  and the signature must be checked.
- **Testing mode gotcha:** while the consent screen is in Testing, only
  accounts listed under **Audience → Test users** can sign in. Everyone else
  gets `access_denied`, which the command translates into a message naming that
  exact cause, because it is the failure people lose an hour to.
- Signing in overwrites the profile name only when it is still an app-assigned
  default (`Local`, `New profile`). A profile the user deliberately renamed
  keeps its name. Signing out clears the identity fields only — sessions, keys,
  and prefs belong to the machine, not the Google account.

### First-launch onboarding and email verification

Added 2026-09-22, alongside splitting Profile out of Settings (see
[ARCHITECTURE.md §4.2c](./ARCHITECTURE.md#42c-onboarding-srcroutesonboardingsvelte)
and [§4.2b](./ARCHITECTURE.md#42b-profile-srcroutesprofilesvelte)).

- **`Onboarding.svelte` is a gate.** Jacob reversed the earlier decision on
  2026-09-22 and asked for the dialog to require a profile with a verified
  email before the app is usable. The only verification available is
  Google's, so the gate is `isSignedIn()` — an auth provider plus an email —
  and there is no "continue without an account" path. A profile that is
  already signed in never sees it. The `onboarded` flag is no longer what
  shows or hides this screen; keying it off that flag would exempt every
  pre-existing profile, which is what was asked *not* to happen.
- **`Profile.emailVerified`** comes from the id_token's `email_verified`
  claim, captured once at sign-in and never re-checked (there is nothing to
  re-check against — no token is retained). It is **surfaced, not enforced**:
  Google sets it false only in edge cases (some unverified Workspace setups),
  and refusing sign-in on it would risk locking out the account's real owner
  over a claim this app never asked Google to guarantee. Shown as a
  Verified/Unverified badge on the Profile page.
- **`signInProfileWithGoogle()` / `signOutProfile()` / `completeOnboardingLocally()`
  live in `profiles.ts`**, not in either route component. `Profile.svelte` and
  `Onboarding.svelte` both need the identical OAuth call; duplicating it in
  two components would repeat the exact mistake the provider catalog already
  made once this session (see "Model lists rot, and silently" above).
- **Existing profiles are grandfathered in.** `initProfiles()` backfills
  `onboarded: true` for any profile with no `onboarded` field at all, on
  first load after this shipped — a profile already in daily use has
  definitely had a "first run," even though nothing ever recorded it. Only
  `createProfile()`-made profiles see the prompt, because that function
  deliberately leaves the field unset. Verified in a browser: a profile
  carrying a real sign-in and no `onboarded` field does not see the overlay
  once the backfill runs on load.

### Finding the project from a bundled app

Every backend command needs the checkout: `.env`, `vault/`, `scripts/`, and
`docker-compose.local.yml` all live there. `project_root()` resolves it.

It used to be `env!("CARGO_MANIFEST_DIR")` with a silent fallback to
`current_dir()`. Both halves break in a release build: the manifest dir is
baked in at **compile** time, so it names whichever machine built the app, and
a double-clicked `.app` has `/` as its working directory. The fallback then
"succeeded" with a path containing none of those files, so every feature
quietly found an empty world instead of saying it could not find the project.

The chain now validates every candidate against `docker-compose.local.yml` and
returns an error when none match:

1. `VALHALLAAI_PROJECT_DIR` — explicit override, wins over everything.
2. The pointer file at
   `~/Library/Application Support/com.jacobcowan.valhallaai/project_dir`,
   rewritten by `scripts/valhallaai` on every run. This is what lets a
   relocated `.app` work: macOS `open` does not forward environment variables,
   so an export cannot reach it, but a file can.
3. Walking up from the working directory — covers `npm run tauri-dev`, whose
   cwd is `src-tauri`, and anything started inside the checkout.
4. `CARGO_MANIFEST_DIR` — still right for a dev build on the machine that
   compiled it, kept as a last resort rather than the first choice.

A stale pointer (moved or deleted checkout) fails the marker test and falls
through rather than being trusted. Launch once via `valhallaai` after moving
the project and the pointer corrects itself.

**This does not make the build distributable.** The `.app` is ad-hoc signed,
arm64-only, and still expects a checkout to exist somewhere on the machine.
Shipping it to someone else needs a Developer ID, notarization, and a decision
about what the app should do when there is no checkout at all.

### The vault relay

`scripts/vault_relay.sh` in the `vault-relay` container folds each
`AGENT_OUTBOX_<agent>.md` into `AGENT_SYNC.md`, clears the outbox, and commits.
It is `profiles: optional`, so a plain `docker compose up` never starts it.

```bash
docker compose -f docker-compose.local.yml --profile optional up -d vault-relay
docker compose -f docker-compose.local.yml stop vault-relay
```

**Verified 2026-09-22** against a throwaway fixture repo: two outboxes folded
into `AGENT_SYNC.md`, both cleared, one commit, and three idle cycles
afterwards produced no further commits.

Things that were wrong and are worth not reintroducing:

- The container ran `image: alpine:latest`, which is busybox with **no git
  binary**, so every git call failed instantly. It now builds from
  `scripts/vault_relay.Dockerfile`.
- It mounted only `./vault`, which has no `.git`, so even with git installed
  there was no work tree. It now mounts the repo root at `/repo` and scopes
  `git add` to `vault/` so it cannot sweep up app-code changes.
- Entries arrived with **two stacked headers**: agents already write
  `## [<run time>] <agent>`, and the relay added its own carrying the fold
  time. The relay now appends verbatim under a `---` separator. When the fold
  happened is the commit's job.

**Push does not work over the current remote.** `origin` is HTTPS, and the
container has no credential helper, so `git push` cannot authenticate — the
mounted `HOST_SSH_DIR` only helps an `ssh://` remote. Push is gated behind
`VAULT_REPO` being set and every git step is individually guarded, so the
relay folds and commits locally without crash-looping. Switch `origin` to SSH
or add a token helper before expecting push to work.

### Model lists rot, and silently

Model ids in `providers.ts` are hand-written and go stale without any signal:
a retired id only fails when someone actually sends to it, and a provider
nobody has used lately can sit broken for months.

**Audited 2026-09-22 against live endpoints.** Eight dead ids across three
providers — Google's entire list was gone, so that provider 404'd on every
send.

| Provider | How to check | Result |
|---|---|---|
| `google` | `GET generativelanguage.googleapis.com/v1beta/models?key=` | 3/3 dead, replaced |
| `openrouter` | `GET openrouter.ai/api/v1/models` (public, no key) | 4/19 dead, replaced |
| `anthropic` | `GET api.anthropic.com/v1/models` + `x-api-key` | 1/5 dead, removed |
| `nous` | `GET 127.0.0.1:8645/v1/models` (Hermes proxy) | 19/19 live |
| `claude_directsdk` | `claude -p --model <id>` | 4/4 valid |

**Not verifiable on this machine**, and stated rather than assumed:
`chatgpt` and `xai_grok` (keys blank in `.env`); `fireworks`, `groq`,
`perplexity`, `minimax`, `qwen` (no key
at all, and none expose a public list); `ollama` (**not installed here** —
the catalog offers 7 local models against a runtime that is absent).

`huggingface` and `replicate` were removed from the catalog entirely on
2026-09-22 — see the entry below.

Distinguish a dead id from a quota error. `claude-fable-5-1` returns "You're
out of usage credits" through the CLI — the id is valid, the subscription is
exhausted. Removing it on that evidence would be wrong.

When adding or editing a provider's models, check against its endpoint rather
than writing ids from memory. Gemini retires them fastest.

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
- Agents: `scripts/run_agent.sh <claude-agent|hermes-agent|grok-build>`, or the Run button. Hermes is the host CLI. Claude and Grok Build both prefer their host CLI on a subscription login (`claude auth login`, `grok login`) and only need their paid key when there is no login. Do not use `docker compose up` to "start the agents."
- Vault Browser lists `vault/` and `git status`. It does not pull or push. The relay can fold and commit; push is still untested.
- `anthropic` uses `callAnthropic()` and the paid API key. `claude_directsdk` runs the official `claude` CLI on its `claude auth login` session and strips `ANTHROPIC_API_KEY` from the child process, so it bills the subscription instead. Both are working as of 2026-09-22. `anthropic_oauth` was removed the same day — it claimed to be OAuth while `provider-keys.ts` copied the paid key into it (see the note at the top of `providers.ts`).

**Fixed 2026-09-21** (found by two independent verification passes cross-checking docs against actual code, one of them mislabeled "Hermes" in the vault log despite running as Opus 5 in Claude Desktop's cowork — worth knowing for the record):
- ~~`src/App.svelte` had an opening `<script>` and no closing `</script>`~~ — hard Svelte compile error, broken in the committed version, not just a working-tree typo. **The app has never actually built until this fix.**
- ~~No Vite/Svelte scaffolding existed at all~~ — `vite.config.js`, `svelte.config.js`, `index.html`, `src/main.js`, `tsconfig.json` were all missing, so even with `App.svelte` fixed there was no entry point for anything to mount to. Added all five, plus `tsconfig.node.json` and `src/vite-env.d.ts` for the `.svelte`-import type declarations TypeScript needs. **Verified with a real `npx vite build` (succeeds, 39 modules) and `npx tsc --noEmit` (clean) — not just file existence.**
- ~~`restart: unless-stopped` on one-shot agents~~ — `claude-agent` and `hermes-agent` call a paid API and exit 0; `unless-stopped` restarted them in an unbounded loop, re-billing each cycle. This was the one finding with a real money cost. Changed to `restart: "no"`.
- ~~`process.env.*` referenced in browser code~~ — thrown at call time in a Vite-bundled webview, independent of whether the user supplied their own key. Removed entirely; every provider function now requires `config.apiKey` and returns a clear "no API key set" error instead of crashing.
- ~~`Settings.svelte` and `ModelPicker.svelte` each held their own copy of the provider catalog~~ — extracted to `src/lib/providers.ts`, both files import from it now. This also fixed the count mismatch at its root (removed the dead `local`/`callLocal` case, which duplicated `ollama`'s `localhost:11434` target under a second name) — router, Settings, and ModelPicker now all agree on one count, read from `Object.keys(PROVIDERS).length` rather than hand-maintained (it was 18 at the time of that fix and is **17** since `anthropic_oauth` was removed on 2026-09-22) — not the old 19/18/18/"17".
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

**Added 2026-09-22: image attachments in Models & Chat — drag & drop, paste, and file picker, real for 12 of the 13 providers.** `LLMMessage` gained an optional `images?: string[]` field (data URLs). Each provider family encodes them in its own shape, because there is no single format:

- **OpenAI-compatible dialect** (`callOpenAICompatible`, which also covers MiniMax and Qwen — they accept the same content array): `[{type:"text"},{type:"image_url",image_url:{url}}]`. The data URL goes in `url` whole.
- **Google Gemini**: `{inlineData: {mimeType, data}}` parts, camelCase, data-URL prefix stripped. **Verified live** — a dropped screenshot was correctly described by the model.
- **Anthropic**: `{type:"image", source:{type:"base64", media_type, data}}` content blocks. `AnthropicTurn.content` in `main.rs` is now a `serde_json::Value` so `anthropic_messages` forwards those blocks untouched instead of rejecting the array (a `String` field would fail serde before the request left the app).
- **Ollama**: a raw-base64 `images` array alongside the text — its own field, NOT the OpenAI content array.

`providerSupportsImages()` is exported so the UI gates on it. Three entry points (picker, drop, paste) all funnel through one `ingestImageFiles()`; `toAnthropicMessages()` no longer filters out empty-text turns that carry an image.

**Removed 2026-09-22: `huggingface` and `replicate`.** Both were dropped from `providers.ts`, the `LLMProvider` union, the `callLLM` switch, and their `callHuggingFace`/`callReplicate` implementations — the catalog went from 15 providers to 13. The three places that must agree were re-counted to confirm it (13 catalog keys, 13 switch cases, 13 union members). Neither had been verifiable on this machine (no key, no public model list), and both were the last providers whose request bodies had no field an image could travel in. No Rust change was needed: `envfile.rs`'s `PROVIDER_ENV` never listed either one, so no key mapping was orphaned.

**Still open:**
- **Claude Subscription DirectSDK cannot take images, and it is the default provider.** That path builds a single text prompt for the `claude` CLI, so no field can carry an image; `AnthropicTurn::text()` drops any image blocks. It is deliberately excluded from `IMAGE_CAPABLE_PROVIDERS` so the UI warns instead of silently discarding the attachment. Making it work requires writing images to temp files and letting the CLI read them, which means permitting the `Read` tool on a path currently told "Do not use tools" — a widening of what that CLI may touch, not a payload tweak.
- **Sessions (`src/lib/sessions.ts`) persist to `localStorage`, with no size cap or eviction policy.** Fine for normal use, but there's no limit on how many sessions or how much message history accumulates — a very long-running install could eventually hit `localStorage`'s per-origin quota (typically 5-10MB depending on platform). the internal `persist()` function's `try/catch` means a quota failure degrades to "this session's latest messages don't persist" rather than crashing, but there's no user-facing warning when that happens, and no pruning/archiving of old sessions. A real fix would be IndexedDB (much higher quota) or an explicit "delete old sessions" affordance — neither attempted here.
- **`src/assets/fonts/Norse.otf` and `Norse-Bold.otf` are licensed, not public-domain or npm-distributed.** Joël Carrouché Free Font License: free to use and embed in apps/web pages, but explicitly prohibits redistributing or sharing the font files "for download" without written permission. Fine while this repo is private — becomes a real question the moment `CONTRIBUTING.md`'s open-source gate is met, since a public GitHub repo lets anyone clone it and extract the raw `.otf` files. Revisit before going public: either get permission, find a differently-licensed alternative, or strip the font files from the public history/release while keeping the private repo as-is.
- ~~**The other 8 providers (Anthropic, Google, MiniMax, Qwen, Hugging Face, Ollama, Replicate, Claude DirectSDK) don't support image attachments.**~~ — resolved 2026-09-22 for Anthropic, Google, MiniMax, Qwen, and Ollama, each in its own shape (see the image-attachments entry above). Claude Subscription DirectSDK remains the one exception, for the reason stated there.
- **Only images, not arbitrary files.** The attach menu offers "Upload image" only — no PDF/document upload or text-extraction pipeline. That's a materially different feature (needs its own ingestion/chunking story) and wasn't implied by what was asked.
- ~~**`anthropic_oauth` aliases to `callAnthropic()` with the paid API key** and `claude_directsdk` is rejected with `missing field apiKey`~~ — both resolved 2026-09-22. `claude_subscription` now takes its own `ClaudeSubscriptionRequest { model, messages }` instead of `AnthropicRequest`, whose required `api_key` was failing serde before the CLI ever spawned; DirectSDK answers normally. `anthropic_oauth` was removed rather than fixed: Anthropic has no third-party OAuth API flow to implement, and the subscription login that does exist is the `claude` CLI one that DirectSDK already uses, so the entry was a duplicate that misreported its own billing.
- **`VaultBrowser` lists files and git status. It does not pull or push.** `vault_status` is read-only. `VAULT_REPO` can be empty. A push from the app is still not implemented.
- **The Hermes Docker image still does not contain the Hermes CLI.** The agent runs via the host CLI instead (`scripts/run_agent.sh hermes-agent`). Putting a second Hermes install in a Linux container and mounting the same home would race the proxy already running on this Mac. The container's `run.sh` still exits 1 if someone starts that service directly.
- **Vault-relay's push path (`VAULT_REPO` set, real remote, mounted SSH key) is untested** — see above. The pull/fold/commit path is now execution-verified; push isn't.
- **Windows path untested end-to-end.** `docker-compose.local.yml`'s `${HOST_HERMES_DIR}`/`${HOST_SSH_DIR}` fix (replacing `~` tilde mounts) has only been verified on macOS.
- **Linux/Omarchy path untested end-to-end.** Nothing in the stack — Tauri build, Docker agent runtime, or the app itself — has actually run on an Omarchy machine. Tauri's `pacman` prerequisites (see [ARCHITECTURE.md §3.1](./ARCHITECTURE.md#31-cross-platform-constraint)) haven't been verified there either.
- **No secret-scanning tool in CI.** Multiple independent hand-written scanners across several verification passes have found nothing secret-shaped in the full commit history — genuinely clean — but all explicitly caveat that a hand-rolled scanner is best-effort, not tool-certified. Add gitleaks or trufflehog before this repo ever goes public.
