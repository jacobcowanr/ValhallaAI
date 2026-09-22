/**
 * Local profiles.
 *
 * Everything per-user in this app lives in localStorage. Before profiles,
 * those keys were flat (`valhallaai-sessions`, `valhallaai-prefs`,
 * `valhallaai-apikey-<provider>`), so one machine meant one identity: one
 * chat history, one default model, one set of pasted keys.
 *
 * A profile is a namespace over those keys. Switching profiles swaps which
 * namespace every other module reads from. There is no server and no
 * account — a profile is a folder name, not a login.
 *
 * WHAT IS AND ISN'T SCOPED
 * ------------------------
 * Scoped (per profile): chat sessions, the active session, default
 * provider/model prefs, and API keys pasted into Settings.
 *
 * Global (per machine): the sidebar open/closed flag and the Ollama
 * endpoint. Both describe this computer, not the person using it —
 * Ollama listens on one port regardless of who is signed in.
 *
 * ALSO GLOBAL: `.env`. It is a single file at the project root, and it is
 * read by `scripts/run_agent.sh` and `docker-compose.local.yml` as well as
 * by the app — agents run from a terminal with no app open and no notion
 * of an "active profile", so a per-profile .env would break them. A
 * profile that wants full isolation sets `ignoreEnvKeys`, which makes it
 * use only its own pasted keys and ignore the file entirely.
 */

import { writable, get } from "svelte/store";

export interface Profile {
  id: string;
  name: string;
  /** Populated by Google sign-in. Absent on a local-only profile. */
  email?: string;
  avatarUrl?: string;
  authProvider?: "google" | "github";
  /** When true this profile ignores .env and uses only its own keys. */
  ignoreEnvKeys?: boolean;
  createdAt: number;
}

const PROFILES_KEY = "valhallaai-profiles";
const ACTIVE_PROFILE_KEY = "valhallaai-active-profile";

/** Flat keys written before profiles existed, migrated into the first
 * profile's namespace on first run so nobody loses their history. */
const LEGACY_SCOPED_KEYS = [
  "valhallaai-prefs",
  "valhallaai-sessions",
  "valhallaai-active-session",
];
const LEGACY_APIKEY_PREFIX = "valhallaai-apikey-";

export const profiles = writable<Profile[]>([]);
export const activeProfileId = writable<string>("");

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function persistProfiles(): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(get(profiles)));
    localStorage.setItem(ACTIVE_PROFILE_KEY, get(activeProfileId));
  } catch (err) {
    console.error("Failed to persist profiles:", err);
  }
}

/** Namespace a storage key to the active profile. */
export function scopedKey(base: string): string {
  return `vai:${get(activeProfileId)}:${base}`;
}

/**
 * Move the pre-profiles flat keys into `profileId`'s namespace.
 *
 * Copy-then-remove rather than a rename, and any single key that throws is
 * skipped instead of aborting the run — a half-migrated profile with most
 * of its history is a far better outcome than a thrown exception at module
 * load, which would take the whole app down before it renders.
 */
function migrateLegacyKeys(profileId: string): void {
  const move = (from: string, to: string) => {
    try {
      const value = localStorage.getItem(from);
      if (value === null) return;
      if (localStorage.getItem(to) === null) localStorage.setItem(to, value);
      localStorage.removeItem(from);
    } catch (err) {
      console.error(`Profile migration: could not move ${from}`, err);
    }
  };

  for (const key of LEGACY_SCOPED_KEYS) move(key, `vai:${profileId}:${key}`);

  // API keys are one key per provider, so the list has to be discovered.
  // Collected first because removing while iterating localStorage's index
  // shifts the remaining entries.
  const apiKeyNames: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (name && name.startsWith(LEGACY_APIKEY_PREFIX)) apiKeyNames.push(name);
    }
  } catch (err) {
    console.error("Profile migration: could not enumerate API keys", err);
  }
  for (const name of apiKeyNames) move(name, `vai:${profileId}:${name}`);
}

