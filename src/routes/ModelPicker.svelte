<script lang="ts">
  import { onMount } from "svelte";
  import {
    callLLM,
    providerSupportsImages,
    type LLMProvider,
  } from "../lib/llm-router";
  import {
    FALLBACK_PROVIDER,
    FALLBACK_MODEL,
    allProviderEntries,
    isCustomProviderId,
    isKnownProvider,
    providerModels,
    providerName,
  } from "../lib/providers";
  import { loadEnvProviderKeys, resolveApiKey } from "../lib/provider-keys";
  import { scopedKey } from "../lib/profiles";
  import { sessions, activeSessionId, createSession, appendToSession } from "../lib/sessions";

  // Passed down from App.svelte rather than imported directly here, so
  // there's one import of the logo asset, not one per place it's shown.
  export let logoWordmark: string;

  interface AttachedImage {
    name: string;
    dataUrl: string;
  }

  let selectedProvider: string = FALLBACK_PROVIDER;
  let selectedModel: string = FALLBACK_MODEL;
  let apiKey = "";
  let userMessage = "";
  let loading = false;

  // Messages now live in the sessions store (src/lib/sessions.ts), not
  // local component state — previously `responses` was ephemeral, lost on
  // every tab switch or restart, with no way to have more than one
  // conversation. Read-only here; sendMessage() below writes through
  // appendToSession() instead of mutating an array directly.
  $: responses = $sessions.find((s) => s.id === $activeSessionId)?.messages ?? [];

  // Copy-to-clipboard for individual messages.
  //
  // Uses the plain web clipboard API, not `@tauri-apps/api/clipboard`: the
  // Tauri allowlist is `{"all": false}`, so the built-in clipboard module is
  // not enabled, and turning it on would mean an allowlist change plus a
  // rebuild for something the webview can already do. The execCommand branch
  // is the fallback for a non-secure context, where navigator.clipboard is
  // undefined.
  //
  // Keyed by index rather than a message id because ChatMessage has no id and
  // adding one would change the persisted session shape. The 1.5s reset makes
  // a stale index harmless.
  let copiedIndex: number | null = null;
  let copyResetTimer: ReturnType<typeof setTimeout>;

  async function copyMessage(text: string, index: number): Promise<void> {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        const scratch = document.createElement("textarea");
        scratch.value = text;
        scratch.setAttribute("readonly", "");
        scratch.style.position = "fixed";
        scratch.style.opacity = "0";
        document.body.appendChild(scratch);
        scratch.select();
        ok = document.execCommand("copy");
        document.body.removeChild(scratch);
      }
    } catch {
      ok = false;
    }

    copiedIndex = ok ? index : null;
    clearTimeout(copyResetTimer);
    if (ok) copyResetTimer = setTimeout(() => (copiedIndex = null), 1500);
  }

  // Text attachments are a separate list from images because they take a
  // completely different path: images ride along as multimodal content on the
  // 9 providers that support it, while file text is inlined into the prompt
  // and therefore works on every provider.
  interface AttachedFile {
    /** Relative path for a folder pick, bare filename for a single file. */
    path: string;
    text: string;
    bytes: number;
  }

  // Caps exist so a stray click on a big folder cannot lock the UI or blow
  // the context window. Skipped files are reported, never dropped silently.
  const MAX_FILE_BYTES = 256 * 1024;
  const MAX_TOTAL_BYTES = 1024 * 1024;
  const MAX_FILES = 40;
  // Images go to the provider inline, so the ceiling is the provider's, not
  // ours. Retina screenshots land around 1-3 MB; 12 MB leaves room for a
  // full-screen capture on a large display while still catching a file that
  // was never going to be accepted — with a message that says so, rather
  // than a failure after the send.
  const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

  let attachedFiles: AttachedFile[] = [];
  let folderInput: HTMLInputElement;
  let anyFileInput: HTMLInputElement;

  $: attachedBytes = attachedFiles.reduce((sum, f) => sum + f.bytes, 0);

  function looksBinary(text: string): boolean {
    // A NUL in the first few KB is the cheapest reliable binary tell; real
    // source and config files never contain one.
    return text.slice(0, 4096).includes("\u0000");
  }

  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function ingestFiles(files: File[]): Promise<void> {
    const skipped: string[] = [];
    let total = attachedBytes;

    for (const file of files) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

      if (attachedFiles.length >= MAX_FILES) {
        skipped.push(`${rel} (over ${MAX_FILES}-file limit)`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        skipped.push(`${rel} (over 256 KB)`);
        continue;
      }
      if (total + file.size > MAX_TOTAL_BYTES) {
        skipped.push(`${rel} (would exceed the 1 MB total)`);
        continue;
      }

      let text: string;
      try {
        text = await readFileAsText(file);
      } catch {
        skipped.push(`${rel} (unreadable)`);
        continue;
      }
      if (looksBinary(text)) {
        skipped.push(`${rel} (binary)`);
        continue;
      }

      attachedFiles = [...attachedFiles, { path: rel, text, bytes: file.size }];
      total += file.size;
    }

    attachError = skipped.length
      ? `Skipped ${skipped.length} file${skipped.length > 1 ? "s" : ""}: ${skipped.slice(0, 4).join(", ")}${skipped.length > 4 ? "…" : ""}`
      : "";
  }

  function triggerFolderPicker(): void {
    closeAttachMenu();
    folderInput.click();
  }

  function triggerAnyFilePicker(): void {
    closeAttachMenu();
    anyFileInput.click();
  }

  async function handleTextFileSelect(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    await ingestFiles(Array.from(input.files));
    input.value = "";
  }

  const COMPOSER_MAX_HEIGHT = 200;

  /** Start at one line, grow with the text, then scroll at the cap.
   *
   * Halving the composer meant dropping to a single row, and a fixed
   * one-row box that cannot grow is worse than the two-row box it replaced --
   * anything past one line would scroll in a 44px slot. The parameter is the
   * bound value, so Svelte re-runs `update` when the text is cleared on send;
   * an input listener alone would miss that, because clearing it in code
   * fires no input event and the box would stay tall after sending.
   */
  function autosize(node: HTMLTextAreaElement, _value: string) {
    const resize = () => {
      node.style.height = "auto";
      node.style.height = `${Math.min(node.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
    };

    // The first measurement is deferred a frame on purpose. An action runs as
    // soon as the element is in the DOM, which in dev is before Vite has
    // injected the component's CSS -- so scrollHeight gets measured against an
    // unstyled textarea, comes back larger than the cap, and the box sticks at
    // 200px on a cold load with nothing typed in it. A frame later the styles
    // are applied and the measurement is real.
    requestAnimationFrame(resize);

    // The display font loads via the FontFace API after first paint, and a
    // metric change alters scrollHeight. Re-measure once it settles.
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(resize).catch(() => {});
    }

    node.addEventListener("input", resize);
    return {
      update: resize,
      destroy: () => node.removeEventListener("input", resize),
    };
  }

  function removeFile(index: number): void {
    attachedFiles = attachedFiles.filter((_, i) => i !== index);
    attachError = "";
  }

  /** Inline file contents ahead of the typed message. Delimited by path so
   * the model can tell where each one starts and stops. */
  function buildOutgoingText(typed: string): string {
    if (attachedFiles.length === 0) return typed;
    const blocks = attachedFiles
      .map((f) => `<file path="${f.path}">\n${f.text}\n</file>`)
      .join("\n\n");
    return `${blocks}\n\n${typed}`;
  }

  let attachedImages: AttachedImage[] = [];
  let attachMenuOpen = false;
  let fileInput: HTMLInputElement;
  let attachError = "";

  function apiKeyStorageKey(providerId: string): string {
    return scopedKey(`valhallaai-apikey-${providerId}`);
  }

  function loadApiKeyFor(providerId: string): void {
    // .env wins when the desktop app can read it. A key saved in Settings
    // is the fallback for providers that file does not cover.
    const stored = localStorage.getItem(apiKeyStorageKey(providerId)) || "";
    apiKey = resolveApiKey(providerId, stored);
  }

  function loadGlobalDefaultProviderModel(): { provider: string; model: string } {
    const prefs = localStorage.getItem(scopedKey("valhallaai-prefs"));
    if (prefs) {
      const { defaultProvider, defaultModel } = JSON.parse(prefs) as {
        defaultProvider?: string;
        defaultModel?: string;
      };
      // A previously-saved provider can disappear from the catalog (e.g. the
      // GitHub Copilot removal, or a custom provider the user deleted).
      // Falling back here instead of trusting the stored value keeps the
      // model dropdown from silently rendering empty and callLLM() from
      // failing with "Unknown provider" on every send.
      if (defaultProvider && isKnownProvider(defaultProvider)) {
        const models = providerModels(defaultProvider);
        return {
          provider: defaultProvider,
          model: defaultModel && models.includes(defaultModel) ? defaultModel : models[0],
        };
      }
    }
    return { provider: FALLBACK_PROVIDER, model: FALLBACK_MODEL };
  }

  // Single source of truth for what selectedProvider/selectedModel should
  // be: the active session's own provider/model if one exists (switching
  // to a past session restores what it was actually using), otherwise the
  // user's global default. Called once on mount AND every time the active
  // session id changes — both paths go through the same function instead
  // of two competing pieces of logic (which is what caused a real bug
  // here: onMount's prefs-load used to run after, and clobber, a separate
  // reactive block that restored the session's provider/model).
  function syncProviderModelToActiveSession(): void {
    const session = $sessions.find((s) => s.id === $activeSessionId);
    // A session can name a provider that is no longer available (the user
    // deleted a custom one). Check it still resolves before trusting it.
    if (session && isKnownProvider(session.provider)) {
      selectedProvider = session.provider;
      const models = providerModels(session.provider);
      selectedModel = models.includes(session.model) ? session.model : models[0];
    } else {
      const defaults = loadGlobalDefaultProviderModel();
      selectedProvider = defaults.provider;
      selectedModel = defaults.model;
    }
    loadApiKeyFor(selectedProvider);
  }

  onMount(async () => {
    await loadEnvProviderKeys();
    syncProviderModelToActiveSession();
  });

  let lastActiveSessionId: string | null = null;
  $: if ($activeSessionId !== lastActiveSessionId) {
    lastActiveSessionId = $activeSessionId;
    syncProviderModelToActiveSession();
  }

  // Re-load the saved key whenever the provider changes, so switching
  // providers doesn't leave the previous provider's key sitting around (or
  // silently send it to the wrong API).
  $: loadApiKeyFor(selectedProvider);

  // Reset the model only when the provider CHANGES and the current model is
  // not one of the new provider's. Without this, switching to a provider
  // whose model list doesn't include the current selection sends the old
  // model id to the new endpoint — which 404s. (Settings.svelte already had
  // this guard; the picker did not.)
  let lastProvider: string | null = null;
  $: if (selectedProvider && selectedProvider !== lastProvider) {
    const models = providerModels(selectedProvider);
    if (models.length > 0 && !models.includes(selectedModel)) {
      selectedModel = models[0];
    }
    lastProvider = selectedProvider;
  }

  // Live warning as soon as a provider switch makes existing attachments
  // unsendable — don't wait until the user hits Send to tell them.
  //
  // Derived rather than assigned into attachError: attachError also carries
  // ingest problems (an oversized image, a non-image file), and this block
  // re-runs and clears whatever it finds. Two sources, two variables; the
  // template shows whichever applies.
  $: imagesSupported = providerSupportsImages(selectedProvider);
  $: providerImageWarning =
    attachedImages.length > 0 && !imagesSupported
      ? `${providerName(selectedProvider)} doesn't support image attachments. Remove the image(s) or switch providers.`
      : "";

  function toggleAttachMenu(): void {
    attachMenuOpen = !attachMenuOpen;
  }

  function closeAttachMenu(): void {
    attachMenuOpen = false;
  }

  function triggerFilePicker(): void {
    closeAttachMenu();
    fileInput.click();
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelect(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    await ingestImageFiles(Array.from(files), "Image");
    input.value = ""; // allow re-selecting the same file
  }

  /**
   * One ingest path for every way an image arrives: the picker, a drop, and a
   * paste. Three near-identical loops is how the picker version and the drop
   * version drift apart, and the drag-and-drop path is the one that gets
   * forgotten when a limit changes.
   *
   * `fallbackName` covers images that arrive with no filename — a clipboard
   * paste has none.
   */
  async function ingestImageFiles(files: File[], fallbackName: string): Promise<void> {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const rejected = files.length - images.length;

    if (images.length === 0) {
      // A dropped PDF or .py lands here. Saying which path DOES handle it is
      // more useful than "unsupported file".
      attachError =
        rejected > 0
          ? "That is not an image — use Upload file instead, which inlines text files for the model."
          : "";
      return;
    }

    const added: AttachedImage[] = [];
    const problems: string[] = [];

    for (const file of images) {
      if (file.size > MAX_IMAGE_BYTES) {
        const mb = (file.size / 1024 / 1024).toFixed(1);
        problems.push(
          `${file.name || fallbackName} is ${mb} MB, over the ${MAX_IMAGE_BYTES / 1024 / 1024} MB image limit`
        );
        continue;
      }
      added.push({ name: file.name || fallbackName, dataUrl: await readFileAsDataUrl(file) });
    }

    if (added.length > 0) attachedImages = [...attachedImages, ...added];
    if (rejected > 0) {
      problems.push(`${rejected} non-image file${rejected > 1 ? "s" : ""} ignored`);
    }
    attachError = problems.length > 0 ? `${problems.join("; ")}.` : "";
  }

  // --- drag and drop --------------------------------------------------------
  // A depth counter, not a boolean: dragenter/dragleave fire for every child
  // element the pointer crosses, so a boolean flickers the overlay off while
  // the pointer is still inside the drop zone.
  let dragDepth = 0;
  let dragging = false;

  function handleDragEnter(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes("Files")) return;
    dragDepth += 1;
    dragging = true;
  }

  function handleDragOver(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes("Files")) return;
    // preventDefault is required or the browser refuses the drop and may
    // navigate to the file instead, which loses the session.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(): void {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragging = false;
  }

  async function handleDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    dragDepth = 0;
    dragging = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    await ingestImageFiles(files, "Dropped image");
  }

  /**
   * Paste a screenshot with Cmd/Ctrl+V. macOS puts a copied screenshot on the
   * clipboard as image data rather than a file, so for the screenshots this is
   * mostly used for, this is the fastest path there is. Text pastes are left
   * alone for the textarea to handle.
   */
  async function handlePaste(e: ClipboardEvent): Promise<void> {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length === 0) return;
    e.preventDefault();
    await ingestImageFiles(files, "Pasted image");
  }

  function removeAttachment(index: number): void {
    attachedImages = attachedImages.filter((_, i) => i !== index);
  }

  async function sendMessage(): Promise<void> {
    if (!userMessage.trim() && attachedImages.length === 0 && attachedFiles.length === 0) return;
    if (attachedImages.length > 0 && !imagesSupported) return; // attachError already shown

    loading = true;
    const imageUrls = attachedImages.map((img) => img.dataUrl);
    const imageCount = attachedImages.length;
    // What actually goes to the model: file contents inlined ahead of the
    // typed text. The session stores the typed text plus the file NAMES
    // instead of the full expansion -- same choice already made for images,
    // which store imageCount rather than the data URLs. A 40-file paste would
    // otherwise bury the transcript it is supposed to be a record of.
    const outgoingText = buildOutgoingText(userMessage);
    const fileNames = attachedFiles.map((f) => f.path);
    const typedText = userMessage;

    // A session gets created lazily, on the first message, rather than
    // requiring the "New Session" button first — the empty state's own
    // hint ("Send a message to start chatting") promises this works
    // without an extra click.
    let sessionId = $activeSessionId;
    if (!sessionId) {
      sessionId = createSession(selectedProvider, selectedModel);
    }

    // Send the FULL prior conversation as context, not just the new
    // message in isolation. Every message here used to go to the model
    // with zero memory of anything said before it, even mid-"session" —
    // that was true before sessions existed too, but it's a much more
    // visible gap now that there's an actual persisted conversation to
    // draw context from, so fixing it here rather than leaving sessions
    // as history-only-for-display.
    const priorTurns = responses.map((msg) => ({
      role: msg.type === "user" ? ("user" as const) : ("assistant" as const),
      content: msg.text,
    }));

    const response = await callLLM(
      {
        provider: selectedProvider,
        model: selectedModel,
        apiKey: apiKey,
      },
      [
        ...priorTurns,
        { role: "user", content: outgoingText, images: imageUrls.length > 0 ? imageUrls : undefined },
      ]
    );

    appendToSession(
      sessionId,
      [
        {
          type: "user",
          text: typedText,
          imageCount: imageCount > 0 ? imageCount : undefined,
          fileNames: fileNames.length > 0 ? fileNames : undefined,
        },
        {
          type: "assistant",
          text: response.success ? (response.content ?? "") : `Error: ${response.error}`,
          usage: response.usage,
        },
      ],
      selectedProvider,
      selectedModel
    );

    userMessage = "";
    attachedImages = [];
    attachedFiles = [];
    loading = false;
  }
