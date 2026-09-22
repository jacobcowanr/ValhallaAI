<script lang="ts">
  import { onMount } from "svelte";
  import { inTauri } from "../lib/provider-keys";
  import {
    profiles,
    activeProfileId,
    googleClientId,
    signInProfileWithGoogle,
    signInProfileWithGithub,
    isSignedIn,
  } from "../lib/profiles";

  // A gate, not a welcome screen. Jacob reversed the earlier "skippable"
  // decision on 2026-09-22: the app must not be usable until a profile exists
  // with a verified email. The only verification this app can perform is
  // Google's — there is no server to send a confirmation mail from — so
  // "verified" means signed in with Google and carrying an email. A typed
  // name cannot satisfy that, so there is no local path.
  //
  // Keyed off isSignedIn() rather than the `onboarded` flag. That flag is
  // backfilled true for every profile that predates this screen, which would
  // hide the gate from exactly the installs it now has to cover. isSignedIn
  // requires both an auth provider and an email, so a profile that is already
  // signed in -- via EITHER provider below -- passes through and never sees
  // this again.
  $: activeProfile = $profiles.find((p) => p.id === $activeProfileId) ?? null;
  $: visible = activeProfile !== null && !isSignedIn(activeProfile);

  // Same reasoning as googleClientId(): GITHUB_CLIENT_ID is never sent to the
  // frontend (see github_sign_in's own comment in main.rs), so knowing
  // whether it's configured needs a round trip, done once on mount.
  let githubConfigured = false;
  onMount(async () => {
    if (!inTauri()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/tauri");
      githubConfigured = await invoke<boolean>("github_client_configured");
    } catch {
      githubConfigured = false;
    }
  });

  let signingInProvider: "google" | "github" | null = null;
  let signInError = "";

  async function signInGoogle(): Promise<void> {
    if (!activeProfile || signingInProvider) return;
    signingInProvider = "google";
    signInError = "";
    try {
      await signInProfileWithGoogle(activeProfile.id);
      // Either sign-in sets authProvider and email together, so isSignedIn()
      // flips true and `visible` clears on its own.
    } catch (err) {
      signInError = typeof err === "string" ? err : err instanceof Error ? err.message : "Sign-in failed.";
    } finally {
      signingInProvider = null;
    }
  }

  async function signInGithub(): Promise<void> {
    if (!activeProfile || signingInProvider) return;
    signingInProvider = "github";
    signInError = "";
    try {
      await signInProfileWithGithub(activeProfile.id);
    } catch (err) {
      signInError = typeof err === "string" ? err : err instanceof Error ? err.message : "Sign-in failed.";
    } finally {
      signingInProvider = null;
    }
  }

  // Per-button readiness, not one shared flag: if only one provider is
  // configured, that button should still work rather than both going dark
  // because the other one's env vars are missing.
  $: googleReady = inTauri() && !!googleClientId();
  $: githubReady = inTauri() && githubConfigured;
  // Neither path can succeed and there is no local fallback -- the gate
  // would be permanently stuck. Say so plainly instead of presenting two
  // buttons that both fail.
  $: bothUnavailable = !inTauri() || (!googleClientId() && !githubConfigured);
</script>

{#if visible}
  <!-- No backdrop-click and no Escape handler. This is a gate: the only way
       through is a verified sign-in, so there is nothing to dismiss. -->
  <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <div class="card">
      <h2 id="onboarding-title">Create your profile</h2>
      <p class="lede">Sign in with Google or GitHub to use ValhallaAI.</p>
      <p>
        Either account supplies the name, verified email, and avatar for this
        profile. That's identity only — there is no server here, nothing syncs,
        and no data leaves this machine.
      </p>

      <div class="actions">
        <button
          class="primary-btn"
          on:click={signInGoogle}
          disabled={!googleReady || !!signingInProvider}
          title={!inTauri()
            ? "Only works in the desktop app"
            : !googleClientId()
              ? "Set VITE_GOOGLE_CLIENT_ID in .env"
              : "Sign in with Google"}
        >
          <span class="g-mark">G</span>
          {signingInProvider === "google" ? "Waiting for your browser…" : "Sign in with Google"}
        </button>
        <button
          class="primary-btn"
          on:click={signInGithub}
          disabled={!githubReady || !!signingInProvider}
          title={!inTauri()
            ? "Only works in the desktop app"
            : !githubConfigured
              ? "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env"
              : "Sign in with GitHub"}
        >
          <span class="gh-mark">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
                   0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
                   -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
                   .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
                   -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
                   1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
                   1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01
                   1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
          </span>
          {signingInProvider === "github" ? "Waiting for your browser…" : "Sign in with GitHub"}
        </button>
      </div>

      {#if bothUnavailable}
        <p class="hint">
          {#if !inTauri()}
            Sign-in only runs in the desktop app — the local port it needs isn't available here, so this
            screen can't be completed in a browser tab.
          {:else}
            Neither provider is configured. Set <code>VITE_GOOGLE_CLIENT_ID</code>, or
            <code>GITHUB_CLIENT_ID</code> + <code>GITHUB_CLIENT_SECRET</code>, in <code>.env</code>, then
            restart the app.
          {/if}
        </p>
      {/if}
      {#if signInError}
        <p class="error">{signInError}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: rgba(0, 0, 0, 0.6);
  }

  .card {
    width: 100%;
    max-width: 440px;
    padding: 2rem;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--bg-surface);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  h2 {
    margin: 0 0 0.75rem;
    font-family: var(--font-display);
    font-weight: 400;
    letter-spacing: 0.02em;
    color: var(--text-primary);
  }

  .lede {
    font-weight: 600;
    color: var(--text-primary);
  }

  p {
    margin: 0 0 1rem;
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  code {
    background: var(--bg-surface-raised);
    color: var(--text-primary);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.85em;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-top: 1.25rem;
  }

  .primary-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.7rem 1rem;
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
  }

  .primary-btn {
    border: 1px solid var(--border-color);
    background: var(--bg-surface-raised);
    color: var(--text-primary);
  }

  .primary-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .g-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
    font-size: 0.72rem;
  }

  .gh-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .hint {
    margin-top: 0.75rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .error {
    margin-top: 0.75rem;
    font-size: 0.82rem;
    color: #ff8a80;
  }
</style>