/**
 * Resolve the active profile, creating and migrating the first one if this
 * is an upgrade from a pre-profiles install.
 *
 * Runs at module-evaluation time, NOT in a component's onMount, for the
 * same reason sessions.ts calls loadSessions() there: ES modules evaluate
 * dependencies first, so any module importing this one is guaranteed a
 * resolved namespace before its own top-level code runs. sessions.ts
 * reads scopedKey() at import time — if this were deferred to onMount it
 * would read `vai::valhallaai-sessions` and silently show an empty history.
 */
function initProfiles(): void {
  let loaded = readJSON<Profile[]>(PROFILES_KEY, []);
  let active = "";
  try {
    active = localStorage.getItem(ACTIVE_PROFILE_KEY) ?? "";
  } catch {
    active = "";
  }

  if (loaded.length === 0) {
    const first: Profile = {
      id: newId(),
      name: "Local",
      createdAt: Date.now(),
    };
    loaded = [first];
    active = first.id;
    profiles.set(loaded);
    activeProfileId.set(active);
    migrateLegacyKeys(first.id);
    persistProfiles();
    return;
  }

  // A deleted or corrupted active id falls back to the first profile
  // rather than leaving an empty namespace that reads as "no history".
  if (!active || !loaded.some((p) => p.id === active)) active = loaded[0].id;

  profiles.set(loaded);
  activeProfileId.set(active);
}

initProfiles();

/** The single test for "is this profile signed in".
 *
 * Settings keyed off `authProvider` while the sidebar chip keyed off `email`.
 * Those can disagree -- a patch that sets one but not the other leaves the two
 * halves of the UI contradicting each other, which is exactly how a failed
 * sign-in can look like a successful one. One function, both call sites. */
export function isSignedIn(profile: Profile | null | undefined): boolean {
  return Boolean(profile?.authProvider && profile?.email);
}

export function getActiveProfile(): Profile | null {
  const id = get(activeProfileId);
  return get(profiles).find((p) => p.id === id) ?? null;
}

export function createProfile(name: string): string {
  const id = newId();
  const profile: Profile = {
    id,
    name: name.trim() || "New profile",
    createdAt: Date.now(),
  };
  profiles.update((all) => [...all, profile]);
  persistProfiles();
  return id;
}

export function updateProfile(id: string, patch: Partial<Omit<Profile, "id">>): void {
  profiles.update((all) => all.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  persistProfiles();
}

/**
 * Delete a profile and everything stored under its namespace.
 *
 * Refuses to remove the last profile: with none left the next load would
 * create a fresh one and migrateLegacyKeys would find nothing, which reads
 * to the user as "the app deleted all my chats".
 */
export function deleteProfile(id: string): boolean {
  if (get(profiles).length <= 1) return false;

  const prefix = `vai:${id}:`;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (name && name.startsWith(prefix)) doomed.push(name);
    }
    for (const name of doomed) localStorage.removeItem(name);
  } catch (err) {
    console.error("Could not clear storage for deleted profile:", err);
  }

  profiles.update((all) => all.filter((p) => p.id !== id));
  if (get(activeProfileId) === id) activeProfileId.set(get(profiles)[0].id);
  persistProfiles();
  return true;
}

/**
 * Switch profiles by reloading the window.
 *
 * Deliberate: sessions.ts resolves its storage key once at module-eval
 * time, and it is not the only module that does. Re-reading every store
 * in place would mean each one growing a "the profile changed" subscriber,
 * and any module that missed it would keep serving the old profile's data
 * — a bug that leaks one profile's chat history into another. A reload
 * re-evaluates everything against the new namespace with no such class of
 * bug available. Nothing is lost: all state is already persisted.
 */
export function switchProfile(id: string): void {
  if (!get(profiles).some((p) => p.id === id)) return;
  activeProfileId.set(id);
  persistProfiles();
  if (typeof location !== "undefined") location.reload();
}
