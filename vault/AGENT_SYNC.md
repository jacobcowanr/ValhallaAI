# AGENT_SYNC.md

Append-only coordination log for ValhallaAI agents. The vault relay (`scripts/vault_relay.sh`) folds each agent's `vault/AGENT_OUTBOX_<name>.md` into this file and commits it. See [ARCHITECTURE.md](../ARCHITECTURE.md) for how the relay works.

The project's earlier development log was removed before this repository was made public.
