// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod envfile;

use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(serde::Serialize)]
struct VaultStatus {
    files: Vec<String>,
    git_status: String,
    last_commit: String,
}

/// The file that identifies a ValhallaAI checkout. Everything project_root
/// hands back must contain it, so a stale or wrong candidate is rejected
/// rather than trusted.
const PROJECT_MARKER: &str = "docker-compose.local.yml";

/// Where the launcher records the project directory, so a bundled .app that
/// lives outside the checkout can still find it.
fn project_dir_pointer() -> Option<PathBuf> {
    let base = if cfg!(target_os = "macos") {
        PathBuf::from(std::env::var_os("HOME")?).join("Library/Application Support")
    } else if cfg!(target_os = "windows") {
        PathBuf::from(std::env::var_os("APPDATA")?)
    } else {
        match std::env::var_os("XDG_CONFIG_HOME") {
            Some(x) => PathBuf::from(x),
            None => PathBuf::from(std::env::var_os("HOME")?).join(".config"),
        }
    };
    Some(base.join("com.jacobcowan.valhallaai").join("project_dir"))
}

fn is_project(dir: &std::path::Path) -> bool {
    dir.join(PROJECT_MARKER).is_file()
}

/// Locate the ValhallaAI checkout.
///
/// This used to be `env!("CARGO_MANIFEST_DIR")` with a silent fallback to
/// `current_dir()`. Both halves were wrong for a bundled app: the manifest dir
/// is baked in at COMPILE time, so it points at whatever machine did the
/// build, and a double-clicked .app has `/` as its working directory. The
/// fallback therefore "succeeded" with a path containing no .env, no vault,
/// and no scripts -- so every backend feature quietly found an empty world
/// instead of reporting that it could not find the project.
///
/// Now it is a checked chain, every candidate validated against the marker
/// file, and a failure is an error the UI can surface:
///
/// 1. `VALHALLAAI_PROJECT_DIR` -- explicit override, wins over everything.
/// 2. The pointer file written by `scripts/valhallaai` -- this is what makes a
///    relocated .app work, since macOS `open` does not forward env vars.
/// 3. Walking up from the working directory -- covers `npm run tauri-dev` and
///    any run started from inside the checkout.
/// 4. `CARGO_MANIFEST_DIR` -- still correct for a dev build on the machine
///    that compiled it, kept as a last resort rather than a first choice.
fn project_root() -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("VALHALLAAI_PROJECT_DIR") {
        let dir = PathBuf::from(dir);
        if is_project(&dir) {
            return Ok(dir);
        }
        return Err(format!(
            "VALHALLAAI_PROJECT_DIR is set to {} but there is no {PROJECT_MARKER} there.",
            dir.display()
        ));
    }

    if let Some(pointer) = project_dir_pointer() {
        if let Ok(text) = fs::read_to_string(&pointer) {
            let dir = PathBuf::from(text.trim());
            // A pointer to a moved or deleted checkout falls through to the
            // remaining candidates instead of being taken on faith.
            if !dir.as_os_str().is_empty() && is_project(&dir) {
                return Ok(dir);
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        let mut here = cwd.as_path();
        loop {
            if is_project(here) {
                return Ok(here.to_path_buf());
            }
            match here.parent() {
                Some(parent) => here = parent,
                None => break,
            }
        }
    }

    let compiled = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    if is_project(&compiled) {
        return Ok(compiled);
    }

    Err(format!(
        "Could not locate the ValhallaAI project (no {PROJECT_MARKER} found). \
Run the app with `valhallaai`, which records the location, or set \
VALHALLAAI_PROJECT_DIR to the checkout."
    ))
}

/// Run one allowlisted agent once.
///
/// `runtime` is optional and only used for a user-defined agent, whose
/// display name is not one of the three built-ins. It is matched against the
/// same allowlist as `service`, and the allowlisted value -- not the name --
/// is what reaches the script. A custom agent therefore cannot run anything
/// the three built-in agents cannot already run.
///
/// `async` on purpose, and it is the difference between a working app and a
/// frozen one. Tauri runs a *synchronous* command on the main thread, so the
/// `.output()` below would block the webview for the entire agent run --
/// measured at 3.5 minutes for a real `grok-build` task, during which the
/// window could only be force-quit. An async command is handed to the async
/// runtime instead, off the main thread, so the UI keeps painting and the
/// card can show `running` while the agent works.
#[tauri::command]
async fn run_agent(service: String, runtime: Option<String>) -> Result<String, String> {
    let known = |name: &str| matches!(name, "claude-agent" | "hermes-agent" | "grok-build");

    // What actually gets executed. A built-in agent runs itself; a custom
    // agent runs the runtime it was bound to.
    let target = match runtime.as_deref() {
        Some(runtime) if known(runtime) => runtime.to_string(),
        Some(runtime) => return Err(format!("Unknown agent runtime: {runtime}")),
        None if known(&service) => service.clone(),
        None => return Err(format!("Unknown agent: {service}")),
    };

    let root = project_root()?;
    let script = root.join("scripts/run_agent.sh");
    let output = Command::new("bash")
        .arg(&script)
        .arg(&target)
        .current_dir(&root)
        .output()
        .map_err(|err| format!("Failed to start {}: {err}", script.display()))?;

    let mut text = String::new();
    text.push_str(&String::from_utf8_lossy(&output.stdout));
    if !output.stderr.is_empty() {
        if !text.is_empty() && !text.ends_with('\n') {
            text.push('\n');
        }
        text.push_str(&String::from_utf8_lossy(&output.stderr));
    }
    if text.len() > 4000 {
        text.truncate(4000);
        text.push_str("\n…(truncated)");
    }
    let text = text.trim().to_string();

    if output.status.success() {
        Ok(if text.is_empty() {
            format!("{service} exited 0")
        } else {
            text
        })
    } else {
        Err(if text.is_empty() {
            format!("{service} failed")
        } else {
            text
        })
    }
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AnthropicTurn {
    role: String,
    /// Either a plain string (a text-only turn) or Anthropic's content-block
    /// array, which is what a turn carrying images looks like. Held as a
    /// `Value` so `anthropic_messages` forwards exactly what the frontend
    /// built instead of Rust having to model every block variant — the
    /// `image` block with its base64 `source` then reaches the API intact.
    content: serde_json::Value,
}

impl AnthropicTurn {
    /// This turn's text, ignoring any image blocks.
    ///
    /// The subscription CLI path takes a single text prompt, so it can only
    /// use the text. Images are NOT silently dropped in the UI — that path is
    /// deliberately outside IMAGE_CAPABLE_PROVIDERS, so the app says so
    /// before an attachment is ever added.
    fn text(&self) -> String {
        match &self.content {
            serde_json::Value::String(text) => text.clone(),
            serde_json::Value::Array(blocks) => blocks
                .iter()
                .filter_map(|block| block.get("text").and_then(|text| text.as_str()))
                .collect::<Vec<_>>()
                .join("\n"),
            _ => String::new(),
        }
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnthropicRequest {
    api_key: String,
    model: String,
    max_tokens: Option<u32>,
    temperature: Option<f64>,
    messages: Vec<AnthropicTurn>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TokenUsage {
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatReply {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    usage: Option<TokenUsage>,
}

fn subscription_env() -> std::collections::HashMap<String, String> {
    let mut env: std::collections::HashMap<String, String> = std::env::vars().collect();
    for key in [
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_FOUNDRY_API_KEY",
        "CLAUDE_CODE_EXTRA_BODY",
        "CLAUDE_CODE_USE_BEDROCK",
        "CLAUDE_CODE_USE_VERTEX",
        "CLAUDE_CODE_USE_FOUNDRY",
    ] {
        env.remove(key);
    }
    env.insert("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC".into(), "1".into());
    env
}

fn claude_bin() -> String {
    std::env::var("CLAUDE_SUBSCRIPTION_DIRECTSDK_COMMAND").unwrap_or_else(|_| "claude".to_string())
}

/// The DirectSDK request shape. Deliberately **not** `AnthropicRequest`.
///
/// This path must never carry `apiKey`: the whole point of DirectSDK is that
/// it bills the Pro/Max subscription via `claude auth login`, not the paid
/// `ANTHROPIC_API_KEY` that the `anthropic` provider uses. Sharing
/// `AnthropicRequest` is exactly what broke this command — its `api_key` is a
/// required field, so serde rejected every call with `missing field apiKey`
/// before the CLI was ever spawned, even though the body below never reads it.
/// Do not "tidy" these two structs back into one.
///
/// `AnthropicTurn` is shared on purpose — it is only `{role, content}`, which
/// is what `toAnthropicMessages()` emits for both paths, and carries no key.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeSubscriptionRequest {
    model: String,
    messages: Vec<AnthropicTurn>,
}

/// Claude Pro/Max via the official `claude` CLI. The paid API key is removed
/// from the child environment so this cannot silently bill `ANTHROPIC_API_KEY`.
#[tauri::command]
fn claude_subscription(request: ClaudeSubscriptionRequest) -> ChatReply {
    let bin = claude_bin();
    let auth = Command::new(&bin)
        .args(["auth", "status"])
        .env_clear()
        .envs(subscription_env())
        .output();
    let auth_output = match auth {
        Ok(output) => output,
        Err(err) => {
            return ChatReply {
                success: false,
                content: None,
                error: Some(format!(
                    "Claude CLI is not installed ({err}). Install it with npm install -g @anthropic-ai/claude-code, then run claude auth login."
                )),
                usage: None,
            };
        }
    };
    let auth_text = String::from_utf8_lossy(&auth_output.stdout);
    let logged_in = serde_json::from_str::<serde_json::Value>(&auth_text)
        .ok()
        .and_then(|value| value.get("loggedIn").and_then(|flag| flag.as_bool()))
        .unwrap_or(false);
    if !logged_in {
        return ChatReply {
            success: false,
            content: None,
            error: Some(
                "Claude CLI is not logged in. Run `claude auth login` in a terminal, then try again. This does not use the API key."
                    .to_string(),
            ),
            usage: None,
        };
    }

    let mut prompt = String::from(
        "You are answering inside ValhallaAI. Reply to the latest user message. Do not use tools.\n\n",
    );
    for turn in &request.messages {
        let speaker = if turn.role == "assistant" { "Assistant" } else { "User" };
        prompt.push_str(speaker);
        prompt.push_str(": ");
        prompt.push_str(&turn.text());
        prompt.push_str("\n\n");
    }

    let dir = std::env::temp_dir().join(format!(
        "valhallaai-claude-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    if let Err(err) = fs::create_dir_all(&dir) {
        return ChatReply {
            success: false,
            content: None,
            error: Some(format!("Could not create a private working directory: {err}")),
            usage: None,
        };
    }

    let mut child = match Command::new(&bin)
        .args([
            "-p",
            "--model",
            &request.model,
            "--output-format",
            "text",
            "--permission-mode",
            "dontAsk",
            "--permission-prompts",
            "none",
            "--no-session-persistence",
            "--disable-slash-commands",
            "--setting-sources",
            "",
        ])
        .current_dir(&dir)
        .env_clear()
        .envs(subscription_env())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            let _ = fs::remove_dir_all(&dir);
            return ChatReply {
                success: false,
                content: None,
                error: Some(format!("Could not start the Claude CLI: {err}")),
                usage: None,
            };
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(prompt.as_bytes());
    }
    let finished = std::thread::spawn(move || child.wait_with_output());
    let output = match finished.join() {
        Ok(Ok(output)) => output,
        Ok(Err(err)) => {
            let _ = fs::remove_dir_all(&dir);
            return ChatReply {
                success: false,
                content: None,
                error: Some(format!("Claude CLI failed: {err}")),
                usage: None,
            };
        }
        Err(_) => {
            let _ = fs::remove_dir_all(&dir);
            return ChatReply {
                success: false,
                content: None,
                error: Some("Claude CLI thread failed".to_string()),
                usage: None,
            };
        }
    };
    let _ = fs::remove_dir_all(&dir);

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        let detail = if stderr.is_empty() { stdout } else { stderr };
        return ChatReply {
            success: false,
            content: None,
            error: Some(if detail.is_empty() {
                format!("Claude CLI exited {}", output.status)
            } else {
                detail.chars().take(500).collect()
            }),
            usage: None,
        };
    }
    if stdout.is_empty() {
        return ChatReply {
            success: false,
            content: None,
            error: Some("Claude CLI returned no text".to_string()),
            usage: None,
        };
    }
    ChatReply {
        success: true,
        content: Some(stdout),
        error: None,
        usage: None,
    }
}

/// Anthropic calls go out from this process. The webview's own fetch is
/// rejected ("Load failed") because the window sends an Origin header.
#[tauri::command]
fn anthropic_messages(request: AnthropicRequest) -> ChatReply {
    let body = serde_json::json!({
        "model": request.model,
        "max_tokens": request.max_tokens.unwrap_or(2048),
        "temperature": request.temperature.unwrap_or(0.7),
        "messages": request.messages,
    });
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(90))
        .build();
    let response = agent
        .post("https://api.anthropic.com/v1/messages")
        .set("x-api-key", &request.api_key)
        .set("anthropic-version", "2023-06-01")
        .set("content-type", "application/json")
        .send_json(body);

    let (status, text) = match response {
        Ok(resp) => (resp.status(), resp.into_string().unwrap_or_default()),
        Err(ureq::Error::Status(code, resp)) => (code, resp.into_string().unwrap_or_default()),
        Err(err) => {
            return ChatReply {
                success: false,
                content: None,
                error: Some(err.to_string()),
                usage: None,
            };
        }
    };

    let parsed: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
    if !(200..300).contains(&status) {
        let message = parsed
            .pointer("/error/message")
            .and_then(|value| value.as_str())
            .unwrap_or("Anthropic request failed")
            .to_string();
        return ChatReply {
            success: false,
            content: None,
            error: Some(format!("HTTP {status}: {message}")),
            usage: None,
        };
    }

    let content = parsed
        .get("content")
        .and_then(|value| value.as_array())
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|block| block.get("text").and_then(|text| text.as_str()))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    if content.is_empty() {
        return ChatReply {
            success: false,
            content: None,
            error: Some("Anthropic returned no text".to_string()),
            usage: None,
        };
    }
    let input_tokens = parsed.pointer("/usage/input_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let output_tokens = parsed.pointer("/usage/output_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    ChatReply {
        success: true,
        content: Some(content),
        error: None,
        usage: Some(TokenUsage {
            input_tokens,
            output_tokens,
        }),
    }
}

/// Keys for the chat providers only. Discord, GitHub, and the other names
/// in .env are not returned.
// ---------------------------------------------------------------------------
// Google sign-in (OAuth 2.0 + PKCE, RFC 8252)
// ---------------------------------------------------------------------------
//
// Identity only. This attaches a name, email, and avatar to a LOCAL profile.
// ValhallaAI has no backend, so there is nothing to authorize against and
// nothing syncs -- the only network traffic is the handshake itself.
//
// Deliberately NOT keeping the access or refresh token. Nothing in this app
// calls a Google API, so storing one would be holding a credential for no
// reason. The three display fields are read out of the id_token and the rest
// is dropped.
//
// Why a Rust command instead of doing this in the webview: a desktop client
// cannot keep a secret, so the flow is PKCE with a loopback redirect
// (RFC 8252 §7.3). That needs a real listener on 127.0.0.1, which the webview
// cannot open. The Tauri allowlist stays {"all": false} -- no `http` or
// `shell` entries are enabled for this.

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct GoogleIdentity {
    email: String,
    name: String,
    avatar_url: String,
    /// From the id_token's `email_verified` claim. Google sets this false
    /// only in edge cases (e.g. some unverified Workspace setups), so it is
    /// surfaced rather than enforced -- refusing sign-in on it would risk
    /// locking out the account's real owner over a claim this app did not
    /// ask Google to guarantee.
    email_verified: bool,
}

fn b64url(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// OS entropy. These are anti-CSRF and anti-interception values, so a
/// time-seeded PRNG would defeat the point of using them at all.
fn random_b64(len: usize) -> Result<String, String> {
    let mut buf = vec![0u8; len];
    getrandom::getrandom(&mut buf).map_err(|e| format!("Could not generate secure random bytes: {e}"))?;
    Ok(b64url(&buf))
}

fn percent_encode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn open_in_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(url);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", url]);
        c
    };
    #[cfg(target_os = "linux")]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(url);
        c
    };
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open a browser for sign-in: {e}"))
}

/// Pull one query parameter out of a raw `GET /?a=b&c=d HTTP/1.1` line.
fn query_param(request_line: &str, key: &str) -> Option<String> {
    let target = request_line.split_whitespace().nth(1)?;
    let query = target.split_once('?')?.1;
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=')?;
        if k == key {
            // Google returns these percent-encoded; only %XX and + appear.
            let mut out = Vec::new();
            let bytes = v.as_bytes();
            let mut i = 0;
            while i < bytes.len() {
                match bytes[i] {
                    b'+' => {
                        out.push(b' ');
                        i += 1;
                    }
                    b'%' if i + 2 < bytes.len() => {
                        let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
                        out.push(u8::from_str_radix(hex, 16).ok()?);
                        i += 3;
                    }
                    b => {
                        out.push(b);
                        i += 1;
                    }
                }
            }
            return String::from_utf8(out).ok();
        }
    }
    None
}

