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
            anthropic_messages
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
