<script lang="ts">
  import { inTauri } from "../lib/provider-keys";
  import {
    profiles,
    activeProfileId,
    createProfile,
    updateProfile,
    deleteProfile,
    switchProfile,
    isSignedIn,
    googleClientId,
    signInProfileWithGoogle,
    signOutProfile,
  } from "../lib/profiles";

  // Split out of Settings.svelte: identity/profile management and app
  // configuration were sharing one page for no reason other than history.
  // Nothing here reads or writes anything Settings.svelte owns (provider
  // defaults, API keys, Ollama endpoint) -- this file is self-contained
  // except for the profiles store itself.
  $: activeProfile = $profiles.find((p) => p.id === $activeProfileId) ?? null;

  let signingIn = false;
  let signInError = "";

  // The actual OAuth call and patch-building live in profiles.ts, shared with
  // the first-launch onboarding prompt -- see the comment there.
  async function signInWithGoogle(): Promise<void> {
    if (!activeProfile || signingIn) return;
    signingIn = true;
    signInError = "";
    try {
      await signInProfileWithGoogle(activeProfile.id);
    } catch (err) {
      signInError = typeof err === "string" ? err : err instanceof Error ? err.message : "Sign-in failed.";
    } finally {
      signingIn = false;
    }
  }

  function signOut(): void {
    if (!activeProfile) return;
    signOutProfile(activeProfile.id);
    signInError = "";
  }

  let newProfileName = "";
  let renameValue = "";
  let renaming = false;
  let profileNotice = "";

  function beginRename(): void {
    renameValue = activeProfile?.name ?? "";
    renaming = true;
  }

  function commitRename(): void {
    const name = renameValue.trim();
    if (name && activeProfile) updateProfile(activeProfile.id, { name });
    renaming = false;
  }

  function addProfile(): void {
    const name = newProfileName.trim();
    if (!name) return;
    const id = createProfile(name);
    newProfileName = "";
    // Switch immediately: creating a profile you are not put into reads as
    // a no-op. switchProfile reloads, so nothing below this runs.
    switchProfile(id);
  }

  function removeActiveProfile(): void {
    if (!activeProfile) return;
    const target = activeProfile;
    const ok = confirm(
      `Delete the profile "${target.name}"?\n\n` +
        "Its chat sessions, saved API keys, and default model are erased from " +
        "this machine. Keys in .env are not touched. This cannot be undone."
    );
    if (!ok) return;
    if (!deleteProfile(target.id)) {
      // Guarded in profiles.ts: deleting the only profile would leave the
      // next load to mint a fresh empty one, which reads as data loss.
      profileNotice = "This is the only profile, so it can't be deleted. Create another one first.";
      return;
    }
    location.reload();
  }

  function toggleIgnoreEnv(e: Event): void {
    if (!activeProfile) return;
    const on = (e.currentTarget as HTMLInputElement).checked;
    updateProfile(activeProfile.id, { ignoreEnvKeys: on });
    // envKeyFor() consults the profile, so the "from .env" badges Settings
    // shows, and the key each provider would actually use, both change with
    // this. Reload so every already-read value is re-resolved rather than
    // half-stale.
    location.reload();
  }
</script>

