<script lang="ts">
  import { inTauri } from "../lib/provider-keys";
  import {
    profiles,
    activeProfileId,
    googleClientId,
    signInProfileWithGoogle,
    completeOnboardingLocally,
  } from "../lib/profiles";

  // Shown once per profile, at startup, before anything else in the app is
  // usable. Visibility is fully derived from the store -- there is no local
  // "open" flag to fall out of sync with reality. See the "onboarded" field's
  // comment in profiles.ts for why existing profiles do not see this: it is
  // backfilled true for any profile that existed before this shipped, so this
  // component only ever renders for a genuinely new profile.
  $: activeProfile = $profiles.find((p) => p.id === $activeProfileId) ?? null;
  $: visible = activeProfile !== null && !activeProfile.onboarded;

  let signingIn = false;
  let signInError = "";

  async function signIn(): Promise<void> {
    if (!activeProfile || signingIn) return;
    signingIn = true;
    signInError = "";
    try {
      await signInProfileWithGoogle(activeProfile.id);
      // No need to hide the modal explicitly: signInProfileWithGoogle's patch
      // sets onboarded: true, the profiles store updates, and `visible`
      // above goes false on its own.
    } catch (err) {
      signInError = typeof err === "string" ? err : err instanceof Error ? err.message : "Sign-in failed.";
    } finally {
      signingIn = false;
    }
  }

  function continueLocally(): void {
    if (!activeProfile) return;
    completeOnboardingLocally(activeProfile.id);
  }
</script>

{#if visible}
  <!-- Not an accidental dismiss surface: there is no backdrop-click-to-close
       and no Escape handler. Both paths (sign in / continue) are deliberate
       choices, and either one is fine -- this is a welcome screen, not a
       gate, so there is nothing to "cancel" out of. -->
  <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <div class="card">
      <h2 id="onboarding-title">Welcome to ValhallaAI</h2>
      <p class="lede">
        This app is local-first: everything runs on this machine, and nothing
        you do here requires an account.
      </p>
      <p>
        You can attach a name, verified email, and avatar to this profile by
        signing in with Google — that's identity only, not a login. There is
        no server, so nothing syncs anywhere and no data ever leaves your
        control. See <code>CONTRIBUTING.md</code> if you want the details.
      </p>

      <div class="actions">
        <button
          class="primary-btn"
          on:click={signIn}
          disabled={!googleClientId() || !inTauri() || signingIn}
          title={!inTauri()
            ? "Only works in the desktop app"
            : !googleClientId()
              ? "Set VITE_GOOGLE_CLIENT_ID in .env"
              : "Sign in with Google"}
        >
          <span class="g-mark">G</span>
          {signingIn ? "Waiting for your browser…" : "Sign in with Google"}
        </button>
        <button class="secondary-btn" on:click={continueLocally} disabled={signingIn}>
          Continue without an account
        </button>
      </div>

      {#if !inTauri()}
        <p class="hint">Sign-in only runs in the desktop app — the local port it needs isn't available here.</p>
      {:else if !googleClientId()}
        <p class="hint">
          Sign-in needs <code>VITE_GOOGLE_CLIENT_ID</code> set in <code>.env</code>. You can still continue
          without an account.
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

  .primary-btn,
  .secondary-btn {
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

  .primary-btn:disabled,
  .secondary-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .secondary-btn {
    border: 1px solid transparent;
    background: none;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .secondary-btn:hover:not(:disabled) {
    color: var(--text-primary);
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
