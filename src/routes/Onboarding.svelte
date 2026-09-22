<script lang="ts">
  import { inTauri } from "../lib/provider-keys";
  import {
    profiles,
    activeProfileId,
    googleClientId,
    signInProfileWithGoogle,
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
  // signed in passes through and never sees this.
  $: activeProfile = $profiles.find((p) => p.id === $activeProfileId) ?? null;
  $: visible = activeProfile !== null && !isSignedIn(activeProfile);

  let signingIn = false;
  let signInError = "";

  async function signIn(): Promise<void> {
    if (!activeProfile || signingIn) return;
    signingIn = true;
    signInError = "";
    try {
      await signInProfileWithGoogle(activeProfile.id);
      // signInProfileWithGoogle sets authProvider and email together, so
      // isSignedIn() flips true and `visible` clears on its own.
    } catch (err) {
      signInError = typeof err === "string" ? err : err instanceof Error ? err.message : "Sign-in failed.";
    } finally {
      signingIn = false;
    }
  }

  // No Google client, or not running in the desktop app: the sign-in button
  // cannot succeed, and with no local path that would leave the app
  // permanently blocked. Say so instead of presenting a button that fails.
  $: blocked = !inTauri() || !googleClientId();
</script>

{#if visible}
  <!-- No backdrop-click and no Escape handler. This is a gate: the only way
       through is a verified sign-in, so there is nothing to dismiss. -->
  <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <div class="card">
      <h2 id="onboarding-title">Create your profile</h2>
      <p class="lede">Sign in with Google to use ValhallaAI.</p>
      <p>
        Your Google account supplies the name, verified email, and avatar for
        this profile. That's identity only — there is no server here, nothing
        syncs, and no data leaves this machine.
      </p>

      <div class="actions">
        <button
          class="primary-btn"
          on:click={signIn}
          disabled={blocked || signingIn}
          title={!inTauri()
            ? "Only works in the desktop app"
            : !googleClientId()
              ? "Set VITE_GOOGLE_CLIENT_ID in .env"
              : "Sign in with Google"}
        >
          <span class="g-mark">G</span>
          {signingIn ? "Waiting for your browser…" : "Sign in with Google"}
        </button>
      </div>

      {#if !inTauri()}
        <p class="hint">
          Sign-in only runs in the desktop app — the local port it needs isn't available here, so this
          screen can't be completed in a browser tab.
        </p>
      {:else if !googleClientId()}
        <p class="hint">
          Sign-in needs <code>VITE_GOOGLE_CLIENT_ID</code> set in <code>.env</code>, then a restart.
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
