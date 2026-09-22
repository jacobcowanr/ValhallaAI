import { invoke } from "@tauri-apps/api/tauri";
import type { LLMProvider } from "./llm-router";

let cache: Partial<Record<LLMProvider, string>> = {};
let loaded = false;

export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/** Read provider keys from the project .env. The desktop command returns
 * only the chat providers, never the rest of the file. */
export async function loadEnvProviderKeys(): Promise<void> {
  if (loaded || !inTauri()) {
    loaded = true;
    return;
  }
  try {
    const raw = await invoke<Record<string, string>>("provider_keys");
    const next: Partial<Record<LLMProvider, string>> = {};
    for (const [id, value] of Object.entries(raw)) {
      if (value) next[id as LLMProvider] = value;
    }
    if (next.anthropic) {
      next.anthropic_oauth = next.anthropic;
      next.claude_directsdk = next.anthropic;
    }
    cache = next;
  } catch {
    cache = {};
  }
  loaded = true;
}

export function envKeyFor(provider: LLMProvider): string {
  return cache[provider] ?? "";
}

/** A key in .env wins over one saved in the browser, so a rotated file is
 * what the next chat uses. */
export function resolveApiKey(provider: LLMProvider, stored: string): string {
  return envKeyFor(provider) || stored;
}
