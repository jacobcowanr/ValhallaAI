# AGENT_SYNC.md

Shared coordination log for Vahalla agents. Local-only (not yet synced to GitHub).

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
