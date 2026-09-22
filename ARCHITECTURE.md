# Vahalla — Architecture

**Status:** Local development. This document is the design of record — update it whenever the system changes shape, not after the fact.

## 1. What Vahalla is

Vahalla is a **desktop-first, multi-provider AI orchestration platform**. One app, three jobs:

1. **Talk to any model** — 17 providers behind one router, one chat UI
2. **Run agents** — Docker-based agent runtimes (Claude, Hermes, Grok, custom) that do work autonomously
3. **Coordinate them** — a git-synced markdown vault is the shared memory/log, not a database

It is built to be **self-hosted and user-owned**: you run it on your Mac today, and later deploy the same stack to your own cloud account. Nobody else's server ever holds your keys or your coordination log by default.

## 2. System map

```mermaid
graph TB
    subgraph Desktop["Vahalla Desktop App (Tauri)"]
        UI[Svelte UI]
        Settings[Settings<br/>provider + model prefs]
        ModelPicker[Model Picker<br/>chat interface]
        VaultBrowser[Vault Browser<br/>sync status]
        AgentControl[Agent Control<br/>start/stop/logs]
        Router[LLM Router<br/>llm-router.ts]
    end

    subgraph Providers["17 LLM Providers"]
        direction LR
        P1[Anthropic]
        P2[OpenAI / ChatGPT]
        P3[Google Gemini]
        P4[Nous Portal]
        P5[Ollama<br/>local]
        P6[...12 more]
    end

    subgraph Runtime["Agent Runtime (Docker Compose)"]
        direction LR
        A1[Claude Agent]
        A2[Hermes Agent]
        A3[Grok Agent]
        A4[Custom Agents]
    end

    subgraph Vault["Coordination Vault (git-synced Markdown)"]
        Sync[AGENT_SYNC.md<br/>live log]
        Config[agents-config.json]
        Outbox[Per-agent outboxes]
    end

    UI --> Settings
    UI --> ModelPicker
    UI --> VaultBrowser
    UI --> AgentControl

    ModelPicker --> Router
    Settings -.saves prefs.-> ModelPicker
    Router --> Providers

    AgentControl --> Runtime
    Runtime --> Outbox
    Outbox --> Sync
    VaultBrowser --> Sync
    Runtime --> Config

    Vault -. git push/pull .-> RemoteGit[(User's own<br/>private Git remote)]

    style Desktop fill:#667eea,color:#fff
    style Providers fill:#f0f4ff
    style Runtime fill:#fff4e6
    style Vault fill:#e6ffe6
```

## 3. Design principles

| Principle | What it means here |
|---|---|
| **Local-first** | Everything runs on your machine before it runs anywhere else. Cloud deploy is an option you choose later, not a requirement. |
| **User-owned data** | The vault is plain markdown + JSON in a folder you control. No proprietary format, no vendor database. |
| **Provider-agnostic** | The router is the only place that knows about provider APIs. UI and agents never hardcode a provider. |
| **Coordination ≠ storage** | The vault is for logs, config, and hand-offs between agents — not a database. If you need fast queries, that's a separate concern (see §7). |
| **Transparent security** | Credentials live in `.env`/local storage, never in the git-tracked vault. Every write to the vault is a plain-text, human-readable diff. |

## 4. Component responsibilities

### 4.1 LLM Router (`src/lib/llm-router.ts`)
Single abstraction (`callLLM(config, messages)`) that fans out to 17 provider-specific functions. Adding a provider means adding one function and one switch case — nothing else in the app should need to change.

### 4.2 Settings (`src/routes/Settings.svelte`)
User picks a **default provider + model**, saved to `localStorage`. Nothing is hardcoded as "the" default — every user configures their own, mirroring how Hermes's own provider/account settings work.

### 4.3 Model Picker (`src/routes/ModelPicker.svelte`)
Loads the saved default on mount, lets the user override per-conversation, sends through the router, renders responses with token usage.

### 4.4 Agent Control (`src/routes/AgentControl.svelte`)
Start/stop Docker-based agent containers, see last-run status. Each agent is a small, disposable process — not a long-lived service the UI depends on.

### 4.5 Vault Browser (`src/routes/VaultBrowser.svelte`)
Read-only-for-now view into the coordination vault: sync status, last pull, recent entries.