#[tauri::command]
fn google_sign_in(client_id: String) -> Result<GoogleIdentity, String> {
    use sha2::{Digest, Sha256};
    use std::io::{Read, Write};
    use std::net::TcpListener;

    if client_id.trim().is_empty() {
        return Err(
            "No Google client id. Set VITE_GOOGLE_CLIENT_ID in .env (see env.example), then restart the dev server."
                .to_string(),
        );
    }

    let verifier = random_b64(64)?;
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    let state = random_b64(32)?;

    // Port 0 = let the OS pick a free one. Google allows any loopback port
    // for a Desktop client, so the redirect URI does not need registering.
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Could not open a local port for the sign-in redirect: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Could not read the local redirect port: {e}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth\
?client_id={}&redirect_uri={}&response_type=code&scope={}\
&code_challenge={}&code_challenge_method=S256&state={}&prompt=select_account",
        percent_encode(&client_id),
        percent_encode(&redirect_uri),
        percent_encode("openid email profile"),
        percent_encode(&challenge),
        percent_encode(&state),
    );

    open_in_browser(&auth_url)?;

    // Non-blocking accept loop so a user who closes the browser tab gets a
    // timeout instead of wedging the command thread forever.
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Could not configure the redirect listener: {e}"))?;
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(180);

    let (code, returned_state) = loop {
        if std::time::Instant::now() > deadline {
            return Err("Sign-in timed out after 3 minutes. Nothing was changed.".to_string());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).unwrap_or(0);
                let request = String::from_utf8_lossy(&buf[..n]);
                let line = request.lines().next().unwrap_or("").to_string();

                let err = query_param(&line, "error");
                let body = if err.is_some() {
                    "<h2>Sign-in cancelled</h2><p>You can close this tab and return to ValhallaAI.</p>"
                } else {
                    "<h2>Signed in</h2><p>You can close this tab and return to ValhallaAI.</p>"
                };
                let _ = stream.write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    )
                    .as_bytes(),
                );
                let _ = stream.flush();

                if let Some(e) = err {
                    // The overwhelmingly common cause, worth naming outright:
                    // the consent screen is in Testing and this account is not
                    // on the test-user list.
                    if e == "access_denied" {
                        return Err(
                            "Google returned access_denied. If the OAuth consent screen is still in Testing, add this Google account under Audience > Test users, then try again."
                                .to_string(),
                        );
                    }
                    return Err(format!("Google returned an error: {e}"));
                }

                let code = query_param(&line, "code")
                    .ok_or_else(|| "The redirect carried no authorization code.".to_string())?;
                let got_state = query_param(&line, "state").unwrap_or_default();
                break (code, got_state);
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(120));
            }
            Err(e) => return Err(format!("Sign-in redirect failed: {e}")),
        }
    };

    // Constant-time comparison is unnecessary here (a mismatch is fatal and
    // leaks nothing), but the check itself is not optional -- without it the
    // callback is forgeable.
    if returned_state != state {
        return Err("Sign-in state mismatch — the response did not match this request. Nothing was changed.".to_string());
    }

    // Google's "Desktop app" client type still requires client_secret at the
    // token endpoint, even though PKCE is in use and the value ships inside
    // the app. That is Google's documented behaviour for installed apps, not
    // a true RFC 8252 public client -- their own installed-app flow includes
    // it. Without it the endpoint answers 400 invalid_client.
    //
    // Read from .env HERE, in the Rust process, rather than through a VITE_
    // variable: anything with a VITE_ prefix is inlined into the JS bundle.
    // It is a low-value secret by design, but there is no reason to copy it
    // somewhere it does not need to be.
    let client_secret =
        envfile::value(&project_root()?.join(".env"), "GOOGLE_CLIENT_SECRET").unwrap_or_default();

    let mut form: Vec<(&str, &str)> = vec![
        ("client_id", client_id.as_str()),
        ("code", code.as_str()),
        ("code_verifier", verifier.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri.as_str()),
    ];
    if !client_secret.is_empty() {
        form.push(("client_secret", client_secret.as_str()));
    }

    let token_response = match ureq::post("https://oauth2.googleapis.com/token").send_form(&form) {
        Ok(response) => response,
        // A 4xx from an OAuth token endpoint always carries a JSON body naming
        // the cause. Surfacing only the status code (as this did originally)
        // throws away the one piece of information that makes the failure
        // diagnosable, so the body is read and reported.
        Err(ureq::Error::Status(code, response)) => {
            let body = response.into_string().unwrap_or_default();
            let parsed: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
            let kind = parsed.get("error").and_then(|v| v.as_str()).unwrap_or("");
            let detail = parsed
                .get("error_description")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            // Google answers a missing secret with invalid_request, not
            // invalid_client, so match on the empty-secret condition first
            // rather than on the error code -- the code varies, the cause
            // does not.
            let hint = match kind {
                _ if client_secret.is_empty() && detail.contains("client_secret") => {
                    " -- GOOGLE_CLIENT_SECRET is not set in .env. Google's Desktop app clients require it at the token endpoint even with PKCE. Add it (no VITE_ prefix -- it is read by the Rust process, not the bundle) and restart."
                }
                "invalid_client" if client_secret.is_empty() => {
                    " -- GOOGLE_CLIENT_SECRET is not set in .env. Google's Desktop app clients require it at the token endpoint even with PKCE."
                }
                "invalid_client" => " -- the client id and secret in .env do not match the same OAuth client.",
                "redirect_uri_mismatch" => " -- the loopback redirect was rejected; confirm the OAuth client's application type is Desktop app, not Web application.",
                "invalid_grant" => " -- the authorization code was already used or expired. Try signing in again.",
                _ => "",
            };
            return Err(format!(
                "Token exchange failed ({code} {kind}{}){hint}",
                if detail.is_empty() { String::new() } else { format!(": {detail}") }
            ));
        }
        Err(e) => return Err(format!("Token exchange failed: {e}")),
    };

    let token_json: serde_json::Value = token_response
        .into_json()
        .map_err(|e| format!("Token response was not JSON: {e}"))?;
    let id_token = token_json
        .get("id_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Token response carried no id_token.".to_string())?;

    // The id_token's signature is NOT verified here, deliberately. It came
    // straight from Google's token endpoint over TLS in the request above,
    // which is the case Google's own docs call out as not requiring local
    // signature validation. If this token ever starts arriving from anywhere
    // else -- a redirect fragment, a cached file, another process -- that
    // reasoning stops holding and the signature must be checked.
    let payload_b64 = id_token
        .split('.')
        .nth(1)
        .ok_or_else(|| "id_token was not a well-formed JWT.".to_string())?;
    let payload_bytes = {
        use base64::Engine;
        base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(payload_b64)
            .map_err(|e| format!("Could not decode the id_token payload: {e}"))?
    };
    let claims: serde_json::Value = serde_json::from_slice(&payload_bytes)
        .map_err(|e| format!("id_token payload was not JSON: {e}"))?;

    let claim = |key: &str| {
        claims
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };

    // Google sends this as a native JSON boolean. Some OIDC providers send
    // the string "true"/"false" instead, which is why both shapes are
    // handled here even though only the Google endpoint is ever the caller
    // today -- a provider-shape assumption that only holds for one provider
    // is the kind of thing that breaks quietly later.
    let email_verified = claims
        .get("email_verified")
        .map(|v| v.as_bool().unwrap_or_else(|| v.as_str() == Some("true")))
        .unwrap_or(false);

    // Without an email claim there is nothing to show and nothing that proves
    // who signed in, so this fails loudly rather than returning empty strings
    // and leaving the UI in a half-signed-in state that looks like a no-op.
    let email = claim("email");
    if email.is_empty() {
        return Err(
            "Google returned no email claim. Confirm the consent screen requests the `email` scope, then sign in again."
                .to_string(),
        );
    }

    Ok(GoogleIdentity {
        email,
        name: claim("name"),
        avatar_url: claim("picture"),
        email_verified,
    })
}

