use serde::{Deserialize, Serialize};

/// Endpoint expected to return JSON of shape:
///   { "version": "1.2.3", "url": "https://signetvault.com/download", "notes": "..." }
/// Replace this URL with the real one when releases go live.
const UPDATE_URL: &str = "https://signetvault.com/version.json";

#[derive(Deserialize)]
struct Release {
    version: String,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    notes: Option<String>,
}

#[derive(Serialize)]
pub struct UpdateInfo {
    current_version: String,
    latest_version: String,
    update_available: bool,
    download_url: Option<String>,
    notes: Option<String>,
    checked_at: String,
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn check_for_update() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let result = tokio::task::spawn_blocking(move || -> Result<Release, String> {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(std::time::Duration::from_secs(8))
            .timeout_read(std::time::Duration::from_secs(8))
            .build();
        let resp = agent
            .get(UPDATE_URL)
            .set("User-Agent", "Signet/1.0")
            .call()
            .map_err(|e| format!("Cannot reach update server: {}", e))?;
        let release: Release = resp
            .into_json()
            .map_err(|e| format!("Invalid response from update server: {}", e))?;
        Ok(release)
    })
    .await
    .map_err(|e| format!("Update check task error: {}", e))??;

    let update_available = is_newer(&result.version, &current);
    Ok(UpdateInfo {
        current_version: current,
        latest_version: result.version,
        update_available,
        download_url: if update_available { result.url } else { None },
        notes: if update_available { result.notes } else { None },
        checked_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Naive semver compare — `a > b` returns true. Trailing components missing on
/// either side are treated as 0.
fn is_newer(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.trim_start_matches('v')
            .split(|c: char| c == '.' || c == '-')
            .filter_map(|p| p.parse::<u32>().ok())
            .collect()
    };
    let av = parse(a);
    let bv = parse(b);
    let len = av.len().max(bv.len());
    for i in 0..len {
        let ax = av.get(i).copied().unwrap_or(0);
        let bx = bv.get(i).copied().unwrap_or(0);
        if ax != bx {
            return ax > bx;
        }
    }
    false
}
