#!/usr/bin/env node
/**
 * Grok (xAI) Agent for ValhallaAI
 * Reads config from vault, processes a task, writes results to its own
 * outbox — same pattern as agents/claude/agent.js.
 *
 * Was referenced by this Dockerfile's `COPY agent.js ./` but never
 * created, so `docker-compose build grok-agent` failed outright. Found by
 * a 2026-09-21 verification pass (mitigated in practice by grok-agent
 * being `enabled: false` in agents-config.json, so it was never actually
 * built in normal use — but the build failure was real).
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const { buildPrompt } = require("./task.cjs");

const VAULT_PATH = process.env.VAULT_PATH || "/vault";
const AGENT_NAME = process.env.AGENT_NAME || "grok-build";
const OUTBOX_FILE = path.join(VAULT_PATH, `AGENT_OUTBOX_${AGENT_NAME}.md`);
const XAI_API_KEY = process.env.XAI_API_KEY;

function readConfig() {
  try {
    const configPath = path.join(VAULT_PATH, "agents-config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return config.agents.find((a) => a.name === AGENT_NAME);
  } catch (error) {
    console.error("Failed to read config:", error);
    return null;
  }
}

function appendOutbox(message) {
  try {
    fs.appendFileSync(OUTBOX_FILE, message + "\n");
  } catch (error) {
    console.error("Failed to append to outbox:", error);
  }
}

function callGrok(model, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    });

    const req = https.request(
      {
        hostname: "api.x.ai",
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Authorization": `Bearer ${XAI_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.choices?.[0]?.message?.content || "");
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function runAgent() {
  console.log(`[${AGENT_NAME}] Starting...`);

  const config = readConfig();
  if (!config || !config.enabled) {
    const message = "grok-build is disabled in vault/agents-config.json, and XAI_API_KEY is not set. Enable it and add the key before running.";
    console.error(`[${AGENT_NAME}] ${message}`);
    appendOutbox(`## [${new Date().toISOString()}] ${AGENT_NAME}\n- Status: ERROR\n- Error: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  if (!XAI_API_KEY) {
    const msg = `[${AGENT_NAME}] XAI_API_KEY not set — set it in .env`;
    console.error(msg);
    appendOutbox(`## [${new Date().toISOString()}] ${AGENT_NAME}\n- Status: ERROR\n- Error: XAI_API_KEY not set\n`);
    process.exitCode = 1;
    return;
  }

  try {
    // See the claude agent: task from vault/agent-tasks.json, status ping as
    // the fallback so this stays a usable connectivity check.
    const task = buildPrompt(VAULT_PATH, AGENT_NAME);
    const prompt =
      task || "You are an agent running in ValhallaAI. Report your status and capabilities.";
    console.log(`[${AGENT_NAME}] ${task ? "running task from agent-tasks.json" : "no task defined, sending status ping"}`);
    const result = await callGrok(config.config.model, prompt);

    console.log(`[${AGENT_NAME}] Response:`, result);

    const timestamp = new Date().toISOString();
    appendOutbox(`## [${timestamp}] ${AGENT_NAME}\n- Status: OK\n- Response: ${result}\n`);
    console.log(`[${AGENT_NAME}] Outbox updated: ${OUTBOX_FILE}`);
  } catch (error) {
    console.error(`[${AGENT_NAME}] Error:`, error);
    appendOutbox(`## [${new Date().toISOString()}] ${AGENT_NAME}\n- Status: ERROR\n- Error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

runAgent().then(() => {
  console.log(`[${AGENT_NAME}] Done`);
});