</script>

<div
  class="screen"
  class:dragging
  role="region"
  aria-label="Chat — drop or paste screenshots to attach"
  on:dragenter={handleDragEnter}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  {#if dragging}
    <div class="drop-overlay">
      <div class="drop-card">
        <p class="drop-title">Drop screenshots to attach</p>
        <p class="drop-hint">
          {#if imagesSupported}
            {providerName(selectedProvider)} reads images — they go with your next message.
          {:else}
            {providerName(selectedProvider)} can't read images. Switch provider, or drop a
            text file and use Upload file instead.
          {/if}
        </p>
      </div>
    </div>
  {/if}

  <div class="messages">
    <div class="messages-inner">
      {#if responses.length === 0}
        <div class="empty-state">
          <img class="empty-logo" src={logoWordmark} alt="ValhallaAI" />
          <p class="tagline">Multi-agent orchestration • Model switching • Vault coordination</p>
          <p class="hint-primary">Send a message to start chatting.</p>
          {#if selectedProvider === "nous"}
            <p class="hint">
              Nous Portal uses the local Hermes proxy. Run <code>hermes portal</code> once, then leave
              <code>hermes proxy start</code> running. No API key.
            </p>
          {:else if selectedProvider === "claude_directsdk"}
            <p class="hint">
              Uses your Claude subscription through the <code>claude</code> CLI
              (<code>claude auth login</code>). Does not use the paid API key.
            </p>
          {:else if !apiKey && selectedProvider !== "ollama" && !isCustomProviderId(selectedProvider)}
            <p class="hint">
              No API key set for {providerName(selectedProvider)} yet — add one in
              <strong>⚙ Settings</strong>.
            </p>
          {/if}
        </div>
      {/if}
      {#each responses as msg, i}
        <div class="message {msg.type}">
          {#if msg.imageCount}
            <div class="attachment-note">📎 {msg.imageCount} image{msg.imageCount > 1 ? "s" : ""} attached</div>
          {/if}
          {#if msg.fileNames?.length}
            <div class="attachment-note" title={msg.fileNames.join("\n")}>
              📄 {msg.fileNames.length} file{msg.fileNames.length > 1 ? "s" : ""} inlined: {msg.fileNames.slice(0, 3).join(", ")}{msg.fileNames.length > 3 ? "…" : ""}
            </div>
          {/if}
          <div class="content">{msg.text}</div>
          <div class="message-footer">
            {#if msg.usage}
              <span class="usage">
                {msg.usage.inputTokens} in • {msg.usage.outputTokens} out
              </span>
            {/if}
            <button
              class="copy-btn"
              class:copied={copiedIndex === i}
              on:click={() => copyMessage(msg.text, i)}
              title="Copy this message"
              aria-label="Copy message to clipboard"
            >
              {copiedIndex === i ? "✓ Copied" : "⧉ Copy"}
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <div class="composer">
    <div class="composer-inner">
      {#if attachedImages.length > 0}
        <div class="attachments">
          {#each attachedImages as img, i}
            <div class="attachment-chip">
              <img src={img.dataUrl} alt={img.name} />
              <button class="remove-chip" on:click={() => removeAttachment(i)} title="Remove">✕</button>
            </div>
          {/each}
        </div>
      {/if}

      {#if attachedFiles.length > 0}
        <div class="file-chips">
          {#each attachedFiles as f, i}
            <span class="file-chip" title={f.path}>
              <span class="file-path">{f.path}</span>
              <button class="remove-chip" on:click={() => removeFile(i)} title="Remove">✕</button>
            </span>
          {/each}
          <span class="file-total">{attachedBytes < 1024 ? `${attachedBytes} B` : `${(attachedBytes / 1024).toFixed(0)} KB`} of 1 MB</span>
        </div>
      {/if}

      {#if providerImageWarning || attachError}
        <p class="attach-error">⚠ {providerImageWarning || attachError}</p>
      {/if}

      <div class="input-area">
        <div class="attach-wrapper">
          <button
            class="attach-btn"
            on:click={toggleAttachMenu}
            title="Attach"
            aria-haspopup="true"
            aria-expanded={attachMenuOpen}
          >
            +
          </button>
          {#if attachMenuOpen}
            <button class="menu-backdrop" on:click={closeAttachMenu} aria-label="Close menu"></button>
            <div class="attach-menu">
              <button class="attach-menu-item" on:click={triggerFilePicker}>
                <span class="menu-icon">🖼</span> Upload image{!imagesSupported ? " (not supported by this provider)" : ""}
              </button>
              <button class="attach-menu-item" on:click={triggerAnyFilePicker}>
                <span class="menu-icon">📄</span> Upload file
              </button>
              <button class="attach-menu-item" on:click={triggerFolderPicker}>
                <span class="menu-icon">📁</span> Upload folder
              </button>
            </div>
          {/if}
        </div>

        <input
          type="file"
          accept="image/*"
          multiple
          bind:this={fileInput}
          on:change={handleFileSelect}
          style="display: none;"
        />

        <!-- No accept filter: the binary check in ingestFiles() decides what
             is usable, which is more honest than an extension allowlist that
             would reject a perfectly readable file with an unusual suffix. -->
        <input
          type="file"
          multiple
          bind:this={anyFileInput}
          on:change={handleTextFileSelect}
          style="display: none;"
        />

        <!-- webkitdirectory goes through a spread rather than a plain
             attribute: it is non-standard, so written inline it trips
             svelte-check's DOM attribute validation. Spreading keeps it
             declarative -- an onMount assignment can silently not run. -->
        <input
          type="file"
          multiple
          {...{ webkitdirectory: true }}
          bind:this={folderInput}
          on:change={handleTextFileSelect}
          style="display: none;"
        />

        <textarea
          rows="1"
          use:autosize={userMessage}
          bind:value={userMessage}
          placeholder="Send a message... (drop or ⌘V a screenshot)"
          on:keydown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          on:paste={handlePaste}
        />
        <!-- Icon-only, so it carries an aria-label and a title: the arrow
             alone says nothing to a screen reader, and the previous "Send"
             text was doing that job implicitly. -->
        <button
          class="send-btn"
          on:click={sendMessage}
          disabled={loading || (attachedImages.length > 0 && !imagesSupported)}
          aria-label={loading ? "Sending" : "Send message"}
          title={loading ? "Sending…" : "Send message"}
        >
          {#if loading}
            <span class="send-spinner" aria-hidden="true"></span>
          {:else}
            <svg class="send-arrow" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 19V5M12 5l-6 6M12 5l6 6"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          {/if}
        </button>
      </div>
    </div>

    <div class="model-bar">
      <div class="picker">
        <label class="picker-label" for="model-bar-provider">Provider</label>
        <select id="model-bar-provider" bind:value={selectedProvider}>
          {#each allProviderEntries() as [key, { name }]}
            <option value={key}>{name}</option>
          {/each}
        </select>
      </div>

      <div class="picker">
        <label class="picker-label" for="model-bar-model">Model</label>
        <select id="model-bar-model" bind:value={selectedModel}>
          {#each providerModels(selectedProvider) as model}
            <option value={model}>{model}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    /* .content in App.svelte already has 2rem of padding; pull the composer
       out to the very edges so the model bar can span the full width. */
    margin: -2rem;
    padding: 2rem 2rem 0 2rem;
    /* Containing block for .drop-overlay, which is absolutely positioned so
       it never shifts the conversation while it is up. */
    position: relative;
  }

  /* Drag-and-drop feedback. pointer-events: none matters — the overlay appears
     under the pointer mid-drag, and if it took pointer events it would steal
     the dragover/drop events the drop zone needs, and the drop would land on
     the overlay instead of being handled. */
  .drop-overlay {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.62);
  }

  .drop-card {
    pointer-events: none;
    border: 2px dashed var(--accent);
    border-radius: 12px;
    padding: 1.5rem 2.5rem;
    text-align: center;
    background: rgba(13, 13, 13, 0.9);
  }

  .drop-title {
    margin: 0 0 0.4rem 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--accent);
  }

  .drop-hint {
    margin: 0;
    font-size: 0.82rem;
    max-width: 34ch;
    color: var(--text-muted);
  }

  /* Dashed edge around the whole drop zone, so the target is unambiguous
     rather than only implied by the card. */
  .screen.dragging {
    outline: 2px dashed var(--accent-soft-border);
    outline-offset: -8px;
  }

  /* Narrow, centered chat column — the background stays full-bleed dark,
     only the actual conversation content is constrained, similar to
     Gemini's centered input/conversation column. */
  .messages {
    flex: 1;
    overflow-y: auto;
    display: flex;
    justify-content: center;
  }

  /* One knob for the chat column width. Change here, both the message
     list and the composer follow. */
  .messages-inner {
    width: 100%;
    max-width: var(--chat-width, 680px);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-bottom: 1rem;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--text-secondary);
    min-height: 320px;
  }

  .empty-logo {
    height: 168px;
    width: auto;
    margin-bottom: 1.25rem;
  }

  .empty-state .tagline {
    margin: 0 0 2rem 0;
    font-size: 0.95rem;
    color: var(--text-secondary);
  }

  .empty-state .hint-primary {
    margin: 0 0 0.25rem 0;
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0.25rem 0;
  }

  .empty-state .hint {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .message {
    padding: 1rem 1.25rem;
    border-radius: 12px;
    background: var(--bg-surface);
    color: var(--text-primary);
    max-width: 85%;
    line-height: 1.6;
  }

  .message.user {
    align-self: flex-end;
    background: var(--accent);
    color: var(--accent-text);
  }

  .message.assistant {
    align-self: flex-start;
    border: 1px solid var(--border-color);
  }

  .attachment-note {
    font-size: 0.8rem;
    opacity: 0.85;
    margin-bottom: 0.35rem;
  }

  .content {
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Usage and the copy button share one row under the message body. The
     button sits at the end, so it lands in the same place whether or not a
     message reports token usage (user turns don't). */
  .message-footer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .usage {
    font-size: 0.8rem;
    color: var(--text-secondary);
    opacity: 0.8;
  }

  .message.user .usage {
    color: rgba(255, 255, 255, 0.75);
  }

  /* Always rendered, not hover-only: hover-only controls are unreachable by
     keyboard and invisible on touch. Low opacity keeps it quiet until the
     message is hovered or the button itself is focused. */
  .copy-btn {
    margin-left: auto;
    padding: 0.2rem 0.5rem;
    font-family: inherit;
    font-size: 0.75rem;
    line-height: 1.4;
    color: inherit;
    background: transparent;
    border: 1px solid currentColor;
    border-radius: 5px;
    opacity: 0.4;
    cursor: pointer;
    transition: opacity 0.15s ease, background 0.15s ease;
  }

  .message:hover .copy-btn,
  .copy-btn:focus-visible {
    opacity: 0.85;
  }

  .copy-btn:hover {
    opacity: 1;
    background: rgba(127, 127, 127, 0.16);
  }

  .copy-btn:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 1px;
  }

  .copy-btn.copied {
    opacity: 1;
    border-color: transparent;
    background: rgba(127, 127, 127, 0.2);
  }

  /* Everything below the message list: attachments, input row, then the
     horizontal provider/model bar underneath — pinned to the bottom of
     the screen, chat gets all the remaining (and dominant) vertical space. */
  .composer {
    flex-shrink: 0;
    border-top: 1px solid var(--border-color);
    background: var(--bg-surface);
  }

  .composer-inner {
    max-width: var(--chat-width, 680px);
    margin: 0 auto;
    padding: 1rem 2rem;
  }

  .attachments {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }

  .attachment-chip {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border-color);
  }

  .attachment-chip img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .remove-chip {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    font-size: 0.65rem;
    line-height: 1;
    cursor: pointer;
  }

  .file-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0 0;
  }

  .file-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    max-width: 260px;
    padding: 0.15rem 0.35rem 0.15rem 0.5rem;
    font-size: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    background: var(--bg-surface);
  }

  .file-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;  /* keep the filename visible when the path is truncated */
    text-align: left;
  }

  .file-total {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .attach-error {
    margin: 0 0 0.5rem 0;
    font-size: 0.8rem;
    color: var(--warning-text);
  }

  .input-area {
    display: flex;
    align-items: flex-end;
    gap: 0.6rem;
  }

  .attach-wrapper {
    position: relative;
  }

  .attach-btn {
    width: 40px;
    height: 40px;
    padding: 0;
    border-radius: 50%;
    background: var(--bg-surface-raised);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    font-size: 1.3rem;
    font-weight: 400;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .attach-btn:hover {
    background: var(--bg-surface-hover);
  }

  .menu-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    padding: 0;
    cursor: default;
    z-index: 5;
  }

  .attach-menu {
    position: absolute;
    bottom: 48px;
    left: 0;
    min-width: 240px;
    background: var(--bg-surface-raised);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    padding: 0.4rem;
    z-index: 10;
  }

  .attach-menu-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.6rem 0.75rem;
    background: none;
    border: none;
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
  }

  .attach-menu-item:hover {
    background: var(--bg-surface-hover);
  }

  .menu-icon {
    font-size: 1rem;
  }

  textarea {
    flex: 1;
    /* Without this the element is content-box, so assigning scrollHeight --
       which already includes padding -- to `height` adds the padding a second
       time and the box renders ~40px taller than requested. There is no
       global border-box reset in this app, so it is set here explicitly. */
    box-sizing: border-box;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.95rem;
    line-height: 1.4;
    resize: none;
    overflow-y: auto;
    /* Matches the send button's 44px so the two line up on one row. */
    min-height: 44px;
    max-height: 200px;
    background: var(--bg-surface-raised);
    color: var(--text-primary);
  }

  textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  /* Square icon button rather than a wide text button -- it gives the text
     box back roughly 70px of the column, which is most of what "narrower"
     was asking for. */
  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    background: var(--accent);
    color: var(--accent-text);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.2s;
    flex-shrink: 0;
    align-self: flex-end;
  }

  .send-arrow {
    width: 20px;
    height: 20px;
  }

  .send-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: send-spin 0.7s linear infinite;
  }

  @keyframes send-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Respect a reduced-motion preference: hold a static ring instead of
     spinning. The disabled state already signals that a send is in flight. */
  @media (prefers-reduced-motion: reduce) {
    .send-spinner {
      animation: none;
      border-top-color: currentColor;
      opacity: 0.6;
    }
  }

  .send-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* The horizontal provider/model bar — a slim strip along the very
     bottom of the window, distinct from the input row above it, and
     deliberately full-width (unlike the narrower chat column) since it
     reads as a footer/status bar. */
  .model-bar {
    display: flex;
    gap: 1.5rem;
    /* Sibling of .composer-inner, so it needs the cap applied here too --
       otherwise the selects run edge to edge beneath a centred text box and
       the composer stops reading as one column. */
    width: 100%;
    max-width: var(--chat-width, 680px);
    margin: 0 auto;
    padding: 0.6rem 0;
    border-top: 1px solid var(--border-color);
    background: var(--bg-surface-raised);
  }

  .picker {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .picker-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .picker select {
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 0.85rem;
    background: var(--bg-surface);
    color: var(--text-primary);
  }

  .picker select:focus {
    outline: none;
    border-color: var(--accent);
  }
</style>