#[tauri::command]
fn provider_keys() -> Result<std::collections::HashMap<String, String>, String> {
    let path = project_root()?.join(".env");
    if !path.is_file() {
        return Ok(std::collections::HashMap::new());
    }
    envfile::provider_keys(&path)
}

/// What is in vault/ and whether git sees changes there. No path argument,
/// so the screen cannot point git at another directory. Does not pull or push.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentInfo {
    name: String,
    enabled: bool,
    /// Timestamp from the most recent outbox entry, or empty if never run.
    last_run: String,
    /// "OK" or "ERROR" from that same entry.
    last_status: String,
}

/// Real per-agent state, so the UI stops asserting things it has not checked.
///
/// The cards previously hardcoded "Never run" and a blurb claiming grok-agent
/// was disabled. Both were wrong: all three agents had run, and grok had since
/// been enabled in agents-config.json. Enabled state is read from that file and
/// last-run is recovered from each outbox, which is the durable record --
/// component state resets every launch, the outbox does not.
#[tauri::command]
fn agent_status() -> Result<Vec<AgentInfo>, String> {
    let vault = project_root()?.join("vault");

    let enabled_map: std::collections::HashMap<String, bool> =
        match fs::read_to_string(vault.join("agents-config.json")) {
            Ok(text) => serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| v.get("agents").and_then(|a| a.as_array().cloned()))
                .map(|agents| {
                    agents
                        .iter()
                        .filter_map(|a| {
                            let name = a.get("name")?.as_str()?.to_string();
                            let on = a.get("enabled").and_then(|e| e.as_bool()).unwrap_or(false);
                            Some((name, on))
                        })
                        .collect()
                })
                .unwrap_or_default(),
            // A missing or malformed config is not fatal here: the cards still
            // render, they just cannot claim anything about enabled state.
            Err(_) => std::collections::HashMap::new(),
        };

    let mut out = Vec::new();
    for name in ["claude-agent", "hermes-agent", "grok-build"] {
        let (last_run, last_status) = read_last_outbox_entry(&vault, name);
        out.push(AgentInfo {
            name: name.to_string(),
            enabled: enabled_map.get(name).copied().unwrap_or(true),
            last_run,
            last_status,
        });
    }
    Ok(out)
}

