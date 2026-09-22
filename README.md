# Vahalla

**Multi-agent orchestration platform** — deploy agents to your own cloud, coordinate via Obsidian vault, switch between models (OpenRouter, OpenAI, DeepSeek, Anthropic, local).

**Status:** Local development. Not ready for public use yet.

## Architecture

```
Vahalla (Desktop App — Tauri)
├─ Model Picker (OpenRouter + direct API providers)
├─ Vault Browser (read AGENT_SYNC.md, agent status)
├─ Agent Control Panel (spawn, monitor, logs)
└─ LLM Router (abstraction over multiple providers)

Agent Runtime (Docker Compose)
├─ Hermes Agent
├─ Claude Agent
├─ Grok Agent
└─ Custom Agents

Vault (Git-synced coordination)
├─ AGENT_SYNC.md (live coordination log)
├─ Agents/ (agent configs)
└─ Skills/ (tool catalog)
```

## Project Structure

```
Vahalla/
├─ src-tauri/           (Rust backend — Tauri)
│  └─ src/main.rs
├─ src/                 (Svelte frontend)
│  ├─ routes/
│  ├─ lib/
│  └─ App.svelte
├─ agents/              (Agent runtimes — Docker)
│  ├─ claude/
│  ├─ hermes/
│  └─ grok/
├─ vault/               (Default vault template)
│  ├─ AGENT_SYNC.md
│  ├─ agents/
│  └─ .gitignore
├─ docker-compose.local.yml
├─ package.json
└─ README.md
```

## Quick Start (Local Dev)

```bash
# Install dependencies
npm install

# Start Tauri dev server
npm run tauri dev

# In another terminal, start Docker agents
docker-compose -f docker-compose.local.yml up

# Vault syncs to your private GitHub repo
# (configure VAULT_REPO env var)
```

## Development Notes

- **Local-first:** Build for your own workflow before considering public release
- **No GitHub push yet:** Iterate privately, test with real agents
- **Vault is the source of truth:** All agent coordination happens via git + markdown
- **Model switching:** Use OpenRouter for broad model access; add direct APIs as needed

## Next Steps

1. Initialize Tauri + Svelte scaffold
2. Build LLM router (OpenRouter abstraction)
3. Create model picker UI
4. Add vault browser
5. Connect to Docker agent runtime
