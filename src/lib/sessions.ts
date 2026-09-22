/**
 * Chat session store — persisted conversation history, so switching tabs
 * or restarting the app doesn't lose what you were talking about.
 *
 * Previously ModelPicker.svelte held its message list as local component
 * state (`responses: ChatMessage[]`) with no persistence and no concept
 * of more than one conversation. This module lifts that into a shared
 * store so both ModelPicker (reads/writes the active session's messages)
 * and Sessions.svelte (lists all sessions, switches the active one) work
 * off the same data instead of duplicating it.
 */

import { writable, get } from "svelte/store";
import type { LLMProvider, LLMResponse } from "./llm-router";
import { FALLBACK_PROVIDER, FALLBACK_MODEL } from "./providers";
// Importing profiles here is what guarantees the active profile is
// resolved before loadSessions() runs at the bottom of this module: ES
// modules evaluate their dependencies first. Without it, scopedKey()
// would build a key against an empty profile id.
import { scopedKey } from "./profiles";

export interface ChatMessage {
  type: "user" | "assistant";
  text: string;
  usage?: LLMResponse["usage"];
  imageCount?: number;
  /** Paths of text files inlined into the prompt. Names only -- the full
   * contents went to the model but would bury the transcript here. */
  fileNames?: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  provider: string;
  model: string;
  /** The project this conversation is filed under, if any.
   *
   *  A label, not a container: sessions are stored in one flat list and a
   *  project is only a name on them. That is deliberate — it means deleting a
   *  project can never delete a conversation, which is the failure a nested
   *  store would invite. */
  project?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// Resolved per call rather than captured in a const: switchProfile()
// reloads the window, but a stale module-level constant would still be
// the wrong shape to reason about if that ever changes.
const sessionsKey = () => scopedKey("valhallaai-sessions");
const activeSessionKey = () => scopedKey("valhallaai-active-session");
const MAX_TITLE_LENGTH = 48;

export const sessions = writable<ChatSession[]>([]);
export const activeSessionId = writable<string | null>(null);

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function persist(): void {
  try {
    localStorage.setItem(sessionsKey(), JSON.stringify(get(sessions)));
    const active = get(activeSessionId);
    if (active) {
      localStorage.setItem(activeSessionKey(), active);
    } else {
      localStorage.removeItem(activeSessionKey());
    }
  } catch (err) {
    // localStorage can throw (quota exceeded, private-browsing lockouts,
    // etc.) — a failed save shouldn't crash the chat, just means this
    // session's history won't survive a restart this time.
    console.error("Failed to persist sessions:", err);
  }
}

export function loadSessions(): void {
  try {
    const raw = localStorage.getItem(sessionsKey());
    const loaded: ChatSession[] = raw ? JSON.parse(raw) : [];
    sessions.set(loaded);

    const savedActive = localStorage.getItem(activeSessionKey());
    if (savedActive && loaded.some((s) => s.id === savedActive)) {
      activeSessionId.set(savedActive);
    } else if (loaded.length > 0) {
      activeSessionId.set(loaded[loaded.length - 1].id);
    }
    // If there are no sessions yet, activeSessionId stays null —
    // ModelPicker's empty state (the centered logo) shows until the
    // user sends a first message or clicks "New Session".
  } catch (err) {
    console.error("Failed to load sessions:", err);
    sessions.set([]);
  }
}

// Run once at module-evaluation time (import), not inside a component's
// onMount. Svelte fires a CHILD component's onMount before its parent's —
// ModelPicker mounts before App.svelte — so a loadSessions() call sitting
// in App.svelte's onMount could run after ModelPicker has already read
// (still-empty) $sessions/$activeSessionId once. Since ES modules
// evaluate exactly once no matter how many files import from this one,
// running it here guarantees the store is populated before ANY
// component's onMount fires, regardless of the component tree's shape.
loadSessions();

export function createSession(provider: string, model: string, project?: string): string {
  const id = newId();
  const now = Date.now();
  const session: ChatSession = {
    id,
    title: "New session",
    provider,
    model,
    project,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  sessions.update((all) => [...all, session]);
  activeSessionId.set(id);
  persist();
  return id;
}

export function deleteSession(id: string): void {
  sessions.update((all) => all.filter((s) => s.id !== id));
  if (get(activeSessionId) === id) {
    const remaining = get(sessions);
    activeSessionId.set(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
  }
  persist();
}

export function getActiveSession(): ChatSession | null {
  const id = get(activeSessionId);
  if (!id) return null;
  return get(sessions).find((s) => s.id === id) ?? null;
}

/** Appends messages to a session and derives its title from the first
 * user message if it hasn't been titled yet. */
export function appendToSession(
  id: string,
  newMessages: ChatMessage[],
  provider: string,
  model: string
): void {
  sessions.update((all) =>
    all.map((s) => {
      if (s.id !== id) return s;
      const messages = [...s.messages, ...newMessages];
      const firstUserMsg = messages.find((m) => m.type === "user");
      const title =
        s.title === "New session" && firstUserMsg
          ? firstUserMsg.text.slice(0, MAX_TITLE_LENGTH) +
            (firstUserMsg.text.length > MAX_TITLE_LENGTH ? "…" : "")
          : s.title;
      return { ...s, messages, provider, model, title, updatedAt: Date.now() };
    })
  );
  persist();
}

// ---------------------------------------------------------------------------
// Projects — a label over sessions, not a container holding them
// ---------------------------------------------------------------------------

const projectsKey = () => scopedKey("valhallaai-projects");

/** Projects that exist without holding a session yet. A project also exists
 *  the moment a session names it, whether or not it was created here — see
 *  projectNames(). */
export const projects = writable<string[]>([]);

function persistProjects(): void {
  try {
    localStorage.setItem(projectsKey(), JSON.stringify(get(projects)));
  } catch (err) {
    console.error("Failed to persist projects:", err);
  }
}

export function loadProjects(): void {
  try {
    const raw = localStorage.getItem(projectsKey());
    projects.set(raw ? JSON.parse(raw) : []);
  } catch (err) {
    console.error("Failed to load projects:", err);
    projects.set([]);
  }
}

loadProjects();

/**
 * Every project name in play: the ones explicitly created, plus any a session
 * already references.
 *
 * Derived rather than trusting the stored list alone. A session restored from
 * a backup, or filed before this store existed, would otherwise name a project
 * the Projects page refuses to list — and that session would be invisible with
 * no way to get it back.
 */
export function projectNames(sessionsList: ChatSession[], created: string[]): string[] {
  const names = new Set<string>(created);
  for (const session of sessionsList) {
    if (session.project) names.add(session.project);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Returns the stored name, or null if it was empty or already existed. */
export function createProject(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // Case-insensitive: "CareConnectLite" and "careconnectlite" would otherwise
  // become two projects with half the sessions each.
  if (get(projects).some((p) => p.toLowerCase() === trimmed.toLowerCase())) return null;
  projects.set([...get(projects), trimmed]);
  persistProjects();
  return trimmed;
}

/**
 * Removes the project label only.
 *
 * The sessions inside it stay and become unassigned. Deleting a grouping must
 * never delete the conversations that were grouped — that is the whole reason
 * `project` is a field on a session rather than a nested store.
 */
export function deleteProject(name: string): void {
  projects.set(get(projects).filter((p) => p !== name));
  sessions.update((all) =>
    all.map((s) => (s.project === name ? { ...s, project: undefined } : s))
  );
  persistProjects();
  persist();
}

/** Files a session under a project, or unfiles it when `project` is empty. */
export function assignSessionProject(id: string, project: string): void {
  sessions.update((all) =>
    all.map((s) => (s.id === id ? { ...s, project: project || undefined } : s))
  );
  persist();
}

/** Sessions in one project. `null` means the unassigned ones. */
export function sessionsInProject(sessionsList: ChatSession[], project: string | null): ChatSession[] {
  return sessionsList
    .filter((s) => (project === null ? !s.project : s.project === project))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