/// Pull the timestamp and status out of the LAST entry in an agent's outbox.
///
/// Entries are appended, so the file is scanned from the end and stops at the
/// first `## [timestamp] name` header. File mtime would be easier but wrong --
/// the relay rewrites these files when it folds them, which would report a
/// relay run as an agent run.
fn read_last_outbox_entry(vault: &std::path::Path, agent: &str) -> (String, String) {
    let path = vault.join(format!("AGENT_OUTBOX_{agent}.md"));
    let Ok(text) = fs::read_to_string(&path) else {
        return (String::new(), String::new());
    };

    let lines: Vec<&str> = text.lines().collect();
    for (i, line) in lines.iter().enumerate().rev() {
        let trimmed = line.trim();
        if !trimmed.starts_with("## [") {
            continue;
        }
        let Some(stamp) = trimmed.strip_prefix("## [").and_then(|r| r.split(']').next()) else {
            continue;
        };
        // Status sits a line or two below its own header.
        let status = lines
            .iter()
            .skip(i + 1)
            .take(3)
            .find_map(|l| l.trim().strip_prefix("- Status:"))
            .map(|v| v.trim().to_string())
            .unwrap_or_default();
        return (stamp.to_string(), status);
    }
    (String::new(), String::new())
}

/// Resolve an untrusted relative path against the vault directory, or refuse.
///
/// Extracted from `vault_file` so the guard itself is unit-testable -- a path
/// check that has never been run against a traversal attempt is a guard only
/// in the sense that someone wrote one.
fn resolve_vault_path(vault: &std::path::Path, path: &str) -> Result<PathBuf, String> {
    let vault_real = vault
        .canonicalize()
        .map_err(|err| format!("Could not resolve the vault directory: {err}"))?;

    // canonicalize() resolves `..` AND symlinks, so the comparison below sees
    // the true destination. Screening the raw string for ".." instead would
    // miss a symlink inside vault/ pointing somewhere else entirely.
    let real = vault
        .join(path)
        .canonicalize()
        .map_err(|err| format!("Could not open {path}: {err}"))?;

    if !real.starts_with(&vault_real) {
        return Err(format!("{path} is outside the vault directory."));
    }
    if !real.is_file() {
        return Err(format!("{path} is not a file."));
    }
    Ok(real)
}

