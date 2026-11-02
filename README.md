# ValhallaAI

**Multi-provider AI orchestration, self-hosted.** One desktop app to talk to 13 LLM providers, run agents against them, and coordinate those agents through a git-synced markdown vault instead of a database.

**Status: public, early development (v0.1.0), MIT licensed.** The local-first policy this project started under is in [Why local-first](./CONTRIBUTING.md#why-local-first). macOS, Windows, and Linux all build and run — CI proves it on every push, and each has been hands-on tested in a real VM, not just compiled ([ARCHITECTURE.md §4.1](./ARCHITECTURE.md#41-cross-platform-constraint)).

## Download

**macOS is a build-from-source one-liner, on purpose** — a locally-built app never carries the quarantine flag a downloaded unsigned binary would, so Gatekeeper never gets in the way. See [Quick start](#quick-start-local-dev) below.

**Windows and Linux (x86_64) have real installers**, attached to the [v0.1.0 release](https://github.com/jacobcowanr/ValhallaAI/releases/tag/v0.1.0) and built by the same CI that tests every commit — not a separate, less-trusted build path:

| Platform | File | Notes |
|---|---|---|
| Windows | `ValhallaAI_0.1.0_x64_en-US.msi` | Standard installer. A `.exe` (NSIS) is also attached if you prefer that instead. |
| Linux (Debian/Ubuntu) | `valhalla-ai_0.1.0_amd64.deb` | `sudo dpkg -i valhalla-ai_0.1.0_amd64.deb` |
| Linux (portable) | `valhalla-ai_0.1.0_amd64.AppImage` | `chmod +x` then run directly — no install, no package manager. |

**Known gap:** Debian 13 (Trixie) and other very new distros can't build this from source at all — this Tauri version is pinned to `libsoup-2.4`/`webkit2gtk-4.0`, which those distros no longer ship. Debian 12 (Bookworm) and Ubuntu 22.04 are confirmed working. arm64 Linux users should build from source (`.deb`/`.rpm` work fine there; AppImage bundling does not, in this Tauri version).

### Which download is for you?

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
flowchart TD
    accTitle: Which download is for you?
    accDescr {
        A decision tree for installing. On macOS, build from source with the
        launcher. On Windows, use the msi installer. On Debian 12 or Ubuntu 22.04 on
        x86-64, use the deb package. On other x86-64 Linux, use the AppImage. On
        arm64 Linux, build from source. On Debian 13 and other very new
        distributions, the app cannot be built or run because of pinned system
        libraries.
    }
    Q["Your system"] --> M{"OS"}
    M -->|macOS| MAC["build from source<br/>npm install, then valhallaai build"]
    M -->|Windows| WIN["ValhallaAI_0.1.0_x64_en-US.msi<br/>or the NSIS .exe"]
    M -->|Linux| LA{"CPU"}
    LA -->|arm64| ARM["build from source<br/>.deb works, AppImage bundling does not"]
    LA -->|x86-64| LD{"distribution"}
    LD -->|"Debian 12 · Ubuntu 22.04"| DEB["valhalla-ai_0.1.0_amd64.deb<br/>sudo dpkg -i"]
    LD -->|"Arch · Omarchy · other"| APP["valhalla-ai_0.1.0_amd64.AppImage<br/>chmod +x, then run"]
    LD -->|"Debian 13 · very new"| NO["cannot build: libsoup-2.4<br/>and webkit2gtk-4.0 are not shipped"]
    class MAC,ARM human
    class WIN,DEB,APP ok
    class NO gate
    class M,LA,LD human
    classDef live fill:#667eea,stroke:#4c51bf,color:#ffffff
    classDef machine fill:#f0f4ff,stroke:#8b9cf4,color:#1b1533
    classDef human fill:#fff4e6,stroke:#e0a458,color:#3a2a00
    classDef gate fill:#ffe6e6,stroke:#e08080,color:#4a1010
    classDef ok fill:#e6ffe6,stroke:#6fbf73,color:#0f3a12
    classDef idle fill:#f5f5f5,stroke:#b8b8b8,color:#444444
```

**Reading it.** Only the green boxes are a download. macOS is build-from-source on purpose: a locally built app never carries the quarantine flag that a downloaded unsigned binary would, so Gatekeeper never gets in the way. The red box is a limit of the Tauri version the project is pinned to, not of your machine.

## What it does

| | |
|---|---|
| **Chat** | 13 providers behind one UI, one picker. Drop, paste, or pick a screenshot and **12 of the 13** read it. |
| **Agents** | Three runtimes, run one at a time. All three prefer a flat-rate subscription login and fall back to a paid key only when there is no login. |
| **Coordination** | A git-synced markdown vault. Each agent appends to its own outbox; a relay folds them into one append-only log. No database. |
| **Extensible** | Add a provider (any OpenAI-compatible endpoint) or an agent (bound to one of the three allowlisted runtimes) from the UI, without editing the source. |
| **Your keys, your machine** | Provider keys load from your own `.env` inside the desktop app — not from a browser tab. Nothing is sent anywhere except the provider you picked. |

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
flowchart TB
    accTitle: ValhallaAI at a glance
    accDescr {
        Three jobs in one window. Models and Chat routes to thirteen providers,
        twelve of which accept images. Agent Control starts one of three agent
        runtimes, each preferring a subscription login. The runtimes read their
        task from the vault, write their answer to their own outbox, and a relay
        folds those into the append-only coordination log, which is a git tree.
        The Vault Browser reads that folder and shows git status without pushing.
    }
    You((You)) --> Chat["Models & Chat<br/>13 providers, 12 read images"]
    You --> Agents["Agent Control<br/>one run at a time"]
    You --> VaultUI["Vault Browser<br/>read-only"]
    Chat --> Sub["subscription login first<br/>paid key as fallback"]
    Chat --> Keys["per-token keys"]
    Agents --> Runtimes["claude-agent / hermes-agent / grok-build"]
    Runtimes --> Outbox["per-agent outbox<br/>(gitignored)"]
    Outbox -.->|"not automatic"| Relay["vault relay"]
    Relay -.-> Log[("AGENT_SYNC.md<br/>append-only, in git")]
    VaultUI --> Log

    style Chat fill:#667eea,color:#fff
    style Agents fill:#667eea,color:#fff
    style Relay fill:#f5f5f5
```

**Reading it.** Everything solid is in use today; the one dotted pair is the relay, because folding your outboxes into the shared log is a **separate step you start** rather than something a Run click does. That single fact is the biggest difference between this design and this project's daily reality — it is stated in three places on purpose ([ARCHITECTURE.md §9.3](./ARCHITECTURE.md#93-the-honest-state-of-the-relay)).

## Start here

| Document | What it covers |
|---|---|
| [DIAGRAMS.md](./DIAGRAMS.md) | The diagram atlas: the whole system on one page, six requests traced end to end, and an index of all 62 diagrams |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Design of record: system map, component responsibilities, data flow, security model, measured agent performance, and a table of what is proven versus merely built |
| [POSITIONING.md](./POSITIONING.md) | What problem this solves, how it differs from Hermes / LangChain / Open WebUI / LibreChat / Modal, and what is honestly *not* novel |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Local-first policy, conventions, recipes for adding a provider or an agent, and the known-open-issues list |

## Documents and artefacts

The repo's index. Everything here is either a living document (edited as the system changes) or a frozen artefact (written to be sent, then left alone).

| Path | What it is | Status |
|---|---|---|
| [DIAGRAMS.md](./DIAGRAMS.md) | Diagram atlas — the system on one page, six requests traced, an index of every diagram | living |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Design of record — system map, components, data flow, security model, measured performance, proven-vs-built table | living |
| [POSITIONING.md](./POSITIONING.md) | Differentiation, who it fits, and the honest risks | living |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Conventions, recipes, known open issues | living |
| README.md | this file — quick start and index | living |
| [Reports/Image-Attachments-Prompt_09.22.2026.md](./Reports/Image-Attachments-Prompt_09.22.2026.md) | A portable prompt for adding screenshot attachments to any multi-provider chat UI, written from this implementation | **frozen** — already sent, not edited in place |
| [Reports/Norse-Font-Permission_09.22.2026.md](./Reports/Norse-Font-Permission_09.22.2026.md) | The permission request to the Norse font's author | **sent, superseded** — no reply; the font was swapped instead (see [CONTRIBUTING.md](./CONTRIBUTING.md#known-open-issues)) |
| [vault/AGENT_SYNC.md](./vault/AGENT_SYNC.md) | The project's agent coordination log | append-only |

Two rules keep this table meaningful. A **report** is an artefact written to be sent — once sent it is frozen, and a superseded report stays where it is with the README saying which one is live rather than being deleted or overwritten. A **session file** (`Sessions/`) is the working record, one per session. Superseded work is never erased; the index is what carries the status.

## Quick start (local dev)

**Prerequisites:** Node 18+, npm, and the Rust toolchain (`rustup`) for the Tauri shell. Docker/OrbStack is needed only for the two container fallbacks.

```bash
npm install
cp env.example .env
# Fill in NAME=value lines only. A label on its own line makes Docker Compose
# reject the whole file. See env.example for the accepted names.

npm run tauri-dev          # dev mode, hot reload
```

**The desktop app is what reads `.env`. A plain browser tab cannot** — it has no filesystem access, so provider keys would silently be missing. Use `npm run tauri-dev`, or a release build.

### What happens on first launch

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
flowchart TD
    accTitle: What happens on first launch
    accDescr {
        Install dependencies, copy the env template, and start the app in
        development mode. The desktop app, not a browser tab, reads the env file
        through its Rust core. The first launch then shows the sign-in gate, which
        can be passed with Google, GitHub or no account, and the app opens on Models
        and Chat with the default provider.
    }
    A["npm install"] --> B["cp env.example .env<br/>NAME=value lines only"]
    B --> C["npm run tauri-dev"]
    C --> D["Rust core reads .env<br/>provider keys + OAuth settings"]
    D --> E["Sign-in gate<br/>Google · GitHub · Continue without an account"]
    E --> F["Models & Chat<br/>default: Claude Subscription DirectSDK"]
    C -.-> X["a plain browser tab cannot read .env<br/>keys would silently be missing"]
    class A,B,C human
    class D machine
    class E human
    class F ok
    class X gate
    classDef live fill:#667eea,stroke:#4c51bf,color:#ffffff
    classDef machine fill:#f0f4ff,stroke:#8b9cf4,color:#1b1533
    classDef human fill:#fff4e6,stroke:#e0a458,color:#3a2a00
    classDef gate fill:#ffe6e6,stroke:#e08080,color:#4a1010
    classDef ok fill:#e6ffe6,stroke:#6fbf73,color:#0f3a12
    classDef idle fill:#f5f5f5,stroke:#b8b8b8,color:#444444
```

**Reading it.** The dotted red node is the trap this diagram is for: a Vite page opened in an ordinary browser has no filesystem access, so provider keys vanish without an error. Everything that reads `.env` lives in the Tauri process.

### Build a real app (recommended after the first run)

```bash
valhallaai build           # release .app + .dmg; opening is then instant
valhallaai                 # launch it
```

With no release build, `valhallaai` falls back to `npm run tauri-dev` and holds the terminal until Ctrl+C. To put the launcher on PATH on a new machine:

```bash
ln -sf "$PWD/scripts/valhallaai" ~/.local/bin/valhallaai
```

### How `valhallaai` decides what to launch

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
flowchart TD
    accTitle: How `valhallaai` decides what to launch
    accDescr {
        The launcher first writes a pointer file recording where the checkout is, so
        a relocated app can find it. With no subcommand it opens a release build if
        one exists. Otherwise it falls back to development mode and holds the
        terminal. The build subcommand produces a release app, and the relay
        subcommand starts or stops the optional relay container.
    }
    L["valhallaai [command]"] --> P["write the project pointer file<br/>~/Library/Application Support/com.valhallaai.app/project_dir"]
    P --> K{"command"}
    K -->|"none or open"| RB{"release build<br/>exists?"}
    RB -->|yes| OPEN["open the .app<br/>instant · no terminal held"]
    RB -->|no| DEV["npm run tauri-dev<br/>holds the terminal until Ctrl+C"]
    K -->|dev| DEV
    K -->|build| BLD["npm run tauri-build<br/>release .app + .dmg"]
    K -->|"relay · relay stop"| RLY["docker compose<br/>start or stop the vault-relay container"]
    class OPEN ok
    class DEV human
    class BLD,RLY machine
    class RB,K human
    classDef live fill:#667eea,stroke:#4c51bf,color:#ffffff
    classDef machine fill:#f0f4ff,stroke:#8b9cf4,color:#1b1533
    classDef human fill:#fff4e6,stroke:#e0a458,color:#3a2a00
    classDef gate fill:#ffe6e6,stroke:#e08080,color:#4a1010
    classDef ok fill:#e6ffe6,stroke:#6fbf73,color:#0f3a12
    classDef idle fill:#f5f5f5,stroke:#b8b8b8,color:#444444
```

**Reading it.** The pointer file is what lets a double-clicked `.app` find `.env`, `vault/` and the scripts: macOS `open` does not forward environment variables, so an export would not reach it, but a file can. It is rewritten on every run, so moving the checkout and launching once corrects it.

### Checks

```bash
npm run check         # svelte-check — types across every .svelte and .ts file
npm run docs:check    # every internal doc anchor resolves
npm run secret:scan   # credential values in tracked files (see below)
npm run build         # the real Vite production build
```

The same four run in CI on every push (`.github/workflows/ci.yml`), along with `cargo test` and a scan of the **entire git history** for credentials — because a key that was committed and later deleted is still in every clone. That scanner matches credential *values*, reports them redacted rather than in full, and is honest about its limits: it is not gitleaks. [CONTRIBUTING.md](./CONTRIBUTING.md#repository-checks) says what it does and does not catch.

**CI runs on every push and pull request.** Its first run (2026-09-23) failed; every run since has passed, including the latest checked on 2026-11-02, which passed all six jobs: the secret scan, the web checks, `cargo test` on Linux and on Windows, and the Linux and Windows installer builds.

## Signing in

Sign-in is **optional**. The first launch shows a gate with three ways through it: Google, GitHub, or **Continue without an account**.

**The local path needs no network and no configuration.** You get a profile named `Local` with no email attached, and every feature, provider key and setting works exactly the same. Nothing is withheld — sign-in supplies a display name, avatar and email for the profile and nothing else. You can sign in later from the profile page; signing in then overwrites the provider and adds the identity.

That matters because **this app reads OAuth credentials from your own `.env`**. Requiring sign-in would mean every new user registering a Google Cloud OAuth client *and* a GitHub OAuth app before seeing a single screen, which is unreasonable for a tool you clone and run.

**Google or GitHub, either one.** Both are identity only:

- **What is stored:** a display name, email, avatar and which provider you used — on the profile, in this machine's local storage. Your chats, keys and preferences are separate and belong to the machine, not the account.
- **Nothing syncs.** There is no backend, so there is nothing to authorize against and no data leaves this machine except the OAuth handshake itself.
- **No token is kept.** The access/id token is used to read identity and then discarded — so there is no credential sitting in the app to revoke.
- **Sign-in is not authorization.** The app never calls Google or GitHub again after the handshake.

Three setup notes, all of which cost time if discovered late:

1. **GitHub needs two variables in `.env`** — `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. If either is missing, the GitHub button is disabled and its tooltip says exactly that. Google needs `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (the `VITE_` prefix is required — that one is read by the frontend, unlike GitHub's). Changing either set requires an **app restart**: the non-`VITE_` values are read by the Rust process, so a Vite hot reload will not pick them up.
2. **Register the GitHub OAuth App with the callback `http://127.0.0.1/callback` — no port.** GitHub matches the registered path and accepts whatever port the app binds at request time, so one registration covers every run. A port in that field produces `redirect_uri_mismatch`.
3. **A Google Cloud OAuth consent screen in Testing mode only admits listed test users** — anyone else gets `access_denied`. Add yourself under *Audience → Test users*.

Signing out clears the identity fields only; a local profile has nothing to sign out of and says so. `env.example` documents both providers' variables.

### The three ways through the gate

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
flowchart LR
    accTitle: The three ways through the gate
    accDescr {
        On first launch the gate offers Google, GitHub or Continue without an
        account. Google and GitHub need an OAuth client that you register and put in
        your own env file. The local path needs no network and no configuration,
        gives a profile named Local with no email, and withholds nothing. Signing in
        later overwrites the provider and adds the identity.
    }
    G["First launch · sign-in gate"] --> GO["Google<br/>needs VITE_GOOGLE_CLIENT_ID<br/>and GOOGLE_CLIENT_SECRET"]
    G --> GH["GitHub<br/>needs GITHUB_CLIENT_ID<br/>and GITHUB_CLIENT_SECRET"]
    G --> LO["Continue without an account<br/>no network · no configuration"]
    GO --> APP["App opens<br/>name · email · avatar on the profile"]
    GH --> APP
    LO --> APP2["App opens<br/>profile named Local · no email"]
    APP2 -.->|"sign in later from Profile"| APP
    class GO,GH human
    class LO,APP,APP2 ok
    classDef live fill:#667eea,stroke:#4c51bf,color:#ffffff
    classDef machine fill:#f0f4ff,stroke:#8b9cf4,color:#1b1533
    classDef human fill:#fff4e6,stroke:#e0a458,color:#3a2a00
    classDef gate fill:#ffe6e6,stroke:#e08080,color:#4a1010
    classDef ok fill:#e6ffe6,stroke:#6fbf73,color:#0f3a12
    classDef idle fill:#f5f5f5,stroke:#b8b8b8,color:#444444
```

**Reading it.** Nothing is withheld on the local path: sign-in supplies a display name, avatar and email and nothing else, because there is no backend and nothing syncs. That is also why the gate is optional. Requiring sign-in would make every new user register a Google Cloud OAuth client and a GitHub OAuth app before seeing a single screen.

## Running agents

Three runtimes. **One at a time** — the same three buttons exist on **Agent Control** inside the app, and the terminal takes the same argument.

```bash
scripts/run_agent.sh hermes-agent    # host Hermes CLI, one shot, --max-turns 1
scripts/run_agent.sh claude-agent    # subscription first, paid key as fallback
scripts/run_agent.sh grok-build      # Grok CLI subscription, container fallback
```

| Runtime | Where it runs | Auth | Billing |
|---|---|---|---|
| `claude-agent` | host `claude` CLI, else Docker | `claude auth login` (Pro/Max) | subscription; container bills `ANTHROPIC_API_KEY` |
| `hermes-agent` | host `hermes` CLI | `hermes portal` login | subscription |
| `grok-build` | host `grok` CLI, else Docker | `grok login` (grok.com) | subscription; container bills `XAI_API_KEY` |

Each run reads its task from `vault/agent-tasks.json`, does the work, appends one entry to `vault/AGENT_OUTBOX_<agent>.md`, and exits. **Nothing writes `AGENT_SYNC.md` directly** — the relay folds outboxes into it ([ARCHITECTURE.md §9.2](./ARCHITECTURE.md#92-the-full-agent-and-vault-picture)).

**Do not start the agents with `docker compose up`.** `claude-agent` makes one paid call and exits; a restart policy is not what you want on that container (`restart: "no"` is deliberate). Hermes does not run inside its image at all — it needs the macOS virtualenv at `~/.hermes`.

Edits to `vault/agent-tasks.json` take effect on the **next run with no rebuild**, because the task is read at run time. Edits to Rust or Svelte code need `npm run tauri-dev` (or a rebuild) — a Vite hot reload does not pick up a Rust change.

### Where one agent answer goes

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
stateDiagram-v2
    accTitle: Where one agent answer goes
    accDescr {
        A Run click starts an agent, which reads its task and appends its answer to
        its own outbox file and exits. That part is automatic. Folding the outbox
        into the shared log, committing it, and pushing it are a separate relay step
        that you start, and the push has never run against this repository.
    }
    [*] --> Running: click Run
    Running --> InOutbox: answer appended to AGENT_OUTBOX_agent.md
    InOutbox --> Folded: relay folds it into AGENT_SYNC.md
    Folded --> Committed: relay commits vault/
    Committed --> Pushed: relay pushes, only if VAULT_REPO is set
    note right of InOutbox
        Automatic up to here.
        Everything below needs the relay,
        which valhallaai relay starts.
    end note
```

**Reading it.** This is the single biggest gap between the design and the daily reality, so it is stated in three places. If an answer seems to be missing from `AGENT_SYNC.md`, it is almost certainly sitting in its outbox, waiting for a relay that is not running.

### Why a run is fast now (and was not before)

A `grok-build` run used to take **197 seconds** to answer a question whose answer was already in the prompt: the instruction said "read the coordination log", so the model spent its first turn deciding to `cat` a file the runner had already pasted in. The fix was an instruction that says the context is supplied, plus a fast model variant at low reasoning effort. Measured: **197 s → 41 s end to end**, with the same answer citing the same log entries.

The ladder, the three levers that *don't* work, and the honest note that `claude-agent` was never slow are in [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-agent-run-performance). Overrides: `GROK_AGENT_MODEL`, `GROK_AGENT_EFFORT`, `AGENT_TIMEOUT_SECS`.

## Providers (13)

| Provider | Reads images | Billed how | Key from |
|---|---|---|---|
| Anthropic (API key) | yes | per token | `.env` — `ANTHROPIC_API_KEY` |
| ChatGPT / Codex | yes | per token | `.env` — `OPENAI_API_KEY` |
| **Claude Subscription DirectSDK** | **no — text only** | **flat-rate subscription (the default)** | `claude auth login` |
| Fireworks AI | yes | per token | Settings |
| Google Gemini | yes | per token | `.env` — `GOOGLE_API_KEY` |
| Groq | yes | per token | Settings |
| MiniMax | yes | per token | Settings |
| Nous Portal | yes | flat-rate | local Hermes proxy — no pasted key |
| Ollama | yes | free — runs on this machine | none |
| OpenRouter | yes | per token | `.env` — `OPENROUTER_API_KEY` |
| Perplexity | **no** — see caveat 4 | per token | Settings |
| Qwen Code | yes | per token | Settings |
| xAI Grok | yes | per token | `.env` — `XAI_API_KEY` |

Anything else that speaks the OpenAI dialect can be added from **Settings → Custom Providers** (name + chat-completions URL + model ids). The id is namespaced `custom:<slug>` so it can never shadow a built-in. Why the list has this shape, and what was removed from it, is in [POSITIONING.md §3.2](./POSITIONING.md#32-genuinely-novel-for-this-category-breadth-of-provider-catalog-behind-one-interface). How each one is actually called is in [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-provider-catalog).

### Picking a provider

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
flowchart TD
    accTitle: Picking a provider
    accDescr {
        A decision guide. If you need to send screenshots, avoid the default and
        Perplexity and choose Google or Nous. If you want nothing billed per
        message, use the default, Nous or Ollama. If your data must stay on this
        machine, use Ollama. If your provider is not listed but speaks the OpenAI
        dialect, add it as a custom provider.
    }
    Q["What matters most?"] --> A{"sending screenshots?"}
    A -->|yes| IMG["Google Gemini · Nous Portal<br/>or any of the other 10 that read images<br/>not the default, not Perplexity"]
    A -->|no| B{"no per-message cost?"}
    B -->|yes| FLAT["Claude Subscription DirectSDK (default)<br/>Nous Portal · Ollama"]
    B -->|no| C{"data must stay<br/>on this machine?"}
    C -->|yes| OLL["Ollama"]
    C -->|no| D{"provider<br/>not listed?"}
    D -->|"speaks the OpenAI dialect"| CUS["Settings → Custom Providers"]
    D -->|"different request shape"| SRC["needs a source change"]
    D -->|"it is listed"| ANY["pick it in the model bar"]
    class IMG,FLAT,OLL,CUS,ANY ok
    class SRC human
    class A,B,C,D human
    classDef live fill:#667eea,stroke:#4c51bf,color:#ffffff
    classDef machine fill:#f0f4ff,stroke:#8b9cf4,color:#1b1533
    classDef human fill:#fff4e6,stroke:#e0a458,color:#3a2a00
    classDef gate fill:#ffe6e6,stroke:#e08080,color:#4a1010
    classDef ok fill:#e6ffe6,stroke:#6fbf73,color:#0f3a12
    classDef idle fill:#f5f5f5,stroke:#b8b8b8,color:#444444
```

**Reading it.** Each question prunes a real constraint rather than a preference. The first one is about a hard limit: the default provider cannot carry an image at all, and Perplexity stopped reading them when it was rewritten onto the Agent API. The fourth separates a Settings action from a code change, which is the same decision as the diagram in `CONTRIBUTING.md`.

## The caveats worth knowing before you rely on it

1. **The default provider cannot read images.** Claude Subscription DirectSDK pipes a text prompt to the `claude` CLI, so there is no field an image can travel in. It is the default because it is flat-rate. **If your work is screenshot-heavy, switch to Google or Nous Portal.** Making this path work means letting the CLI read temp files, i.e. widening what tools it may use — a decision, not a tweak ([ARCHITECTURE.md §6.1](./ARCHITECTURE.md#61-sending-a-chat-message)).
2. **The relay is not running by default, so agent answers stop in their outbox.** `valhallaai relay` starts it. Its fold-and-commit logic is verified; its **push has never run against this repo** and requires `VAULT_REPO` to be set ([ARCHITECTURE.md §9.3](./ARCHITECTURE.md#93-the-honest-state-of-the-relay)).
3. **The Vault Browser never pushes.** The app has no push path anywhere by design. It lists files and reports `git status`; you commit and push from a terminal.
4. **Perplexity was rewritten onto the Agent API on 2026-09-22 and has never been run.** Sonar Chat Completions retires 2026-09-27, so the old `{model, messages}` → `{choices}` path would have kept working for five more days and then stopped. The replacement uses `POST /v1/agent` with a **`preset`** (`low`, `fast`, `medium`) instead of a model id and a typed `output` array instead of `choices`. **No Perplexity key exists on this machine, so not one line of it has been exercised** — treat the first run with a key as the real test. Two consequences already known: the model dropdown shows the raw preset name ("low"), and **this provider no longer reads images**, since the rewrite sends the conversation as text ([CONTRIBUTING.md](./CONTRIBUTING.md#known-open-issues)).
5. **macOS is build-from-source only.** The `.app` is ad-hoc signed, arm64-only, and expects a checkout to exist on the machine, so it is not distributable. Windows and Linux x86_64 have CI-built installers (see [Download](#download)); on Windows, Agent Control cannot run agents yet because `run_agent` needs `bash` ([CONTRIBUTING.md](./CONTRIBUTING.md#known-open-issues)).

## Project structure

```
ValhallaAI/
├─ ARCHITECTURE.md           Design of record — read first
├─ POSITIONING.md            Why this exists, differentiation, honest non-novelty
├─ CONTRIBUTING.md           Conventions, recipes, known issues
├─ README.md                 this file
├─ env.example               .env template (copy to .env; never commit .env)
├─ index.html                Vite entry point
├─ src/                      Svelte frontend (runs inside the Tauri webview)
│  ├─ App.svelte             sidebar shell + profile card + nav
│  ├─ routes/                Models & Chat, Recent, Projects, Sessions,
│  │                         VaultBrowser, AgentControl, Profile, Settings,
│  │                         Onboarding
│  └─ lib/                   llm-router.ts (the only place that talks to
│                            providers), providers.ts (the only catalog),
│                            provider-keys.ts, sessions.ts, profiles.ts,
│                            custom-providers.ts, custom-agents.ts
├─ src-tauri/src/main.rs     Tauri commands: run_agent, agent_status,
│                            provider_keys, vault_status, vault_file,
│                            google_sign_in, github_sign_in,
│                            github_client_configured + path/config helpers
├─ src-tauri/src/envfile.rs  Reads the allowlisted .env keys
├─ scripts/valhallaai        Launcher: open, build, relay
├─ scripts/run_agent.sh      One-shot runner shared by the UI and the terminal
├─ scripts/vault_relay.sh    Folds outboxes into AGENT_SYNC.md, commits, can push
├─ scripts/vault_relay.Dockerfile
├─ agents/                   claude + grok containers, _shared/task.cjs prompt builder
├─ vault/                    agent-tasks.json, agents-config.json, AGENT_SYNC.md,
│                            AGENT_OUTBOX_*.md (gitignored)
└─ docker-compose.local.yml
```

## Troubleshooting

Every entry here is a real failure that cost time, not a hypothetical.

### A first triage for run problems

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
flowchart LR
    accTitle: A first triage for run problems
    accDescr {
        A symptom-first guide for agent and sign-in problems. A frozen window means
        an old build. A run that falls through to Docker means the tool was not
        found on the GUI path. A run that takes minutes means the prompt invites
        tools. Sign-in failures split by provider into a missing variable, a
        registered callback with a port in it, or a consent screen still in Testing.
    }
    S["Something is wrong"] --> W1["window freezes for minutes on Run"] --> F1["an old build: run_agent was not async yet<br/>→ valhallaai build"]
    S --> W2["no subscription, then docker: command not found"] --> F2["GUI PATH is minimal<br/>→ install in ~/.local/bin, ~/.grok/bin, ~/.hermes/bin"]
    S --> W3["DirectSDK: No claude CLI could be run"] --> F3["same trap in the chat path<br/>→ set CLAUDE_SUBSCRIPTION_DIRECTSDK_COMMAND"]
    S --> W4["a grok-build run takes about 3 minutes"] --> F4["the prompt invites tool use<br/>→ check agent-tasks.json"]
    S --> W5["answer missing from AGENT_SYNC.md"] --> F5["the relay is not running<br/>→ read the outbox, or run valhallaai relay"]
    S --> W6["GitHub sign-in button is disabled"] --> F6["GITHUB_CLIENT_ID or SECRET missing<br/>→ add both, restart the app"]
    S --> W7["GitHub: redirect_uri_mismatch"] --> F7["callback has a port<br/>→ use http://127.0.0.1/callback"]
    S --> W8["Google: access_denied"] --> F8["consent screen still in Testing<br/>→ add yourself as a test user"]
    class S live
    class W1,W2,W3,W4,W5,W6,W7,W8 human
    class F1,F2,F3,F4,F5,F6,F7,F8 ok
    classDef live fill:#667eea,stroke:#4c51bf,color:#ffffff
    classDef machine fill:#f0f4ff,stroke:#8b9cf4,color:#1b1533
    classDef human fill:#fff4e6,stroke:#e0a458,color:#3a2a00
    classDef gate fill:#ffe6e6,stroke:#e08080,color:#4a1010
    classDef ok fill:#e6ffe6,stroke:#6fbf73,color:#0f3a12
    classDef idle fill:#f5f5f5,stroke:#b8b8b8,color:#444444
```

**Reading it.** The table below has the full symptom, cause and fix for each of these. The shape to notice is that most rows are the same two root causes: the GUI-launched app has a minimal `PATH`, and a Vite hot reload does not re-read `.env` or Rust code. When something fails in the app but works in Terminal, suspect the environment before the code.

| Symptom | Cause | Fix |
|---|---|---|
| The window freezes for minutes on **Run** and only force-quit helps | The installed `.app` predates `run_agent` becoming `async` (a *synchronous* Tauri command blocks the webview's event loop for the whole run) | `valhallaai build`, or `npm run tauri-dev`. Confirm `async fn run_agent` is present in `src-tauri/src/main.rs` |
| A run says "no subscription" and then fails with `docker: command not found` | Tauri launches the runner with a GUI `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`), so `grok`/`claude` look absent | The script now prepends `~/.grok/bin`, `~/.local/bin`, `~/.hermes/bin`, `~/.orbstack/bin` plus `path_helper`. If you hit it again, check the binary is in one of those |
| Chat on **Claude Subscription DirectSDK** fails with *"No `claude` CLI could be run … No such file or directory"* | Same trap, different code path: the app is GUI-launched, so its `PATH` is `/usr/bin:/bin:/usr/sbin:/sbin`, and Claude Code's **native installer** puts the CLI in `~/.local/bin` — not on it. The CLI works in Terminal and is invisible to the app | Fixed: the Rust side now resolves the binary by absolute path (`~/.local/bin`, `~/.claude/local`, `~/.npm-global/bin`, `/opt/homebrew/bin`, `/usr/local/bin`) **and** prepends those to the child's `PATH`. Still failing? Set `CLAUDE_SUBSCRIPTION_DIRECTSDK_COMMAND` to the binary's absolute path in `.env` |
| A `grok-build` run takes ~3 minutes | The prompt invites tool use, or the model default is in play | Check `vault/agent-tasks.json` for the "context is already supplied, do not call tools" line and the `run_grok` flags in `scripts/run_agent.sh` |
| `grok --max-turns 1` records **no answer** | One turn is exhausted deciding what to do | Use `3`. It is a ceiling, not a target |
| `npx tsc --noEmit` is clean but the app is broken | Plain `tsc` silently skips `.svelte` files entirely | `npm run check` (`svelte-check`) — see [CONTRIBUTING.md](./CONTRIBUTING.md#before-claiming-something-works) |
| A screenshot disappears from a message | The provider is Claude Subscription DirectSDK (text-only) | Switch to Google or Nous Portal; the UI warns and disables Send for this case |
| The agent's answer is not in `AGENT_SYNC.md` | Nothing folds outboxes automatically | Read `vault/AGENT_OUTBOX_<agent>.md`, or run `valhallaai relay` |
| Docker Compose rejects `.env` with a syntax error | A label sits on its own line | `NAME=value` lines and `#` comments only |
| An agent's "answer" is a `MODULE_NOT_FOUND` stack trace | Some CLI hook noise was captured as stdout | Fixed by the `redact()` filter in `run_agent.sh`; if a new hook appears, add its pattern there |
| The gate shows a disabled "Sign in with GitHub" | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` are missing or empty in `.env` | Add both, then **restart the app** — Rust reads `.env`, so a Vite reload will not pick them up |
| GitHub sign-in fails with `redirect_uri_mismatch` | The OAuth App's registered callback has a port in it, or a different path | Set it to exactly `http://127.0.0.1/callback` (no port) |
| Google sign-in fails with `access_denied` | The consent screen is still in Testing and your account is not on the test-user list | Add the account under **Audience → Test users**, or publish the app |
| The Profile page shows an **Unverified** email badge | The provider returned an unverified address (an unconfirmed GitHub address, some Workspace setups) | Expected and harmless — the badge is surfaced, not enforced, and sign-in still works |

## What is proven, and what is not

The full table is [ARCHITECTURE.md §12](./ARCHITECTURE.md#12-verification-what-is-proven-and-what-is-merely-built). The short version:

**Proven:** 13 providers counted three ways; 12 read images; a Run click no longer freezes the app; `grok-build` bills the subscription with no `XAI_API_KEY` set; a run is ~5× faster (197 s → 41 s); `cargo test` → 22 passed; the relay folds and commits (verified on a throwaway repo); **Google and GitHub sign-in both round-trip end to end**, GitHub against a live consent screen; the DirectSDK path resolves the `claude` CLI under the app's real (minimal) PATH; **Windows and Linux x86_64 installers are built by CI on every push** (attached to the v0.1.0 release) and were hands-on tested in real VMs, and `cargo test` passes on both (22 tests on Linux, 21 on Windows, latest CI run).

**Not proven, and not claimed:** the relay has never pushed to a remote; there is no daily multi-agent loop in this repo yet; `callNous()` has not been exercised against the live proxy since the provider-count changes; **the Perplexity Agent API rewrite has never been run (no key)**; `claude-agent`'s instruction edit is a consistency fix, not a speedup (9 s before, 9 s after).
