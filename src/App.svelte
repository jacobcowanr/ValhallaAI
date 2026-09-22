<script lang="ts">
  import { onMount } from "svelte";
  import ModelPicker from "./routes/ModelPicker.svelte";
  import VaultBrowser from "./routes/VaultBrowser.svelte";
  import AgentControl from "./routes/AgentControl.svelte";
  import Sessions from "./routes/Sessions.svelte";
  import Settings from "./routes/Settings.svelte";
  import Profile from "./routes/Profile.svelte";
  import Onboarding from "./routes/Onboarding.svelte";
  import logoWordmark from "./assets/ValhallaAI_Header.png";
  import norseFontUrl from "./assets/fonts/Norse.otf";
  import norseBoldFontUrl from "./assets/fonts/Norse-Bold.otf";
  // createSession() import (not loadSessions — that now runs automatically
  // at module-evaluation time inside sessions.ts itself, see the comment
  // there on why an onMount call here was the wrong place for it).
  import { createSession } from "./lib/sessions";
  import { FALLBACK_PROVIDER, FALLBACK_MODEL } from "./lib/providers";
  // Register stored user-defined providers with the router at startup, so a
  // custom provider is routable before Settings is ever opened. Without
  // this, the first send after a restart would fail with "Unknown provider"
  // while the picker happily displayed it.
  import { initCustomProviders } from "./lib/custom-providers";
  import { scopedKey, profiles, activeProfileId, switchProfile, isSignedIn } from "./lib/profiles";
  import { isKnownProvider } from "./lib/providers";

  // "settings" deliberately excluded from this list — it's pinned to the
  // bottom of the sidebar separately (see the markup below). The profile
  // card lives at the TOP of the sidebar instead, above "New Session" --
  // identity is the first thing in the column, app config (Settings) is
  // the last. Clicking the profile card opens its own "profile" tab,
  // still fully separate from "settings" (provider defaults, Ollama, API
  // keys) -- same split Gemini/most chat apps use between an account
  // surface and an app-settings page.
  const sections = [
    { id: "models", label: "Models & Chat" },
    { id: "sessions", label: "Sessions" },
    { id: "vault", label: "Vault Browser" },
    { id: "agents", label: "Agent Control" },
  ];

  let activeTab = "models";

  function startNewSession() {
    // Seed the new session with whatever provider/model the user has as
    // their default, not always the hardcoded fallback — same source
    // Settings.svelte and ModelPicker.svelte already read from.
    let provider: string = FALLBACK_PROVIDER;
    let model = FALLBACK_MODEL;
    const prefs = localStorage.getItem(scopedKey("valhallaai-prefs"));
    if (prefs) {
      try {
        const parsed = JSON.parse(prefs) as { defaultProvider?: string; defaultModel?: string };
        // Only trust a provider that still resolves — a custom provider the
        // user deleted afterwards would otherwise seed a session that cannot
        // route, and the session would fail on its first send.
        if (parsed.defaultProvider && isKnownProvider(parsed.defaultProvider)) {
          provider = parsed.defaultProvider;
        }
        if (parsed.defaultModel) model = parsed.defaultModel;
      } catch {
        // Malformed prefs — fall back to the defaults above rather than crash.
      }
    }
    createSession(provider, model);
    activeTab = "models";
  }

  // The chip shows who the active profile is. Reactive on $profiles too,
  // not just $activeProfileId, so a rename in Settings updates it without
  // needing a switch.
  $: activeProfile = $profiles.find((p) => p.id === $activeProfileId) ?? null;
  $: profileInitial = (activeProfile?.name ?? "L").trim().charAt(0).toUpperCase() || "L";
  $: signedIn = isSignedIn(activeProfile);

  // switchProfile() reloads the window (see its comment in profiles.ts),
  // so nothing after this call runs -- no local state needs updating here.
  function handleProfileChange(e: Event): void {
    switchProfile((e.currentTarget as HTMLSelectElement).value);
  }

  // Sidebar can be hidden entirely — persisted so it stays hidden/shown
  // across restarts rather than resetting to open every launch.
  let sidebarOpen = true;

  onMount(() => {
    initCustomProviders();
    const saved = localStorage.getItem("valhallaai-sidebar-open");
    if (saved !== null) sidebarOpen = saved === "true";
  });

  // Vite-resolved import URLs cannot be interpolated into a plain CSS
  // font-face rule's src, and CSS custom properties don't reliably work
  // there either across browsers/webviews. The FontFace API sidesteps
  // both: register the font in JS, reference it by name in CSS as normal.
  //
  // (Deliberately not spelling out either surrounding markup tag's name
  // literally in this comment — doing so once here made svelte-check
  // misparse the whole component as unclosed, a real reproduced tooling
  // quirk, not a typo. Safest to just avoid it in comments going forward.)
  onMount(() => {
    const norseRegular = new FontFace("Norse", `url(${norseFontUrl})`, { weight: "400" });
    const norseBold = new FontFace("Norse", `url(${norseBoldFontUrl})`, { weight: "700" });
    Promise.all([norseRegular.load(), norseBold.load()])
      .then((fonts) => fonts.forEach((f) => document.fonts.add(f)))
      .catch((err) => console.error("Failed to load Norse font:", err));
  });

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    localStorage.setItem("valhallaai-sidebar-open", String(sidebarOpen));
  }
