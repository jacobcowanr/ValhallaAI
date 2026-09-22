# ValhallaAI

**Multi-provider AI orchestration, self-hosted.** One app to talk to 17 LLM providers, run agents against them, and coordinate those agents through a git-synced markdown vault instead of a database.

**Status:** Local development. Not public yet — see [CONTRIBUTING.md](./CONTRIBUTING.md#why-local-first) for why.

## Start here

| Document | What it covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, diagrams, data flow, how the pieces fit together |
| [POSITIONING.md](./POSITIONING.md) | What problem this solves, how it differs from Hermes/LangChain/Open WebUI/etc., and what's honestly *not* novel |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Local-first policy, project conventions, how to add a provider or agent |

## Quick start (local dev)

The desktop app is what reads `.env`. A plain browser tab cannot. `npm run tauri-dev` needs the Rust toolchain (`rustup`).

```bash
npm install
cp env.example .env
# Fill values as NAME=value. No labels on their own line. See env.example.

npm run tauri-dev
```

Run one agent at a time. Do not start the stack with `docker compose up`: `claude-agent` makes one paid call and exits, and a restart policy is not what you want on that container. Hermes does not run inside its image.

```bash
scripts/run_agent.sh hermes-agent    # host Hermes CLI, one shot
scripts/run_agent.sh claude-agent    # needs ANTHROPIC_API_KEY, one paid call
scripts/run_agent.sh grok-agent      # needs XAI_API_KEY and enabled: true
```

The same three buttons are on **Agent Control** inside the desktop app. **Settings** shows which chat keys came from `.env`. Nous Portal does not use a key in that file; it uses the local Hermes proxy (`hermes proxy start`).

**Claude Subscription DirectSDK** is selected in Models & Chat, not in Agent Control. It uses `claude auth login`, not the paid key, and is working as of 2026-09-22. It is the only subscription-billed Claude path; `Anthropic (API key)` bills `ANTHROPIC_API_KEY`.

`VAULT_REPO` is optional and unused until you want the vault relay to push. The relay's push path has not been run against this repo.

## Launching it

`scripts/valhallaai` is symlinked onto PATH, so the app opens from anywhere:

```bash
valhallaai          # open the app
valhallaai build    # produce a release .app -- after this, opening is instant
valhallaai relay    # start the vault relay (stop: valhallaai relay stop)
```

With no release build yet, `valhallaai` falls back to `npm run tauri-dev` and
holds the terminal until Ctrl+C. Run `valhallaai build` once to get a real
launchable app instead. To set the symlink up on another machine:

```bash
ln -sf "$PWD/scripts/valhallaai" ~/.local/bin/valhallaai
```

## Project structure

```
ValhallaAI/
├─ ARCHITECTURE.md           Design of record — read first
├─ POSITIONING.md            Why this exists, differentiation
├─ CONTRIBUTING.md           Conventions, known issues
├─ env.example               .env template (copy to .env; never commit .env)
├─ src/                      Svelte frontend (Tauri desktop app)
│  ├─ routes/                Models & Chat, Sessions, Vault, Agents, Settings
│  └─ lib/                   llm-router.ts, providers.ts, provider-keys.ts, sessions.ts
├─ src-tauri/src/main.rs     Tauri commands: run_agent, provider_keys, vault_status
├─ scripts/run_agent.sh      One-shot runner the UI and the terminal share
├─ agents/                   Claude and Grok containers; Hermes runs on the host
├─ vault/                    AGENT_SYNC.md and agents-config.json
└─ docker-compose.local.yml
```

## Providers (17, alphabetical)

Anthropic (API key) · ChatGPT/Codex · Claude Subscription DirectSDK · Fireworks AI · Google Gemini · Groq · Hugging Face · MiniMax · Nous Portal · **Ollama** (local) · OpenClaw · OpenRouter · Perplexity · Qwen Code · Replicate · Together AI · xAI Grok

Full rationale for this list in [POSITIONING.md §2](./POSITIONING.md#2-comparison).
