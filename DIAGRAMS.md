# ValhallaAI — Diagram atlas

**62 diagrams, one page of orientation.** This file is the map: the whole system on a single page, six requests traced end to end, and an index that links every other diagram in the repository. Each diagram in the documents carries a screen-reader title and description and is followed by a *Reading it* paragraph that says what to notice.

**Start here:** the system on one page → the request closest to what you are trying to understand → follow its *Detail* links into [ARCHITECTURE.md](./ARCHITECTURE.md).

## How to read the colours

| Colour | Meaning |
|---|---|
| Indigo | The live target: the thing a diagram is about |
| Light blue | Machine-side, automated work |
| Amber | A human step, or a step that needs care |
| Rose | A gate that can refuse, or an error |
| Green | The healthy outcome, or a store that holds the answer |
| Grey | Optional, planned, or not active by default |

Solid arrows are paths in use today, thick arrows are bulk or blocking, and dotted arrows are not active by default. The full legend is [ARCHITECTURE.md §2](./ARCHITECTURE.md#2-how-to-read-the-diagrams).

## The system on one page

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
flowchart TB
    accTitle: ValhallaAI on one page
    accDescr {
        You work in one desktop window. Chat goes through a single router to
        provider APIs, the Claude CLI on a flat-rate login, or local endpoints.
        Agent Control starts a one-shot runner that uses a host CLI when there is a
        login and a Docker container otherwise, and the answer lands in a per-agent
        outbox. A relay that you start folds outboxes into the shared log and can
        push it to your own remote. Everything the app remembers lives in per-
        profile local storage, the env file and the vault.
    }
    You(("You")) --> App["ValhallaAI desktop app<br/>Tauri · Svelte webview + Rust core"]
    App --> Gate["Sign-in gate<br/>Google · GitHub · local"]
    App --> Chat["Models & Chat<br/>13 providers + your own"]
    App --> Hist["Recent · Projects · Sessions<br/>one flat store"]
    App --> Set["Settings · Profile"]
    App --> Ctl["Agent Control<br/>3 runtimes + custom agents"]
    App --> VB["Vault Browser<br/>read-only"]
    Chat --> Router["llm-router.ts<br/>one entry point: callLLM"]
    Router --> Prov["Provider APIs"]
    Router --> Loc["Ollama · Hermes proxy"]
    Router --> Sub["claude CLI<br/>flat-rate login"]
    Ctl --> Run["run_agent.sh<br/>one-shot · allowlisted name"]
    Run --> RT["host CLI on a login<br/>or a Docker container"]
    RT ==> Out["per-agent outbox<br/>gitignored"]
    Out -.->|"a separate step you start"| Rel["vault relay"]
    Rel -.-> Log[("AGENT_SYNC.md<br/>append-only · in git")]
    Log -.->|"only if VAULT_REPO is set"| Remote[("your own git remote")]
    VB --> Log
    Gate --> LS[("localStorage<br/>per profile")]
    Hist --> LS
    Set --> LS
    Set --> Env[(".env keys<br/>machine-wide")]
    class App,Chat,Ctl live
    class Router,Run,Rel machine
    class Prov,Loc,Sub,RT idle
    class Out,Log,LS,Env,Remote ok
    class Gate,Set,Hist,VB human
    classDef live fill:#667eea,stroke:#4c51bf,color:#ffffff
    classDef machine fill:#f0f4ff,stroke:#8b9cf4,color:#1b1533
    classDef human fill:#fff4e6,stroke:#e0a458,color:#3a2a00
    classDef gate fill:#ffe6e6,stroke:#e08080,color:#4a1010
    classDef ok fill:#e6ffe6,stroke:#6fbf73,color:#0f3a12
    classDef idle fill:#f5f5f5,stroke:#b8b8b8,color:#444444
```

**Reading it.** The three indigo boxes are the three jobs: chat, agents, and the screens around them. Follow the thick arrow out of the runtime: an agent writes one file, its own outbox, and nothing else. The dotted arrows after it are the part that is a separate step you start, and the final one has never run against this repository. Everything the app remembers sits in the green stores at the bottom, and none of them is a database.

## Six requests, traced

### 1. A chat message

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
sequenceDiagram
    accTitle: 1. A chat message
    accDescr {
        You send a message. The model bar creates the session if there is none,
        sends the whole conversation through the router, and the router calls the
        provider in its own request shape. The reply and its token usage are stored
        on the session and shown.
    }
    participant U as You
    participant MP as Models and Chat
    participant R as llm-router
    participant P as Provider
    U->>MP: type, attach, send
    MP->>MP: create the session if there is none
    MP->>R: callLLM(config, whole conversation)
    R->>P: request in that provider's shape
    P-->>R: reply or error body
    R-->>MP: success, content, usage
    MP-->>U: reply, tokens, stored on the session
```

**Reading it.** Detail: [Two attachment paths](./ARCHITECTURE.md#two-attachment-paths), [What happens when you press send](./ARCHITECTURE.md#what-happens-when-you-press-send), [How the router picks an implementation](./ARCHITECTURE.md#7-provider-catalog).
### 2. A Run click

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
sequenceDiagram
    accTitle: 2. A Run click
    accDescr {
        Agent Control invokes the async run_agent command. Rust checks the runtime
        name against a three-item allowlist, then runs the shell script. The script
        picks a host CLI on a subscription login or a paid container, runs it with a
        timeout, and appends the redacted answer to the agent's own outbox. The card
        then re-reads its status from disk.
    }
    participant AC as Agent Control
    participant RS as Rust run_agent
    participant SH as run_agent.sh
    participant RT as CLI or container
    participant OB as AGENT_OUTBOX
    AC->>RS: invoke run_agent(name, runtime)
    RS->>RS: runtime on the allowlist?
    RS->>SH: bash run_agent.sh runtime
    SH->>RT: subscription CLI, else paid container
    RT-->>SH: answer, within 900 s
    SH->>OB: append the redacted, flattened entry
    SH-->>RS: exit and text
    RS-->>AC: result
    AC->>RS: agent_status
    RS-->>AC: last run and status from the outbox
```

**Reading it.** Detail: [What happens on one Run click](./ARCHITECTURE.md#511-agent-runtime-agents-scriptsrun_agentsh), [Why a Run click does not freeze the window](./ARCHITECTURE.md#why-a-run-click-does-not-freeze-the-window), [How an answer becomes an outbox entry](./ARCHITECTURE.md#how-an-answer-becomes-an-outbox-entry).
### 3. Signing in

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
sequenceDiagram
    accTitle: 3. Signing in
    accDescr {
        The profile module invokes the Rust sign-in command. Rust opens the system
        browser at the provider's consent page, receives one redirect on a loopback
        port, checks the state, exchanges the code, reads identity, discards the
        token and returns four fields. The profile records them.
    }
    participant PF as profiles.ts
    participant RS as Rust command
    participant B as Browser
    participant P as Google or GitHub
    PF->>RS: invoke sign-in
    RS->>B: open consent page (PKCE + state)
    B->>P: you approve
    P-->>B: redirect to 127.0.0.1 loopback
    B->>RS: one callback, state checked
    RS->>P: exchange the code
    P-->>RS: id_token or access_token
    RS->>RS: read identity, discard the token
    RS-->>PF: name, email, avatar, verified
    PF->>PF: store on the profile
```

**Reading it.** Detail: [The OAuth loopback flow](./CONTRIBUTING.md#the-oauth-loopback-flow-step-by-step), [The sign-in gate as a state machine](./ARCHITECTURE.md#the-sign-in-gate-as-a-state-machine).
### 4. Opening a vault file

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
sequenceDiagram
    accTitle: 4. Opening a vault file
    accDescr {
        The Vault Browser lists the vault and its git status through one command.
        Clicking a file sends its path to a second command, which canonicalizes the
        path and refuses it unless it is inside the vault, a regular file, under two
        megabytes and text.
    }
    participant VB as Vault Browser
    participant RS as Rust
    participant FS as vault/
    VB->>RS: vault_status
    RS->>FS: list files, git status --short
    RS-->>VB: files and status
    VB->>RS: vault_file(path)
    RS->>RS: canonicalize, then four refusals
    RS->>FS: read the file
    RS-->>VB: text, or a named refusal
```

**Reading it.** Detail: [Reading the vault, and what the guard refuses](./ARCHITECTURE.md#reading-the-vault-and-what-the-guard-refuses).
### 5. Folding answers into the log

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
sequenceDiagram
    accTitle: 5. Folding answers into the log
    accDescr {
        You start the relay container. Each cycle it optionally pulls, folds every
        non-empty outbox into the shared log and empties it, commits only the vault
        directory, and pushes only when a remote is configured.
    }
    participant U as You
    participant RL as vault-relay
    participant OB as AGENT_OUTBOX files
    participant SY as AGENT_SYNC.md
    participant G as Your git remote
    U->>RL: valhallaai relay
    loop every 300 s
        RL->>G: git pull --ff-only (only if VAULT_REPO is set)
        RL->>OB: read each non-empty outbox
        RL->>SY: append under a --- separator
        RL->>OB: empty the outbox
        RL->>RL: git add vault/ and git commit
        RL->>G: git push (only if VAULT_REPO is set)
    end
```

**Reading it.** Detail: [One relay cycle](./ARCHITECTURE.md#one-relay-cycle), [Who reads and who writes each vault file](./ARCHITECTURE.md#who-reads-and-who-writes-each-vault-file). The push has never run against this repository.
### 6. Adding a custom provider

```mermaid
%%{init: {'fontFamily':'Arial, Helvetica, sans-serif','theme':'base','themeVariables':{'primaryColor':'#efe9ff','primaryTextColor':'#1b1533','primaryBorderColor':'#8b6cef','lineColor':'#6b5bd6','secondaryColor':'#e4eaff','tertiaryColor':'#f7f5ff','edgeLabelBackground':'#ffffff','fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px','noteBkgColor':'#fff6dc','noteTextColor':'#3a2f00','actorBkg':'#efe9ff','actorBorder':'#8b6cef','actorTextColor':'#1b1533','signalColor':'#4a3fb0','signalTextColor':'#1b1533','xyChart':{'backgroundColor':'#ffffff','plotColorPalette':'#8b6cef','titleColor':'#1b1533','xAxisLabelColor':'#1b1533','yAxisLabelColor':'#1b1533','xAxisTitleColor':'#1b1533','yAxisTitleColor':'#1b1533','xAxisLineColor':'#6b5bd6','yAxisLineColor':'#6b5bd6','xAxisTickColor':'#6b5bd6','yAxisTickColor':'#6b5bd6'}}}}%%
sequenceDiagram
    accTitle: 6. Adding a custom provider
    accDescr {
        You fill in the Custom Providers form in Settings. The form is validated and
        given a namespaced id, saved to local storage and registered with the
        router. The next message that names that id is routed to your endpoint
        through the shared OpenAI-compatible function.
    }
    participant U as You
    participant ST as Settings
    participant CP as custom-providers.ts
    participant R as llm-router
    participant EP as Your endpoint
    U->>ST: name, URL, model ids
    ST->>CP: buildCustomProvider()
    CP-->>ST: provider with id custom:slug, or an error
    ST->>CP: save to localStorage and register
    U->>R: send with custom:slug
    R->>R: default branch finds the endpoint
    R->>EP: OpenAI-style request
    EP-->>R: choices[0].message.content
```

**Reading it.** Detail: [From a Settings form to a routable provider](./ARCHITECTURE.md#from-a-settings-form-to-a-routable-provider), [Which provider path to take](./CONTRIBUTING.md#adding-a-new-llm-provider).

## Index of every diagram

### README.md (8)

| Diagram | Type | Section |
|---|---|---|
| [Which download is for you?](./README.md#which-download-is-for-you) | flowchart | Which download is for you? |
| [ValhallaAI at a glance](./README.md#what-it-does) | flowchart | What it does |
| [What happens on first launch](./README.md#what-happens-on-first-launch) | flowchart | What happens on first launch |
| [How `valhallaai` decides what to launch](./README.md#how-valhallaai-decides-what-to-launch) | flowchart | How `valhallaai` decides what to launch |
| [The three ways through the gate](./README.md#the-three-ways-through-the-gate) | flowchart | The three ways through the gate |
| [Where one agent answer goes](./README.md#where-one-agent-answer-goes) | state | Where one agent answer goes |
| [Picking a provider](./README.md#picking-a-provider) | flowchart | Picking a provider |
| [A first triage for run problems](./README.md#a-first-triage-for-run-problems) | flowchart | A first triage for run problems |

### ARCHITECTURE.md (35)

| Diagram | Type | Section |
|---|---|---|
| [ValhallaAI system map](./ARCHITECTURE.md#3-system-map) | flowchart | 3. System map |
| [3.1 Runtime topology](./ARCHITECTURE.md#31-runtime-topology) | flowchart | 3.1 Runtime topology |
| [3.2 The ten Tauri commands](./ARCHITECTURE.md#32-the-ten-tauri-commands) | flowchart | 3.2 The ten Tauri commands |
| [4.2 Build and release paths](./ARCHITECTURE.md#42-build-and-release-paths) | flowchart | 4.2 Build and release paths |
| [5.0 How the source is layered](./ARCHITECTURE.md#50-how-the-source-is-layered) | flowchart | 5.0 How the source is layered |
| [Where an API key comes from](./ARCHITECTURE.md#where-an-api-key-comes-from) | flowchart | Where an API key comes from |
| [What a sign-in keeps and what it throws away](./ARCHITECTURE.md#what-a-sign-in-keeps-and-what-it-throws-away) | flowchart | What a sign-in keeps and what it throws away |
| [The sign-in gate as a state machine](./ARCHITECTURE.md#the-sign-in-gate-as-a-state-machine) | state | The sign-in gate as a state machine |
| [From a Settings form to a routable provider](./ARCHITECTURE.md#from-a-settings-form-to-a-routable-provider) | flowchart | From a Settings form to a routable provider |
| [Two attachment paths](./ARCHITECTURE.md#two-attachment-paths) | flowchart | Two attachment paths |
| [What happens when you press send](./ARCHITECTURE.md#what-happens-when-you-press-send) | sequence | What happens when you press send |
| [One flat list, three filtered views](./ARCHITECTURE.md#one-flat-list-three-filtered-views) | flowchart | One flat list, three filtered views |
| [The life of an agent card](./ARCHITECTURE.md#the-life-of-an-agent-card) | state | The life of an agent card |
| [A custom agent is a name bound to a runtime](./ARCHITECTURE.md#a-custom-agent-is-a-name-bound-to-a-runtime) | flowchart | A custom agent is a name bound to a runtime |
| [How a task becomes a prompt](./ARCHITECTURE.md#how-a-task-becomes-a-prompt) | flowchart | How a task becomes a prompt |
| [What happens on one Run click](./ARCHITECTURE.md#511-agent-runtime-agents-scriptsrun_agentsh) | flowchart | 5.11 Agent Runtime (`agents/*`, `scripts/run_agent.sh`) |
| [How an answer becomes an outbox entry](./ARCHITECTURE.md#how-an-answer-becomes-an-outbox-entry) | flowchart | How an answer becomes an outbox entry |
| [Reading the vault, and what the guard refuses](./ARCHITECTURE.md#reading-the-vault-and-what-the-guard-refuses) | flowchart | Reading the vault, and what the guard refuses |
| [The shell, screen by screen](./ARCHITECTURE.md#the-shell-screen-by-screen) | flowchart | The shell, screen by screen |
| [One chat message, drop path](./ARCHITECTURE.md#61-sending-a-chat-message) | sequence | 6.1 Sending a chat message |
| [How a failed response becomes a readable error](./ARCHITECTURE.md#61-sending-a-chat-message) | flowchart | 6.1 Sending a chat message |
| [Why a Run click does not freeze the window](./ARCHITECTURE.md#why-a-run-click-does-not-freeze-the-window) | sequence | Why a Run click does not freeze the window |
| [How the router picks an implementation](./ARCHITECTURE.md#7-provider-catalog) | flowchart | 7. Provider catalog |
| [How each provider authenticates and bills](./ARCHITECTURE.md#how-each-provider-authenticates-and-bills) | flowchart | How each provider authenticates and bills |
| [The Nous Portal path](./ARCHITECTURE.md#the-nous-portal-path) | sequence | The Nous Portal path |
| [Chat on the subscription default, end to end](./ARCHITECTURE.md#chat-on-the-subscription-default-end-to-end) | flowchart | Chat on the subscription default, end to end |
| [Why an agent run took three minutes](./ARCHITECTURE.md#81-where-the-time-went) | flowchart | 8.1 Where the time went |
| [The measured ladder](./ARCHITECTURE.md#the-measured-ladder) | bar chart | The measured ladder |
| [Who reads and who writes each vault file](./ARCHITECTURE.md#who-reads-and-who-writes-each-vault-file) | flowchart | Who reads and who writes each vault file |
| [Agent run to coordination log, with the relay step](./ARCHITECTURE.md#92-the-full-agent-and-vault-picture) | sequence | 9.2 The full agent-and-vault picture |
| [One relay cycle](./ARCHITECTURE.md#one-relay-cycle) | flowchart | One relay cycle |
| [Trust boundaries and guards](./ARCHITECTURE.md#10-security-model) | flowchart | 10. Security model |
| [10.1 Where a credential travels](./ARCHITECTURE.md#101-where-a-credential-travels) | flowchart | 10.1 Where a credential travels |
| [The four deployment stages](./ARCHITECTURE.md#11-deployment-path-future) | flowchart | 11. Deployment path (future) |
| [Platform dependency order](./ARCHITECTURE.md#111-platform-roadmap-beyond-macoswindowslinux-desktop) | flowchart | 11.1 Platform roadmap (beyond macOS/Windows/Linux desktop) |

### CONTRIBUTING.md (9)

| Diagram | Type | Section |
|---|---|---|
| [Which provider path to take](./CONTRIBUTING.md#adding-a-new-llm-provider) | flowchart | Adding a new LLM provider |
| [What CI does on every push](./CONTRIBUTING.md#what-ci-does-on-every-push) | flowchart | What CI does on every push |
| [The GUI PATH trap, in one picture](./CONTRIBUTING.md#the-gui-path-trap-in-one-picture) | flowchart | The GUI PATH trap, in one picture |
| [How one localStorage key becomes per-profile](./CONTRIBUTING.md#profiles-and-per-profile-storage) | flowchart | Profiles and per-profile storage |
| [The OAuth loopback flow, step by step](./CONTRIBUTING.md#the-oauth-loopback-flow-step-by-step) | sequence | The OAuth loopback flow, step by step |
| [How the app finds the checkout](./CONTRIBUTING.md#how-the-app-finds-the-checkout) | flowchart | How the app finds the checkout |
| [The Docker services and what they mount](./CONTRIBUTING.md#the-docker-services-and-what-they-mount) | flowchart | The Docker services and what they mount |
| [Checking a model id against reality](./CONTRIBUTING.md#checking-a-model-id-against-reality) | flowchart | Checking a model id against reality |
| [The three checks, and what each one actually covers](./CONTRIBUTING.md#before-claiming-something-works) | flowchart | Before claiming something works |

### POSITIONING.md (3)

| Diagram | Type | Section |
|---|---|---|
| [How fresh each claim in this document is](./POSITIONING.md#why-valhallaai-positioning-differentiation) | flowchart | Why ValhallaAI — Positioning & Differentiation |
| [Where each tool sits](./POSITIONING.md#21-two-honest-limits-inside-valhallaais-own-checkmarks) | quadrant chart | 2.1 Two honest limits inside ValhallaAI's own checkmarks |
| [Does ValhallaAI fit you](./POSITIONING.md#4-who-this-is-for-and-who-should-not-use-it) | flowchart | 4. Who this is for — and who should not use it |