/// Read one file out of `vault/` for the Vault Browser.
///
/// `path` arrives from the frontend, so it is untrusted input to a filesystem
/// read. Both guards below matter:
///
/// 1. `canonicalize()` resolves `..` segments AND symlinks, then the result is
///    checked to still sit under the canonicalized vault directory. Checking
///    the raw string for ".." instead would miss a symlink inside vault/
///    pointing at ~/.ssh, and would also reject legitimate paths.
/// 2. A size cap, so a huge or accidental binary cannot be pulled wholesale
///    into the webview.
#[tauri::command]
fn vault_file(path: String) -> Result<String, String> {
    const MAX_VAULT_FILE_BYTES: u64 = 2 * 1024 * 1024;

    let vault = project_root()?.join("vault");
    let real = resolve_vault_path(&vault, &path)?;

    let size = fs::metadata(&real)
        .map_err(|err| format!("Could not stat {path}: {err}"))?
        .len();
    if size > MAX_VAULT_FILE_BYTES {
        return Err(format!(
            "{path} is {:.1} MB, over the 2 MB view limit. Open it in an editor instead.",
            size as f64 / (1024.0 * 1024.0)
        ));
    }

    fs::read_to_string(&real).map_err(|err| {
        format!("Could not read {path} as text ({err}). It may be a binary file.")
    })
}

