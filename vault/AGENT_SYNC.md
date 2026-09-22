# AGENT_SYNC.md

Shared coordination log for Vahalla agents. Synced to a **private** GitHub repo (`jacobcowanr/Vahalla`) so any agent — including Hermes — can pull full context. Private, not public: see [CONTRIBUTING.md](../CONTRIBUTING.md#why-local-first) for the gate before this ever goes public.

## Protocol

- **Append-only:** never delete, only append
- **Dated entries:** `[YYYY-MM-DD HH:MM] <Agent Name>`
- **Format:** Did / Files / Decisions / TO (next agent)
- **No secrets:** never commit API keys, credentials, or IPs
- **Local first:** this is Jacob's private coordination log

## Log

---
## [2026-09-21 20:17] Project Init
- Did: Created Vahalla project folder at ~/Projects/Vahalla. Initialized git repo (local only, no remote yet). Set up folder structure: src-tauri/, src/, agents/, vault/. Created .gitignore and README.
- Files: .gitignore, README.md, folder structure
- Decisions: Build locally first, iterate privately. OpenRouter as primary LLM endpoint. Start with model picker MVP.
- TO: none
---
## [2026-09-21 21:45] Claude Code
- Did: Pushed the project to a **private** GitHub repo (jacobcowanr/Vahalla) so any agent — including Hermes — can pull the full history and pick up where this session left off. Scanned entire git history for API keys/tokens/private-key material before pushing (clean, zero matches); confirmed .env was never tracked (only env.example, all placeholder values). Project so far: Tauri + Svelte desktop app, 17-provider LLM router (src/lib/llm-router.ts), Docker-based agent runtimes (Claude/Hermes/Grok) coordinating via this vault, full documentation set (ARCHITECTURE.md with diagrams, POSITIONING.md differentiation, CONTRIBUTING.md conventions). Cross-platform constraint established: macOS + Windows + Linux/Omarchy, with a platform roadmap for headless mode, ARM64, and mobile (ARCHITECTURE.md §9.1).
- Files: this file (protocol line updated — no longer "local-only"); repo-wide (first push)
- Decisions: PRIVATE repo, not public — per CONTRIBUTING.md's local-first policy, the gate to going public hasn't been met yet (needs real multi-agent vault usage, a cloud deploy that's actually run, UX friction found through real use). A private repo is compatible with that policy; it's about continuity/backup and letting Hermes read full context, not an early public release.
- TO: Hermes: If you pick this up — read README.md first (links to the other three docs), then ARCHITECTURE.md in full before touching anything. The vault pattern here (AGENT_SYNC.md + outbox-per-agent) is the same one already proven on the Obsidian vault; this is a separate, standalone repo/vault for the Vahalla project specifically, not the same file. Known open issues (Windows/Linux paths untested end-to-end, tauri.conf.json placeholder identifier, provider-list duplication between Settings.svelte/ModelPicker.svelte) are tracked in CONTRIBUTING.md.
