/**
 * User-defined agents.
 *
 * The three built-in agents (claude-agent, hermes-agent, grok-agent) are
 * the only things the app can run — `run_agent` in main.rs matches the name
 * against that allowlist before it reaches `scripts/run_agent.sh`, so the
 * app cannot shell out to an arbitrary command. That property is worth
 * keeping, which rules out letting a user type a command.
 *
 * What a user CAN add is a display name bound to one of those three
 * runtimes. The name is never passed to the shell: the Rust command takes
 * the runtime separately, re-checks it against the same allowlist, and
 * passes the allowlisted value. A custom agent therefore cannot run
 * anything the three built-in agents cannot already run.
 *
 * The cost of that choice is real and worth stating: a custom agent runs
 * the same prompt and writes the same outbox as the runtime it is bound to.
 * It is a second entry point and a label, not a separate agent with its own
 * behaviour. Behaviour that differs per agent lives in vault/agent-tasks.json
 * and is keyed by the runtime name, which is shared.
 */

export const AGENT_RUNTIMES = ["hermes-agent", "claude-agent", "grok-agent"] as const;
export type AgentRuntime = (typeof AGENT_RUNTIMES)[number];

export interface CustomAgent {
  /** Display name, as typed. Not passed to the shell. */
  name: string;
  /** Which of the three built-in agents this one runs as. */
  runtime: AgentRuntime;
  /** Optional one-line description shown on the card. */
  note: string;
}

const STORAGE_KEY = "valhallaai-custom-agents";

export function isAgentRuntime(value: string): value is AgentRuntime {
  return (AGENT_RUNTIMES as readonly string[]).includes(value);
}

/** What each runtime actually does, so the picker describes the choice
 *  rather than just naming it. */
export const RUNTIME_BLURB: Record<AgentRuntime, string> = {
  "hermes-agent": "Runs the Hermes CLI on this Mac. No API key, no per-token cost.",
  "claude-agent": "One-shot Docker container. Needs ANTHROPIC_API_KEY and bills per token.",
  "grok-agent": "One-shot Docker container. Needs XAI_API_KEY and bills per token.",
};

function coerce(value: unknown): CustomAgent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CustomAgent>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const runtime = typeof raw.runtime === "string" ? raw.runtime : "";
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  // A name that is itself a runtime would be ambiguous in the UI and in the
  // outbox, so it is rejected rather than stored.
  if (!name || isAgentRuntime(name) || !isAgentRuntime(runtime)) return null;
  return { name, runtime, note };
}

export function loadCustomAgents(): CustomAgent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: CustomAgent[] = [];
    for (const item of parsed) {
      const agent = coerce(item);
      if (agent && !seen.has(agent.name)) {
        seen.add(agent.name);
        out.push(agent);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCustomAgents(list: CustomAgent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export interface CustomAgentDraft {
  agent?: CustomAgent;
  error?: string;
}

export function buildCustomAgent(
  input: { name: string; runtime: string; note: string },
  existing: CustomAgent[]
): CustomAgentDraft {
  const name = input.name.trim();
  const note = input.note.trim();

  if (!name) return { error: "Give the agent a name." };
  if (isAgentRuntime(name)) {
    return { error: `"${name}" is a built-in agent. Pick a different name.` };
  }
  if (existing.some((a) => a.name === name)) {
    return { error: `An agent named "${name}" already exists.` };
  }
  if (!isAgentRuntime(input.runtime)) {
    return { error: "Choose which existing agent this one runs as." };
  }
  return { agent: { name, runtime: input.runtime, note } };
}

export function addCustomAgent(agent: CustomAgent, existing: CustomAgent[]): CustomAgent[] {
  const next = [...existing, agent];
  saveCustomAgents(next);
  return next;
}

export function removeCustomAgent(name: string, existing: CustomAgent[]): CustomAgent[] {
  const next = existing.filter((a) => a.name !== name);
  saveCustomAgents(next);
  return next;
}
