#!/usr/bin/env node
/**
 * Claude Agent for ValhallaAI
 * Reads config from vault, processes tasks, writes results to AGENT_OUTBOX.md
 */

const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

const VAULT_PATH = process.env.VAULT_PATH || "/vault";
const AGENT_NAME = process.env.AGENT_NAME || "claude-agent";
const OUTBOX_FILE = path.join(VAULT_PATH, `AGENT_OUTBOX_${AGENT_NAME}.md`);

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

  try {
    // Example: simple echo task
    const prompt =
      "You are an agent running in ValhallaAI. Report your status and capabilities.";

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

    const result = response.content[0].text;
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
  }
}

// Run once, then exit (can be wrapped in a scheduler later)
runAgent().then(() => {
  console.log(`[${AGENT_NAME}] Done`);
  process.exit(0);
});
