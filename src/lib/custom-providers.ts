/**
 * User-defined providers.
 *
 * The built-in catalog in providers.ts is a closed list — adding a provider
 * used to mean editing that file, the router's union type, and
 * callLLM()'s switch. For an open-source install that is a real barrier:
 * a self-hoster running LiteLLM, vLLM, llama.cpp's server, LM Studio, or a
 * company gateway speaks the OpenAI dialect perfectly well and should not
 * have to fork the app to select it.
 *
 * So a custom provider is DATA, not code: a name, a chat-completions
 * endpoint, and a model list. The router already has one implementation
 * that speaks that dialect for the seven built-in providers that use it
 * (`callOpenAICompatible`), so a custom provider is routed through exactly
 * the same helper rather than a second code path that could drift from it.
 *
 * Deliberate limits, and why:
 *
 * - **OpenAI dialect only.** That single helper is what makes this safe to
 *   expose as a text field. Anything with a genuinely different
 *   request/response shape (Anthropic Messages, Gemini generateContent,
 *   MiniMax) needs a real implementation and stays a source change.
 * - **No arbitrary code, no headers editor.** The one header set is the
 *   bearer token, same as the built-ins.
 * - **The id is namespaced `custom:`** so a user-defined provider can never
 *   shadow or be mistaken for a built-in one. A saved preference naming a
 *   removed provider already has to be tolerated (see Settings.svelte's
 *   load path); this makes that failure mode impossible to create.
 *
 * Storage: the provider DEFINITION (name, endpoint, models) is app-level,
 * like the Ollama endpoint. The API KEY is not stored here — it goes
 * through the same per-profile scoped key as every built-in provider
 * (`valhallaai-apikey-<id>` via scopedKey in profiles.ts), so a profile's
 * keys stay its own.
 */

import { registerCustomProviders } from "./llm-router";

export interface CustomProvider {
  /** Always `custom:<slug>`. */
  id: string;
  /** Display name, as typed by the user. */
  name: string;
  /** Full URL of the chat-completions endpoint, e.g.
   *  `https://api.example.com/v1/chat/completions`. */
  endpoint: string;
  /** Model ids to offer in the picker, in the order the user typed them. */
  models: string[];
}

const STORAGE_KEY = "valhallaai-custom-providers";

export const CUSTOM_ID_PREFIX = "custom:";

export function isCustomProviderId(id: string): boolean {
  return id.startsWith(CUSTOM_ID_PREFIX);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Reject anything malformed rather than storing it and failing at send
 *  time — a bad entry here is a broken send for whoever imports it, and
 *  localStorage survives upgrades. */
function coerce(value: unknown): CustomProvider | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CustomProvider>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const endpoint = typeof raw.endpoint === "string" ? raw.endpoint.trim() : "";
  const models = Array.isArray(raw.models)
    ? raw.models.filter((m): m is string => typeof m === "string" && m.trim() !== "").map((m) => m.trim())
    : [];

  if (!isCustomProviderId(id) || !name || !isHttpUrl(endpoint) || models.length === 0) return null;
  // De-duplicate while keeping the user's order — the first entry is what
  // the picker selects by default when the provider changes.
  return { id, name, endpoint, models: [...new Set(models)] };
}

export function loadCustomProviders(): CustomProvider[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Ids are already namespaced and unique by construction; de-dupe anyway
    // so a hand-edited localStorage entry can't produce two pickers'
    // worth of the same provider.
    const seen = new Set<string>();
    const out: CustomProvider[] = [];
    for (const item of parsed) {
      const provider = coerce(item);
      if (provider && !seen.has(provider.id)) {
        seen.add(provider.id);
        out.push(provider);
      }
    }
    return out;
  } catch {
    // Unparseable storage degrades to "no custom providers" instead of
    // taking the Settings page down with it.
    return [];
  }
}

export function saveCustomProviders(list: CustomProvider[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  // Keep the router's view in step with storage. Called on every mutation
  // so a provider is routable the moment it is saved, without a reload.
  registerCustomProviders(list);
}

/** Called once at app start so a stored provider is routable before the
 *  user opens Settings — otherwise the first send after a restart fails
 *  with "Unknown provider" while the UI happily shows it in the picker. */
export function initCustomProviders(): CustomProvider[] {
  const list = loadCustomProviders();
  registerCustomProviders(list);
  return list;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "provider";
}

/** Build an id that cannot collide with another custom provider. */
export function customProviderId(name: string, existing: CustomProvider[]): string {
  const base = `${CUSTOM_ID_PREFIX}${slugify(name)}`;
  if (!existing.some((p) => p.id === base)) return base;
  let n = 2;
  while (existing.some((p) => p.id === `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export interface CustomProviderInput {
  name: string;
  endpoint: string;
  /** One model id per line, as typed into the Settings textarea. */
  models: string;
}

export interface CustomProviderDraft {
  provider?: CustomProvider;
  error?: string;
}

/** Validate a form submission. Returns the provider to save, or the reason
 *  it can't be saved — the caller shows the reason rather than silently
 *  doing nothing. */
export function buildCustomProvider(
  input: CustomProviderInput,
  existing: CustomProvider[]
): CustomProviderDraft {
  const name = input.name.trim();
  const endpoint = input.endpoint.trim();
  const models = [
    ...new Set(
      input.models
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    ),
  ];

  if (!name) return { error: "Give the provider a name." };
  if (!isHttpUrl(endpoint)) {
    return { error: "Endpoint must be a full http:// or https:// URL." };
  }
  if (models.length === 0) return { error: "Add at least one model id." };

  return {
    provider: {
      id: customProviderId(name, existing),
      name,
      endpoint,
      models,
    },
  };
}

export function addCustomProvider(provider: CustomProvider, existing: CustomProvider[]): CustomProvider[] {
  const next = [...existing, provider];
  saveCustomProviders(next);
  return next;
}

export function removeCustomProvider(id: string, existing: CustomProvider[]): CustomProvider[] {
  const next = existing.filter((p) => p.id !== id);
  saveCustomProviders(next);
  return next;
}

/** Custom providers in the same id/name/models shape the built-in catalog
 *  uses, so a caller can merge the two lists. */
export function customProvider(id: string): CustomProvider | undefined {
  return loadCustomProviders().find((p) => p.id === id);
}
