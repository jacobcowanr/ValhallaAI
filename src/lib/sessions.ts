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

export interface ChatMessage {
  type: "user" | "assistant";
  text: string;
  usage?: LLMResponse["usage"];
  imageCount?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  provider: LLMProvider;
  model: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const SESSIONS_KEY = "valhallaai-sessions";
const ACTIVE_SESSION_KEY = "valhallaai-active-session";
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
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(get(sessions)));
    const active = get(activeSessionId);
    if (active) {
      localStorage.setItem(ACTIVE_SESSION_KEY, active);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
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
    const raw = localStorage.getItem(SESSIONS_KEY);
    const loaded: ChatSession[] = raw ? JSON.parse(raw) : [];
    sessions.set(loaded);

    const savedActive = localStorage.getItem(ACTIVE_SESSION_KEY);
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

export function createSession(provider: LLMProvider, model: string): string {
  const id = newId();
  const now = Date.now();
  const session: ChatSession = {
    id,
    title: "New session",
    provider,
    model,
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
  provider: LLMProvider,
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
