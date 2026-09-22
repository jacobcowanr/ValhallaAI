// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command;

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_agent])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