<div class="container">
  <h2>Profile</h2>

  <div class="settings-panel">
    <section class="section">
      <p class="section-hint">
        A profile keeps its own chat sessions, default model, and saved API keys.
        Everything stays on this machine — there is no account and nothing syncs.
      </p>

      <div class="profile-row">
        {#if activeProfile?.avatarUrl}
          <img class="avatar" src={activeProfile.avatarUrl} alt="" />
        {:else}
          <span class="avatar avatar-initial">
            {(activeProfile?.name ?? "L").trim().charAt(0).toUpperCase()}
          </span>
        {/if}
        <div class="profile-id">
          {#if renaming}
            <input
              class="rename-input"
              bind:value={renameValue}
              on:keydown={(e) => e.key === "Enter" && commitRename()}
              placeholder="Profile name"
            />
            <button class="link-btn" on:click={commitRename}>Save</button>
            <button class="link-btn" on:click={() => (renaming = false)}>Cancel</button>
          {:else}
            <strong>{activeProfile?.name ?? "Local"}</strong>
            <button class="link-btn" on:click={beginRename}>Rename</button>
          {/if}
          <div class="profile-email">
            {activeProfile?.email ?? "Not signed in"}
            {#if activeProfile?.email}
              {#if activeProfile.emailVerified}
                <span class="verify-badge verified" title="Confirmed by Google's email_verified claim at sign-in">✓ Verified</span>
              {:else}
                <span class="verify-badge unverified" title="Google's email_verified claim was false at sign-in">Unverified</span>
              {/if}
            {/if}
          </div>
        </div>
      </div>

      <div class="signin-block">
        {#if isSignedIn(activeProfile)}
          <button class="signin-btn" on:click={signOut}>Sign out of Google</button>
          <p class="section-hint">
            Signed in as {activeProfile?.email}. Signing out clears the name, email,
            and avatar only — this profile's chats, keys, and settings stay put.
          </p>
        {:else}
          <button
            class="signin-btn"
            on:click={signInWithGoogle}
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
          <p class="section-hint">
            {#if !inTauri()}
              Sign-in only runs in the desktop app — it needs a local port the
              browser can't open.
            {:else if !googleClientId()}
              Set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code> (see
              <code>env.example</code>), then restart the dev server.
            {:else}
              Attaches a name, email, and avatar to this profile. Nothing syncs —
              there is no server. No access or refresh token is kept, because
              nothing here calls a Google API.
            {/if}
          </p>
        {/if}
        {#if signInError}
          <p class="signin-error">{signInError}</p>
        {/if}
      </div>

      <div class="field">
        <label class="checkbox-row" for="ignore-env">
          <input
            id="ignore-env"
            type="checkbox"
            checked={activeProfile?.ignoreEnvKeys ?? false}
            on:change={toggleIgnoreEnv}
          />
          <span>Ignore <code>.env</code> keys for this profile</span>
        </label>
        <small>
          Off: a key in <code>.env</code> wins over one saved in Settings, so rotating
          the file changes what the next chat uses. On: this profile uses only its own
          saved keys. <code>.env</code> stays shared either way — the agent scripts
          and docker-compose read that same file with no idea which profile is active.
        </small>
      </div>

      <div class="field">
        <label for="new-profile">Add a profile:</label>
        <div class="inline-row">
          <input
            id="new-profile"
            bind:value={newProfileName}
            placeholder="e.g. Work"
            on:keydown={(e) => e.key === "Enter" && addProfile()}
          />
          <button on:click={addProfile} disabled={!newProfileName.trim()}>Create</button>
        </div>
      </div>

      {#if profileNotice}
        <p class="profile-notice">{profileNotice}</p>
      {/if}

      <button class="danger-btn" on:click={removeActiveProfile}>
        Delete this profile
      </button>
    </section>
  </div>
</div>

<style>
  .container {
    max-width: 600px;
    margin: 0 auto;
  }

  h2 {
    margin-top: 0;
    font-family: var(--font-display);
    font-weight: 400;
    letter-spacing: 0.02em;
    color: var(--text-primary);
  }

  .settings-panel {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .section {
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
  }

  .section-hint {
    font-size: 0.82rem;
    color: var(--text-muted);
    margin: 0 0 1rem;
    line-height: 1.5;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  label {
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--text-primary);
  }

  /* This page has no <select> -- only text inputs (rename, new-profile
     name). Scoped to input specifically, not shared with select like
     Settings.svelte does, since there is nothing here to share it with. */
  input {
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 0.9rem;
    font-family: inherit;
    background: var(--bg-surface-raised);
    color: var(--text-primary);
  }

  input:hover {
    border-color: var(--text-muted);
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft-bg);
  }

  p {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  small {
    display: block;
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  .profile-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .avatar {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
  }

  .avatar-initial {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }

  .profile-id {
    min-width: 0;
  }

  .profile-email {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    opacity: 0.7;
  }

  .verify-badge {
    padding: 0.05rem 0.4rem;
    font-size: 0.68rem;
    font-weight: 600;
    border-radius: 999px;
    opacity: 1;
  }

  .verify-badge.verified {
    color: #7ee2a8;
    background: rgba(126, 226, 168, 0.14);
  }

  .verify-badge.unverified {
    color: #ffb020;
    background: rgba(255, 176, 32, 0.14);
  }

  .link-btn {
    padding: 0 0.35rem;
    margin-left: 0.4rem;
    font-family: inherit;
    font-size: 0.78rem;
    color: var(--accent);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
  }

  .rename-input {
    font-family: inherit;
    font-size: 0.9rem;
    padding: 0.25rem 0.4rem;
  }

  .signin-block {
    margin-bottom: 1rem;
  }

  .signin-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.9rem;
    font-family: inherit;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-surface);
    color: var(--text-primary);
    cursor: pointer;
  }

  .signin-btn:disabled {
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

  .signin-error {
    margin: 0.5rem 0 0;
    font-size: 0.82rem;
    line-height: 1.5;
    color: #ff8a80;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 400;
  }

  .inline-row {
    display: flex;
    gap: 0.5rem;
  }

  .inline-row input {
    flex: 1;
  }

  .profile-notice {
    font-size: 0.82rem;
    color: var(--text-secondary);
  }

  .danger-btn {
    font-family: inherit;
    font-size: 0.85rem;
    padding: 0.4rem 0.8rem;
    color: #b42318;
    background: transparent;
    border: 1px solid #b42318;
    border-radius: 6px;
    cursor: pointer;
  }

  .danger-btn:hover {
    background: rgba(180, 35, 24, 0.08);
  }
</style>
