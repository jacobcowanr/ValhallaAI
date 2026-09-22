# Prompt — add drag & drop / paste screenshot attachments

Paste the block below into an agent (or into a fresh session) to add image
attachments to a chat UI that talks to multiple LLM providers. Written from
the working implementation in ValhallaAI on 2026-09-22; every payload shape
and pitfall below was verified against a live API, not recalled.

**Date:** 09.22.2026

---

```
TASK: Add screenshot attachments to the chat UI — file picker, drag & drop,
and clipboard paste (Cmd/Ctrl+V) — so the attached image is actually read by
the model.

WHY: this app is used mainly for schoolwork, so a large part of chat traffic
is screenshots. Dragging one in has to work, and it has to work whichever
provider is selected.

REQUIREMENTS

1. ONE INGEST PATH. Write a single function, e.g.
   `ingestImageFiles(files: File[], fallbackName: string)`, and call it from
   all three entry points: the file-picker input, the drop handler, and the
   paste handler. Do not write three loops — they drift, and the drop path is
   the one that gets forgotten when a limit changes. `fallbackName` covers
   images that arrive with no filename (a clipboard paste has none).

2. DATA MODEL. The chat message type gains:
     images?: string[]   // data URLs: "data:image/png;base64,...."
   Only messages that actually carry images should change shape; leave
   text-only messages as plain strings.

3. DRAG AND DROP
   - Attach the handlers to the whole chat container, not just the input.
   - dragover MUST call preventDefault(); otherwise the browser refuses the
     drop and may navigate to the file, losing the session.
   - Use a DEPTH COUNTER for dragenter/dragleave, not a boolean: those events
     fire for every child element the pointer crosses, so a boolean flickers
     the overlay off while the pointer is still inside the zone.
   - Ignore drags that are not files: check `e.dataTransfer.types.includes("Files")`.
   - The drop overlay must be `pointer-events: none`, or it steals the
     dragover/drop events the drop zone needs and the drop is never handled.

4. PASTE. Read `e.clipboardData.items`, keep items where
   `kind === "file" && type.startsWith("image/")`, map through `getAsFile()`,
   and only then `preventDefault()` — so a normal text paste still reaches the
   textarea. On macOS a copied screenshot is clipboard image data, not a file,
   which makes this the fastest path for exactly the screenshots this app
   gets.

5. PER-PROVIDER ENCODING. This is the part that is easy to get wrong. Images
   must be encoded in each provider's own shape; there is no single format.
   Parse the data URL once (`/^data:([^;,]+);base64,(.*)$/`) and emit per
   provider:

   - OpenAI-compatible dialect (and anything else accepting that content
     array, e.g. MiniMax and Qwen): content becomes an array —
       [{type:"text", text}, {type:"image_url", image_url:{url}}]
     The data URL goes in `url` whole.
   - Google Gemini (generateContent): parts array —
       {inlineData: {mimeType: "image/png", data: "<raw base64>"}}
     camelCase `inlineData`/`mimeType`, and the data URL prefix MUST be
     stripped. (Verified live; the model answered correctly.)
   - Anthropic: content blocks —
       {type:"image", source:{type:"base64", media_type:"image/png", data:"<raw base64>"}}
     `media_type` + raw base64; the data URL prefix MUST be stripped.
   - Ollama (/api/chat): a top-level `images` array of raw base64 strings on
     the message, NOT the OpenAI content array.

6. NEVER SILENTLY DROP AN IMAGE. Gate the UI on a capability set
   (`providerSupportsImages(providerId)`) checked before the attachment is
   added and before Send. If a provider cannot receive images, say so in the
   UI. Attaching an image and quietly not sending it is worse than refusing.
   Providers with no field for an image in their request body (text-to-output
   endpoints taking a single `prompt`/`inputs` string, and agent-CLI paths
   that build one text prompt) must be listed as NOT capable with the reason
   recorded in a comment.

7. TYPED BOUNDARIES. If any request crosses a typed boundary (Rust/serde,
   protobuf, a strict client), that type must accept BOTH forms — a plain
   string AND the content-block array. A field typed as `String` will reject
   every image payload with a serde/type error before the request is ever
   sent.

8. A TURN WITH AN IMAGE AND NO TEXT IS VALID. Do not filter out empty-text
   turns when mapping history: a screenshot dropped with no caption still
   carries the image. Filtering on `content.trim().length > 0` silently drops
   it.

9. SIZE. Base64 inflates by ~33%. Cap per image client-side (12 MB is
   reasonable for retina screenshots) and fail with a message that names the
   file and the limit, rather than letting the send fail later.

VERIFY (do not skip — UI-only checks prove nothing here)

- Generate a test PNG whose content you know (e.g. a black square on white).
- Drop it in and send "What shape is in this image? One word."
- ASSERT THE MODEL'S ANSWER NAMES THE SHAPE. This is the only check that
  proves the image actually arrived and was readable; a chip on screen proves
  only that the UI stored a blob.
- Also check: the drop overlay appears on dragenter and clears on drop; the
  thumbnail renders; paste from the clipboard attaches; switching to a
  non-capable provider shows the warning instead of silently sending.
- Note for whoever writes the test: Playwright's `dispatch_event` CANNOT build
  a ClipboardEvent — it falls back to a plain Event and `clipboardData` is
  dropped (confirm with a probe listener before blaming the app). Construct
  the real `ClipboardEvent` inside the page and dispatch that instead.
```