#[tauri::command]
fn vault_status() -> Result<VaultStatus, String> {
    let root = project_root()?;
    let vault = root.join("vault");
    let mut files = Vec::new();
    if vault.is_dir() {
        let mut pending = vec![vault.clone()];
        while let Some(dir) = pending.pop() {
            let entries = fs::read_dir(&dir).map_err(|err| format!("Could not read {}: {err}", dir.display()))?;
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }
                if path.is_dir() {
                    pending.push(path);
                } else if let Ok(rel) = path.strip_prefix(&vault) {
                    files.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
    files.sort();

    let status = Command::new("git")
        .args(["status", "--short", "--", "vault"])
        .current_dir(&root)
        .output();
    let git_status = match status {
        Ok(output) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if text.is_empty() {
                "clean".to_string()
            } else {
                text
            }
        }
        Ok(output) => String::from_utf8_lossy(&output.stderr).trim().to_string(),
        Err(err) => format!("git status failed: {err}"),
    };

    let logged = Command::new("git")
        .args(["log", "-1", "--format=%ci", "--", "vault/AGENT_SYNC.md"])
        .current_dir(&root)
        .output();
    let last_commit = match logged {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout).trim().to_string(),
        _ => String::new(),
    };

    Ok(VaultStatus {
        files,
        git_status,
        last_commit,
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            run_agent,
            provider_keys,
            vault_status,
            vault_file,
            agent_status,
            anthropic_messages,
            google_sign_in,
            claude_subscription
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod project_root_tests {
    use super::{is_project, PROJECT_MARKER};
    use std::fs;

    fn scratch(with_marker: bool) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "valhallaai-rootest-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(dir.join("src-tauri")).unwrap();
        if with_marker {
            fs::write(dir.join(PROJECT_MARKER), "services: {}\n").unwrap();
        }
        dir
    }

    /// The whole point of the marker: a directory that merely exists is not a
    /// project. The old code accepted current_dir() unconditionally, which is
    /// how a double-clicked .app ended up treating "/" as the checkout.
    #[test]
    fn a_directory_without_the_marker_is_not_a_project() {
        let dir = scratch(false);
        assert!(!is_project(&dir));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_directory_with_the_marker_is_a_project() {
        let dir = scratch(true);
        assert!(is_project(&dir));
        let _ = fs::remove_dir_all(&dir);
    }

    /// "/" must never validate. This is the exact path a bundled app falls
    /// back to, and the bug being fixed here.
    #[test]
    fn filesystem_root_is_never_a_project() {
        assert!(!is_project(std::path::Path::new("/")));
    }

    /// A pointer file left behind by a moved or deleted checkout must not be
    /// taken on faith -- the resolver validates before trusting it.
    #[test]
    fn a_stale_pointer_target_does_not_validate() {
        let dir = scratch(true);
        let path = dir.clone();
        let _ = fs::remove_dir_all(&dir);
        assert!(!is_project(&path));
    }

    /// Walking up from a nested directory finds the checkout; this is the
    /// branch that covers `npm run tauri-dev`, whose cwd is src-tauri.
    #[test]
    fn walking_up_from_a_subdirectory_finds_the_marker() {
        let dir = scratch(true);
        let nested = dir.join("src-tauri");
        let mut here = nested.as_path();
        let mut found = None;
        loop {
            if is_project(here) {
                found = Some(here.to_path_buf());
                break;
            }
            match here.parent() {
                Some(parent) => here = parent,
                None => break,
            }
        }
        assert_eq!(found.as_deref(), Some(dir.as_path()));
        let _ = fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod outbox_tests {
    use super::read_last_outbox_entry;
    use std::fs;

    fn write_outbox(agent: &str, body: &str) -> std::path::PathBuf {
        let base = std::env::temp_dir().join(format!(
            "valhallaai-outboxtest-{}-{}",
            agent,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&base).unwrap();
        fs::write(base.join(format!("AGENT_OUTBOX_{agent}.md")), body).unwrap();
        base
    }

    /// The real claude outbox holds three appended entries; the card must show
    /// the LAST one, not the first. Getting this backwards would report a
    /// stale ERROR next to a run that actually succeeded.
    #[test]
    fn takes_the_most_recent_entry_not_the_first() {
        let body = "## [2026-09-22T05:23:42.484Z] claude-agent\n- Status: ERROR\n- Error: boom\n\n\
## [2026-09-22T05:34:05.992Z] claude-agent\n- Status: OK\n- Response: hi\n\n\
## [2026-09-22T05:34:56.783Z] claude-agent\n- Status: OK\n- Response: hi again\n";
        let base = write_outbox("claude-agent", body);
        let (stamp, status) = read_last_outbox_entry(&base, "claude-agent");
        assert_eq!(stamp, "2026-09-22T05:34:56.783Z");
        assert_eq!(status, "OK");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn reads_an_error_status() {
        let body = "## [2026-09-22T05:24:07.516Z] grok-build\n- Status: ERROR\n- Error: no key\n";
        let base = write_outbox("grok-build", body);
        let (stamp, status) = read_last_outbox_entry(&base, "grok-build");
        assert_eq!(stamp, "2026-09-22T05:24:07.516Z");
        assert_eq!(status, "ERROR");
        let _ = fs::remove_dir_all(&base);
    }

    /// Never run: no outbox file at all. Must be empty, not a panic.
    #[test]
    fn missing_outbox_is_empty_not_an_error() {
        let base = std::env::temp_dir().join("valhallaai-outboxtest-absent");
        let _ = fs::create_dir_all(&base);
        let (stamp, status) = read_last_outbox_entry(&base, "nobody-agent");
        assert_eq!(stamp, "");
        assert_eq!(status, "");
    }

    /// An outbox the relay has folded and cleared is empty, which is also
    /// "nothing to report" rather than a parse failure.
    #[test]
    fn cleared_outbox_is_empty() {
        let base = write_outbox("hermes-agent", "");
        let (stamp, status) = read_last_outbox_entry(&base, "hermes-agent");
        assert_eq!(stamp, "");
        assert_eq!(status, "");
        let _ = fs::remove_dir_all(&base);
    }
}

#[cfg(test)]
mod vault_path_tests {
    use super::resolve_vault_path;
    use std::fs;

    /// Builds a temp tree:  root/vault/ok.md  and  root/secret.txt
    fn fixture() -> std::path::PathBuf {
        let base = std::env::temp_dir().join(format!(
            "valhallaai-vaulttest-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(base.join("vault")).unwrap();
        fs::write(base.join("vault").join("ok.md"), "hello").unwrap();
        fs::write(base.join("secret.txt"), "do not read").unwrap();
        base
    }

    #[test]
    fn reads_a_file_inside_the_vault() {
        let base = fixture();
        assert!(resolve_vault_path(&base.join("vault"), "ok.md").is_ok());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_parent_traversal() {
        let base = fixture();
        let err = resolve_vault_path(&base.join("vault"), "../secret.txt").unwrap_err();
        assert!(err.contains("outside the vault"), "unexpected error: {err}");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_a_symlink_escaping_the_vault() {
        let base = fixture();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(base.join("secret.txt"), base.join("vault").join("link.txt"))
                .unwrap();
            let err = resolve_vault_path(&base.join("vault"), "link.txt").unwrap_err();
            assert!(err.contains("outside the vault"), "unexpected error: {err}");
        }
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_a_directory() {
        let base = fixture();
        fs::create_dir_all(base.join("vault").join("sub")).unwrap();
        let err = resolve_vault_path(&base.join("vault"), "sub").unwrap_err();
        assert!(err.contains("not a file"), "unexpected error: {err}");
        let _ = fs::remove_dir_all(&base);
    }
}
