use crate::state::AppState;
use crate::vault::{format, manifest::VaultMeta};
use tauri::State;

#[tauri::command]
pub async fn create_vault(
    password: String,
    path: String,
    display_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<VaultMeta, String> {
    format::create_vault(&path, &password)?;
    if let Some(name) = display_name.as_deref() {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            format::write_display_name(&path, trimmed)?;
        }
    }
    let (manifest, key) = format::unlock_vault(&path, &password)?;
    let meta = manifest.to_meta();
    *state.key.lock().unwrap() = Some(key);
    *state.vault_path.lock().unwrap() = Some(path);
    *state.manifest.lock().unwrap() = Some(manifest);
    Ok(meta)
}

#[tauri::command]
pub async fn unlock_vault(
    password: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<VaultMeta, String> {
    let (manifest, key) = format::unlock_vault(&path, &password)?;
    let meta = manifest.to_meta();
    *state.key.lock().unwrap() = Some(key);
    *state.vault_path.lock().unwrap() = Some(path);
    *state.manifest.lock().unwrap() = Some(manifest);
    Ok(meta)
}

#[tauri::command]
pub async fn lock_vault(state: State<'_, AppState>) -> Result<(), String> {
    state.clear();
    Ok(())
}

#[tauri::command]
pub async fn vault_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

#[tauri::command]
pub async fn default_vault_path() -> Result<String, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Cannot resolve executable path: {}", e))?;
    let dir = exe
        .parent()
        .ok_or("Executable has no parent directory")?
        .to_path_buf();
    let vault = dir.join("vault.signet");
    Ok(vault.to_string_lossy().into_owned())
}

fn config_dir() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Cannot resolve executable path: {}", e))?;
    Ok(exe
        .parent()
        .ok_or("Executable has no parent directory")?
        .to_path_buf())
}

#[tauri::command]
pub async fn get_last_vault_path() -> Result<Option<String>, String> {
    let path = config_dir()?.join("last_vault.txt");
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed.to_string()))
    }
}

#[tauri::command]
pub async fn set_last_vault_path(path: String) -> Result<(), String> {
    let cfg = config_dir()?.join("last_vault.txt");
    std::fs::write(&cfg, path).map_err(|e| format!("Failed to save config: {}", e))?;
    Ok(())
}

/// Returns the version string the user previously chose to skip, if any.
#[tauri::command]
pub async fn get_skipped_update_version() -> Result<Option<String>, String> {
    let path = config_dir()?.join("skipped_update.txt");
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed.to_string()))
    }
}

/// Persist the version the user clicked "Skip" on; we'll stop nagging until a
/// newer version comes out. Pass an empty string to clear it.
#[tauri::command]
pub async fn set_skipped_update_version(version: String) -> Result<(), String> {
    let cfg = config_dir()?.join("skipped_update.txt");
    std::fs::write(&cfg, version).map_err(|e| format!("Failed to save config: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_display_name(path: String) -> Result<Option<String>, String> {
    format::read_display_name(&path)
}

#[derive(serde::Serialize)]
pub struct LockoutInfo {
    pub locked: bool,
    pub seconds_remaining: i64,
    pub failed_attempts: u8,
    pub attempts_before_lockout: u8,
    pub consecutive_lockouts: u8,
}

#[tauri::command]
pub async fn get_lockout_state(path: String) -> Result<LockoutInfo, String> {
    let s = format::read_lockout(&path)?;
    Ok(LockoutInfo {
        locked: s.is_locked(),
        seconds_remaining: s.seconds_remaining(),
        failed_attempts: s.failed_attempts,
        attempts_before_lockout: format::ATTEMPTS_BEFORE_LOCKOUT,
        consecutive_lockouts: s.consecutive_lockouts,
    })
}

#[tauri::command]
pub async fn get_vault_meta(state: State<'_, AppState>) -> Result<VaultMeta, String> {
    let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
    Ok(manifest.to_meta())
}

#[tauri::command]
pub async fn set_display_name(
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = state
        .vault_path
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .ok_or("Vault is not unlocked")?;
    format::write_display_name(&path, name.trim())
}