</script>

<Onboarding />

<div class="shell">
  {#if sidebarOpen}
    <aside class="sidebar">
      <!-- Identity first, at the very top of the column -- above New
           Session, which used to be the first thing here. Settings
           (app config) stays pinned at the bottom via .sidebar-bottom;
           this is the account-surface counterpart at the opposite end. -->
      <button
        class="profile-card"
        class:active={activeTab === "profile"}
        on:click={() => (activeTab = "profile")}
        title={signedIn ? "Manage your profile" : "Sign in"}
      >
        {#if activeProfile?.avatarUrl}
          <img class="avatar" src={activeProfile.avatarUrl} alt="" />
        {:else}
          <span class="avatar avatar-initial">{profileInitial}</span>
        {/if}
        <!-- Signed out, the top line is the call to action and the profile
             name drops underneath -- the profile is still worth showing
             (it says which namespace you're in) but "Sign in" is the thing
             worth reading first. Signed in, that inverts: who you are on
             top, the account underneath. -->
        <span class="profile-text">
          {#if signedIn}
            <span class="profile-name">{activeProfile?.name}</span>
            <span class="profile-sub">{activeProfile?.email}</span>
          {:else}
            <span class="profile-name">Sign in</span>
            <span class="profile-sub">{activeProfile?.name ?? "Local"}</span>
          {/if}
        </span>
      </button>

      {#if $profiles.length > 1}
        <div class="profile-switch">
          <label class="profile-switch-label" for="profile-select">Switch profile</label>
          <select
            id="profile-select"
            value={$activeProfileId}
            on:change={handleProfileChange}
          >
            {#each $profiles as profile}
              <option value={profile.id}>{profile.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <button class="new-session-btn" on:click={startNewSession}>
        New Session
      </button>

      <nav>
        {#each sections as section}
          <button class:active={activeTab === section.id} on:click={() => (activeTab = section.id)}>
            {section.label}
          </button>
        {/each}
      </nav>

      <!-- Pinned to the bottom via margin-top: auto on .sidebar-bottom. -->
      <div class="sidebar-bottom">
        <button class:active={activeTab === "settings"} on:click={() => (activeTab = "settings")}>
          Settings
        </button>
      </div>
    </aside>
  {/if}

  <main>
    <div class="topbar">
      <button class="sidebar-toggle" on:click={toggleSidebar} title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}>
        {sidebarOpen ? "◀" : "▶"}
      </button>
    </div>

    <section class="content">
      {#if activeTab === "models"}
        <ModelPicker {logoWordmark} />
      {:else if activeTab === "sessions"}
        <Sessions onSelect={() => (activeTab = "models")} />
      {:else if activeTab === "vault"}
        <VaultBrowser />
      {:else if activeTab === "agents"}
        <AgentControl />
      {:else if activeTab === "profile"}
        <Profile />
      {:else if activeTab === "settings"}
        <Settings />
      {/if}
    </section>
  </main>
</div>

<style>
  /*
   * Theme tokens — defined once here, referenced by every component's
   * <style> block via var(--token-name) instead of each one hardcoding
   * its own copy of the same colors. The accent is bone-white, taken
   * from the valknut icon, not guessed.
   */
  :global(:root) {
    /* "Norse" is registered via the FontFace API in onMount above, not
       @fontsource — it's a licensed local font file (src/assets/fonts/),
       not an npm-distributed one. Falls back to serif until it loads. */
    --font-display: "Norse", serif;
    --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial,
      sans-serif;

    --bg-page: #0d0d0d;
    --bg-surface: #1a1a1a;
    --bg-surface-raised: #212121;
    --bg-surface-hover: #262626;
    --border-color: #2f2f2f;

    --text-primary: #f2f2f2;
    --text-secondary: #a3a3a3;
    --text-muted: #737373;

    /* Bone-white accent, taken from the valknut icon (white on black)
       rather than the old red wordmark. The red (#a90303) was sampled
       from ValhallaAI_Logo.png; that file is no longer the header. */
    --accent: #e8e4dc;
    --accent-hover: #ffffff;
    --accent-text: #0d0d0d;
    --accent-soft-bg: #26241f;
    --accent-soft-border: #4a463c;

    --danger: #dc3545;
    --danger-hover: #c82333;
    --success-bg: #16321f;
    --success-text: #4ade80;
    --warning-bg: #332008;
    --warning-text: #f0a83a;
    --warning-border: #5c3a10;
  }

  :global(body) {
    font-family: var(--font-body);
    background: var(--bg-page);
    color: var(--text-primary);
    margin: 0;
    padding: 0;
  }

  .shell {
    display: flex;
    min-height: 100vh;
  }

  /* Left sidebar — section nav only now; the big logo/tagline moved to
     ModelPicker's empty-chat state (main center of the screen) instead
     of living here permanently. */
  .sidebar {
    flex: 0 0 240px;
    background: var(--bg-surface);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    padding: 1.5rem 1rem;
  }

  .profile-card {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    padding: 0.6rem 0.65rem;
    margin-bottom: 0.5rem;
    text-align: left;
    border-radius: 8px;
  }

  .avatar {
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    object-fit: cover;
  }

  .avatar-initial {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: var(--accent-text);
    font-size: 0.95rem;
    font-weight: 600;
  }

  /* min-width:0 lets the ellipsis actually engage inside a flex child. */
  .profile-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
  }

  .profile-name,
  .profile-sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-name {
    color: var(--text-primary);
    letter-spacing: 0.05em;
  }

  /* An email address is data, not branding -- it has no business in a
     display face. Norse renders it in caps with angular strokes, which is
     unreadable at this size. Body font, no opacity dimming, and normal
     tracking: 3.36:1 -> 7.1:1, and it renders in real lowercase. */
  .profile-sub {
    font-family: var(--font-body);
    font-size: 0.78rem;
    letter-spacing: 0;
    color: var(--text-secondary);
    text-transform: none;
  }

  .profile-switch {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0 0.15rem 0.9rem;
  }

  .profile-switch-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.6;
  }

  .profile-switch select {
    font-family: inherit;
    font-size: 0.85rem;
    padding: 0.35rem 0.4rem;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    background: var(--bg-surface);
    color: var(--text-primary);
  }

  .new-session-btn {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.7rem 0.85rem;
    margin-bottom: 0.25rem;
    background: none;
    color: var(--text-primary);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 400;
    letter-spacing: 0.06em;
    text-align: left;
    transition: color 0.15s;
  }

  .new-session-btn:hover {
    color: var(--accent);
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  /* margin-top: auto on the LAST child of a column flex container pushes
     it (and everything after it, but there's nothing after it here) to
     the bottom of the available space — this is what actually pins
     Settings below New Session + nav instead of it just being last in
     document order (which alone wouldn't separate it visually). */
  .sidebar-bottom {
    margin-top: auto;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-color);
  }

  button {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.7rem 0.85rem;
    border: none;
    border-radius: 8px;
    background: none;
    cursor: pointer;
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 400;
    /* A decorative face needs more tracking than a UI face: the glyphs are
       angular and narrow, so tight spacing makes adjacent letters read as
       one shape. */
    letter-spacing: 0.06em;
    /* Was --text-secondary (7.1:1). Fine for a body face, but Norse's thin
       strokes read dimmer than the ratio implies, so the inactive state
       goes to full primary. Active is still distinguished by the accent
       colour and its background tint, not by being the only legible one. */
    color: var(--text-primary);
    text-align: left;
    transition: all 0.15s;
  }

  button:hover {
    color: var(--accent);
    background: none;
  }

  /* The selected row is marked by colour alone. A filled background was the
     cream block Jacob asked removed — white text on the dark surface, with
     the active item in the accent, is the whole distinction. */
  button.active {
    color: var(--accent);
    background: none;
  }

  button.active:hover {
    color: var(--accent-hover);
    background: none;
  }

  main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  /* Always-visible strip so the sidebar toggle is reachable even when the
     sidebar itself is hidden — without this there'd be no way back in. */
  .topbar {
    flex-shrink: 0;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-color);
  }

  .sidebar-toggle {
    width: auto;
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
    border-radius: 6px;
  }

  .sidebar-toggle:hover {
    color: var(--text-primary);
    background: var(--bg-surface-hover);
  }

  .content {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
  }
</style>
