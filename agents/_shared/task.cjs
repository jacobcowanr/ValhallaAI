/**
 * Shared task loading for the container agents.
 *
 * Named .cjs on purpose: the root package.json sets "type": "module", so a .js
 * file here is parsed as ESM and require() throws. .cjs is always CommonJS,
 * which both the containers and the host runner need.
 *
 * Lives in agents/_shared/ and is copied in by both Dockerfiles, whose build
 * context is ./agents rather than ./agents/<name> so they can reach it. The
 * alternative was duplicating this in claude/agent.js and grok/agent.js, which
 * is how the provider catalog rotted before it was extracted to providers.ts.
 *
 * A task is defined in vault/agent-tasks.json, NOT agents-config.json. That
 * file says how an agent runs (model, provider, enabled); this one says what it
 * should do. They change on different schedules and are edited by different
 * people.
 */

const fs = require("fs");
const path = require("path");

/** Read this agent's task, or null when none is defined. */
function loadTask(vaultPath, agentName) {
  try {
    const raw = fs.readFileSync(path.join(vaultPath, "agent-tasks.json"), "utf-8");
    const task = (JSON.parse(raw).tasks || {})[agentName];
    if (!task || !task.instruction) return null;
    return task;
  } catch {
    // No task file, or malformed. Callers fall back to the status ping, which
    // keeps this page usable as a connectivity check.
    return null;
  }
}

/**
 * Read the vault files a task asked for.
 *
 * Paths come from a config file rather than a user prompt, but they are still
 * resolved and checked against the vault root. claude-agent and grok-agent run
 * in containers with only /vault mounted, so the blast radius there is small --
 * but hermes-agent runs on the HOST, where "../.env" would be a real read of a
 * real secret. Guarding here keeps the rule in one place instead of depending
 * on which runtime happens to execute it.
 */
function loadContext(vaultPath, files, maxChars) {
  const vaultReal = fs.realpathSync(vaultPath);
  const budget = Number.isFinite(maxChars) ? maxChars : 12000;
  const blocks = [];
  let used = 0;

  for (const rel of files || []) {
    let real;
    try {
      real = fs.realpathSync(path.resolve(vaultReal, rel));
    } catch {
      blocks.push(`<file path="${rel}" error="not found" />`);
      continue;
    }
    if (real !== vaultReal && !real.startsWith(vaultReal + path.sep)) {
      blocks.push(`<file path="${rel}" error="outside the vault, refused" />`);
      continue;
    }
    let text;
    try {
      text = fs.readFileSync(real, "utf-8");
    } catch {
      blocks.push(`<file path="${rel}" error="unreadable" />`);
      continue;
    }
    // Keep the TAIL of a long file: these are append-only logs, so the recent
    // end is the part worth reading.
    const room = budget - used;
    if (room <= 0) {
      blocks.push(`<file path="${rel}" error="context budget exhausted" />`);
      continue;
    }
    let body = text;
    let note = "";
    if (body.length > room) {
      body = body.slice(-room);
      note = ` truncated="kept last ${room} chars"`;
    }
    used += body.length;
    blocks.push(`<file path="${rel}"${note}>\n${body}\n</file>`);
  }
  return blocks.join("\n\n");
}

/** Build the full prompt for a task, or null if there is no task. */
function buildPrompt(vaultPath, agentName) {
  const task = loadTask(vaultPath, agentName);
  if (!task) return null;
  const context = loadContext(vaultPath, task.context, task.maxContextChars);
  return context
    ? `${task.instruction}\n\nContext from the vault:\n\n${context}`
    : task.instruction;
}

module.exports = { loadTask, loadContext, buildPrompt };

// Also usable as a CLI, so the host-side hermes runner in scripts/run_agent.sh
// builds its prompt through the same guard as the containers instead of
// reimplementing path checks in bash.
if (require.main === module) {
  const [, , vaultPath, agentName] = process.argv;
  const prompt = buildPrompt(vaultPath, agentName);
  if (prompt) process.stdout.write(prompt);
}
