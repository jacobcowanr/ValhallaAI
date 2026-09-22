use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Provider ids the chat UI can select, and the .env name that holds each key.
/// Anything else in the file (Discord, GitHub, Cloudflare, and so on) is
/// never returned.
const PROVIDER_ENV: &[(&str, &str)] = &[
    ("ANTHROPIC_API_KEY", "anthropic"),
    ("OPENAI_API_KEY", "chatgpt"),
    ("OPENROUTER_API_KEY", "openrouter"),
    ("GOOGLE_API_KEY", "google"),
    ("XAI_API_KEY", "xai_grok"),
];

/// Parse a .env file into raw NAME -> value pairs. Shared by the provider-key
/// filter below and by single-value lookups like the Google client secret.
pub fn parse(text: &str) -> HashMap<String, String> {
    let mut raw: HashMap<String, String> = HashMap::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || !line.contains('=') {
            continue;
        }
        let (key, value) = line.split_once('=').unwrap();
        let key = key.trim();
        if key.is_empty() || key.chars().any(char::is_whitespace) {
            continue;
        }
        let mut value = value.trim();
        if value.len() >= 2 {
            let bytes = value.as_bytes();
            let quote = bytes[0];
            if (quote == b'"' || quote == b'\'') && bytes[value.len() - 1] == quote {
                value = &value[1..value.len() - 1];
            }
        }
        if !value.is_empty() {
            raw.insert(key.to_string(), value.to_string());
        }
    }
    raw
}

/// Read one named value out of a .env file. Returns None when the file or the
/// key is absent. Used for secrets that must NOT reach the frontend bundle --
/// anything read here stays in the Rust process.
pub fn value(path: &Path, key: &str) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    parse(&text).remove(key)
}

pub fn provider_keys_from_str(text: &str) -> HashMap<String, String> {
    let raw = parse(text);

    let mut out = HashMap::new();
    for (env_name, provider_id) in PROVIDER_ENV {
        if let Some(value) = raw.get(*env_name) {
            out.insert((*provider_id).to_string(), value.clone());
        }
    }
    out
}

pub fn provider_keys(path: &Path) -> Result<HashMap<String, String>, String> {
    let text = fs::read_to_string(path).map_err(|err| format!("Could not read {}: {err}", path.display()))?;
    Ok(provider_keys_from_str(&text))
}

#[cfg(test)]
mod tests {
    use super::provider_keys_from_str;

    #[test]
    fn keeps_provider_keys_and_drops_everything_else() {
        let text = "\
# comment
ANTHROPIC_API_KEY=anthropic-value
OPENAI_API_KEY=
GOOGLE_API_KEY=\"google-value\"
DISCORD_BOT_TOKEN=discord-value
GITHUB_TOKEN=github-value
API CREDENTIALS
";
        let keys = provider_keys_from_str(text);
        assert_eq!(keys.get("anthropic").map(String::as_str), Some("anthropic-value"));
        assert_eq!(keys.get("google").map(String::as_str), Some("google-value"));
        assert!(!keys.contains_key("chatgpt"));
        assert!(!keys.values().any(|value| value.contains("discord") || value.contains("github")));
    }
}
