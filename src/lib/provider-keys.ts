import { invoke } from "@tauri-apps/api/tauri";
import type { LLMProvider } from "./llm-router";
import { getActiveProfile } from "./profiles";

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
    cache = next;
  } catch {
    cache = {};
  }
  loaded = true;
}

export function envKeyFor(provider: LLMProvider): string {
  // A profile with ignoreEnvKeys set behaves as if .env were empty, so it
  // falls through to its own pasted keys. .env itself is machine-level and
  // stays shared -- scripts/run_agent.sh and docker-compose read the same
  // file with no notion of an active profile, so it cannot be per-profile
  // without breaking the agents. See the header of profiles.ts.
  if (getActiveProfile()?.ignoreEnvKeys) return "";
  return cache[provider] ?? "";
}

/** True when .env supplied this key AND the active profile accepts it --
 * i.e. when the Settings badge should say the key came from the file. */
export function hasEnvKey(provider: LLMProvider): boolean {
  return envKeyFor(provider) !== "";
}

/** A key in .env wins over one saved in the browser, so a rotated file is
 * what the next chat uses. */
export function resolveApiKey(provider: LLMProvider, stored: string): string {
  return envKeyFor(provider) || stored;
}
