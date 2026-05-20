use serde::{Deserialize, Serialize};

/// GitHub Releases API — returns the latest published (non-draft, non-prerelease)
/// release for the repo. Change the path here if you fork the repo.
const UPDATE_URL: &str =
    "https://api.github.com/repos/savvatsekmes/signet/releases/latest";

/// Preferred asset filename. If GitHub lists an asset with this exact name we
/// link to its direct download URL; otherwise we fall back to the release page.
const PREFERRED_ASSET: &str = "Signet.exe";

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    assets: Vec<GithubAsset>,
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
    let release = tokio::task::spawn_blocking(move || -> Result<GithubRelease, String> {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(std::time::Duration::from_secs(8))
            .timeout_read(std::time::Duration::from_secs(8))
            .build();
        let resp = agent
            .get(UPDATE_URL)
            // GitHub requires a User-Agent on every request.
            .set("User-Agent", "Signet-Updater")
            .set("Accept", "application/vnd.github+json")
            .call()
            .map_err(|e| format!("Cannot reach GitHub: {}", e))?;
        resp.into_json::<GithubRelease>()
            .map_err(|e| format!("Invalid response from GitHub: {}", e))
    })
    .await
    .map_err(|e| format!("Update check task error: {}", e))??;

    // Strip the conventional leading "v" from tags (v1.2.3 → 1.2.3) before comparing.
    let latest_version = release.tag_name.trim_start_matches(['v', 'V']).to_string();
    let update_available = is_newer(&latest_version, &current);

    // Prefer the portable .exe if it's published as an asset; else fall back to the release page.
    let download_url = if update_available {
        let direct = release
            .assets
            .iter()
            .find(|a| a.name.eq_ignore_ascii_case(PREFERRED_ASSET))
            .map(|a| a.browser_download_url.clone());
        Some(direct.unwrap_or(release.html_url.clone()))
    } else {
        None
    };

    let notes = if update_available {
        release.body.or(release.name)
    } else {
        None
    };

    Ok(UpdateInfo {
        current_version: current,
        latest_version,
        update_available,
        download_url,
        notes,
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
