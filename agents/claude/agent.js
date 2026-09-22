#!/usr/bin/env node
/**
 * Claude Agent for ValhallaAI
 * Reads config from vault, processes tasks, writes results to AGENT_OUTBOX.md
 */

const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");
const { buildPrompt } = require("./task.cjs");

const VAULT_PATH = process.env.VAULT_PATH || "/vault";
const AGENT_NAME = process.env.AGENT_NAME || "claude-agent";
const OUTBOX_FILE = path.join(VAULT_PATH, `AGENT_OUTBOX_${AGENT_NAME}.md`);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function readConfig() {
  try {
    const configPath = path.join(VAULT_PATH, "agents-config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return config.agents.find((a) => a.name === AGENT_NAME);
  } catch (error) {
    console.error("Failed to read config:", error);
    return null;
  }
}

async function appendOutbox(message) {
  try {
    fs.appendFileSync(OUTBOX_FILE, message + "\n");
  } catch (error) {
    console.error("Failed to append to outbox:", error);
  }
}

async function runAgent() {
  console.log(`[${AGENT_NAME}] Starting...`);

  const config = await readConfig();
  if (!config || !config.enabled) {
    console.log(`[${AGENT_NAME}] Disabled or not found in config`);
    return;
  }

  console.log(`[${AGENT_NAME}] Config loaded: ${config.config.model}`);

  if (!ANTHROPIC_API_KEY) {
    const message = "ANTHROPIC_API_KEY is not set. Add it to .env and run this agent again.";
    console.error(`[${AGENT_NAME}] ${message}`);
    await appendOutbox(
      `## [${new Date().toISOString()}] ${AGENT_NAME}\n- Status: ERROR\n- Error: ${message}\n`
    );
    process.exitCode = 1;
    return;
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  try {
    // The task comes from vault/agent-tasks.json, so changing what this agent
    // does is a config edit rather than a rebuild. With no task defined it
    // falls back to the old self-description ping, which keeps Agent Control
    // usable as a plain connectivity check.
    const task = buildPrompt(VAULT_PATH, AGENT_NAME);
    const prompt =
      task || "You are an agent running in ValhallaAI. Report your status and capabilities.";
    console.log(`[${AGENT_NAME}] ${task ? "running task from agent-tasks.json" : "no task defined, sending status ping"}`);

    const response = await client.messages.create({
      model: config.config.model,
      max_tokens: config.config.max_tokens || 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const blocks = Array.isArray(response.content) ? response.content : [];
    const result = blocks
      .map((block) => (block && typeof block.text === "string" ? block.text : ""))
      .filter(Boolean)
      .join("\n");
    if (!result) {
      const types = blocks.map((block) => block && block.type).filter(Boolean).join(", ") || "none";
      throw new Error(`Anthropic returned no text blocks (got: ${types})`);
    }
    console.log(`[${AGENT_NAME}] Response:`, result);

    // Write to outbox
    const timestamp = new Date().toISOString();
    await appendOutbox(
      `## [${timestamp}] ${AGENT_NAME}\n- Status: OK\n- Response: ${result}\n`
    );

    console.log(`[${AGENT_NAME}] Outbox updated: ${OUTBOX_FILE}`);
  } catch (error) {
    console.error(`[${AGENT_NAME}] Error:`, error);
    await appendOutbox(`## [${new Date().toISOString()}] ${AGENT_NAME}\n- Status: ERROR\n- Error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

// Run once, then exit. Errors must not exit 0 — a success code used to
// hide a failed API call.
runAgent().then(() => {
  console.log(`[${AGENT_NAME}] Done`);
  process.exit(process.exitCode || 0);
});
