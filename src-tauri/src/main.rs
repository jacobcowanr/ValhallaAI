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

fn project_root() -> PathBuf {
    let compiled = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    if compiled.join("docker-compose.local.yml").is_file() {
        return compiled;
    }
    std::env::current_dir().unwrap_or(compiled)
}

/// Run one allowlisted agent once. The name is matched before it is passed
/// to the script, so this cannot shell out to an arbitrary command.
#[tauri::command]
fn run_agent(service: String) -> Result<String, String> {
    match service.as_str() {
        "claude-agent" | "hermes-agent" | "grok-agent" => {}
        _ => return Err(format!("Unknown agent: {service}")),
    }

    let root = project_root();
    let script = root.join("scripts/run_agent.sh");
    let output = Command::new("bash")
        .arg(&script)
        .arg(&service)
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
    content: String,
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
        prompt.push_str(&turn.content);
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
        envfile::value(&project_root().join(".env"), "GOOGLE_CLIENT_SECRET").unwrap_or_default();

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
    })
}

#[tauri::command]
fn provider_keys() -> Result<std::collections::HashMap<String, String>, String> {
    let path = project_root().join(".env");
    if !path.is_file() {
        return Ok(std::collections::HashMap::new());
    }
    envfile::provider_keys(&path)
}

/// What is in vault/ and whether git sees changes there. No path argument,
/// so the screen cannot point git at another directory. Does not pull or push.
#[tauri::command]
fn vault_status() -> Result<VaultStatus, String> {
    let root = project_root();
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
            anthropic_messages,
            google_sign_in,
            claude_subscription
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