### 4.6 Agent Runtime (`agents/*`)
Each agent is a Docker container that:
1. Reads its config from `vault/agents-config.json`
2. Does its work (call an LLM, run a task)
3. Appends a result to its own outbox file in the vault
4. Exits (agents are one-shot by default, not daemons)

## 5. Data flow: sending a chat message

```mermaid
sequenceDiagram
    participant U as User
    participant MP as ModelPicker
    participant R as LLM Router
    participant P as Provider API

    U->>MP: types message, hits send
    MP->>MP: read selectedProvider/selectedModel<br/>(from Settings via localStorage)
    MP->>R: callLLM(config, messages)
    R->>R: switch(provider) → route to<br/>provider-specific function
    R->>P: fetch(endpoint, {model, messages, ...})
    P-->>R: response JSON
    R-->>MP: {success, content, usage}
    MP-->>U: render assistant message + token usage
```

## 6. Data flow: agent run → vault coordination

```mermaid
sequenceDiagram
    participant AC as Agent Control (UI)
    participant D as Docker Container
    participant V as Vault (local filesystem)
    participant G as User's Git Remote

    AC->>D: docker-compose up <agent>
    D->>V: read agents-config.json
    D->>D: run task (call LLM, do work)
    D->>V: append result to<br/>AGENT_OUTBOX_<agent>.md
    D->>D: exit

    Note over V: Relay/merge step (manual or scheduled)
    V->>V: fold outbox entries into<br/>AGENT_SYNC.md (sequential, no conflicts)
    V->>G: git add, commit, push
    G-->>V: (other agents/devices pull on their own cycle)
```

**Why outbox-per-agent instead of concurrent writes to one file:** git merge conflicts on a single shared log are the failure mode we design out from day one. Each agent only ever appends to its *own* file; a single relay step folds everything into the shared log sequentially. This is the same pattern already proven with Hermes's `AGENT_SYNC.md` bridge (`HERMES_OUTBOX.md` → relay → shared log).

## 7. What the vault is — and isn't

**Is:**
- Coordination log between agents (who did what, when, why)
- Agent configuration (`agents-config.json`)
- Human-readable audit trail (every entry is a git commit)

**Isn't:**
- A database. Hundreds of entries: fine. Tens of thousands: shard by date/agent, or add a real datastore alongside it.
- A secrets store. API keys never get written into vault files — they live in `.env` / `localStorage` / a proper secrets manager.
- A queue. If two agents need to hand off a task in real time, that's a job queue's problem, not the vault's.

## 8. Provider catalog

17 providers today, alphabetical, router-abstracted so the list can grow without touching the UI logic:

Anthropic (API key) · Anthropic (OAuth) · ChatGPT/Codex · Claude Subscription DirectSDK · Fireworks AI · Google Gemini · Groq · Hugging Face Inference API · MiniMax · Nous Portal · **Ollama** (sole local runtime — broadest local model catalog) · OpenClaw · OpenRouter (aggregator) · Perplexity · Qwen Code · Replicate (non-LLM models: image/audio/video) · Together AI · xAI Grok

See [POSITIONING.md](./POSITIONING.md) for why this list is deliberately this shape.

## 9. Deployment path (future)

```mermaid
flowchart LR
    Local["Stage 1: Local<br/>(current)"] --> Validate["Stage 2: Validate<br/>Real usage, real agents,<br/>real bugs found"]
    Validate --> Cloud["Stage 3: User-managed cloud<br/>Docker Compose / Terraform<br/>to YOUR AWS/GCP/DO account"]
    Cloud --> OpenSource["Stage 4: Open source<br/>MIT/Apache, GitHub public"]

    style Local fill:#667eea,color:#fff
    style Validate fill:#f0f4ff
    style Cloud fill:#fff4e6
    style OpenSource fill:#e6ffe6
```

Each stage is a deliberate gate, not a deadline. We do not skip Stage 2 — see [Development Notes](./CONTRIBUTING.md#why-local-first).

## 10. Related documents

- [POSITIONING.md](./POSITIONING.md) — how Vahalla differs from Hermes, LangChain, Open WebUI, AnythingLLM, and the rest of the field
- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to work on this project (even solo, even before it's public)
- [README.md](./README.md) — quick start
