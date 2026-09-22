# Vahalla

**Multi-provider AI orchestration, self-hosted.** One app to talk to 18 LLM providers, run agents against them, and coordinate those agents through a git-synced markdown vault instead of a database.

**Status:** Local development. Not public yet — see [CONTRIBUTING.md](./CONTRIBUTING.md#why-local-first) for why.

## Start here

| Document | What it covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, diagrams, data flow, how the pieces fit together |
| [POSITIONING.md](./POSITIONING.md) | What problem this solves, how it differs from Hermes/LangChain/Open WebUI/etc., and what's honestly *not* novel |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Local-first policy, project conventions, how to add a provider or agent |

## Quick start (local dev)

The frontend build is verified working (`npx vite build` succeeds, `npx tsc --noEmit` is clean) as of 2026-09-21 — that wasn't always true; see [CONTRIBUTING.md](./CONTRIBUTING.md#known-open-issues) if curious what was broken before then. `npm run tauri-dev` additionally needs the Rust toolchain (`rustup`) installed.

```bash
# Install dependencies
npm install

# Start Tauri dev server
npm run tauri-dev

# In another terminal, start Docker agents
docker-compose -f docker-compose.local.yml up

# Vault syncs to your private GitHub repo (optional)
# configure VAULT_REPO env var when ready
```

First run: open **Settings**, pick your default provider and model — nothing is hardcoded, see [ARCHITECTURE.md §4.2](./ARCHITECTURE.md#42-settings-srcroutessettingssvelte).

## Project structure

```
Vahalla/
├─ ARCHITECTURE.md       Design of record — read first
├─ POSITIONING.md        Why this exists, differentiation
├─ CONTRIBUTING.md        Conventions, known issues
├─ src/                  Svelte frontend (Tauri desktop app)
│  ├─ routes/             Settings, ModelPicker, VaultBrowser, AgentControl
│  └─ lib/llm-router.ts   Single abstraction over all 18 providers (src/lib/providers.ts is the count to trust)
├─ agents/                Docker agent runtimes (Claude, Hermes, Grok, custom)
├─ vault/                 Coordination log template (AGENT_SYNC.md pattern)
└─ docker-compose.local.yml
```

## Providers (18, alphabetical)

Anthropic (API key & OAuth) · ChatGPT/Codex · Claude Subscription DirectSDK · Fireworks AI · Google Gemini · Groq · Hugging Face · MiniMax · Nous Portal · **Ollama** (local) · OpenClaw · OpenRouter · Perplexity · Qwen Code · Replicate · Together AI · xAI Grok

Full rationale for this list in [POSITIONING.md §2](./POSITIONING.md#2-comparison).
