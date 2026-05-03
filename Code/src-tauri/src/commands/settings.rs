use crate::state::AppState;
use crate::vault::format;
use std::fs;
use std::path::Path;
use tauri::State;
use zeroize::Zeroize;

fn config_dir() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Cannot resolve executable path: {}", e))?;
    Ok(exe
        .parent()
        .ok_or("Executable has no parent directory")?
        .to_path_buf())
}

#[tauri::command]
pub async fn change_master_password(
    old_password: String,
    new_password: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = state
        .vault_path
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .ok_or("Vault is not unlocked")?;
    let new_key = format::change_master_password(&path, &old_password, &new_password)?;
    {
        let mut k = state.key.lock().map_err(|_| "State lock poisoned")?;
        if let Some(ref mut existing) = *k {
            existing.zeroize();
        }
        *k = Some(new_key);
    }
    Ok(())
}

/// Open the system file explorer with the given file selected (Windows),
/// revealed in Finder (macOS), or with the containing folder opened (Linux).
#[tauri::command]
pub async fn show_in_file_explorer(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("That file no longer exists".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        // explorer.exe /select,"<path>" highlights the file inside its folder.
        let arg = format!("/select,{}", path);
        std::process::Command::new("explorer.exe")
            .arg(arg)
            .spawn()
            .map_err(|e| format!("Failed to open File Explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        let parent = p
            .parent()
            .ok_or("File has no parent directory")?
            .to_path_buf();
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn change_vault_location(
    new_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let old_path = state
        .vault_path
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .ok_or("Vault is not unlocked")?;
    let old = Path::new(&old_path);
    let new = Path::new(&new_path);
    if old == new {
        return Ok(());
    }
    if new.exists() {
        return Err("A file already exists at the new location".to_string());
    }
    // Try a rename first (cheap when same volume); fall back to copy + delete.
    if fs::rename(old, new).is_err() {
        fs::copy(old, new).map_err(|e| format!("Move failed: {}", e))?;
        fs::remove_file(old).map_err(|e| format!("Move (cleanup) failed: {}", e))?;
    }
    *state.vault_path.lock().map_err(|_| "State lock poisoned")? = Some(new_path.clone());
    let cfg = config_dir()?.join("last_vault.txt");
    let _ = fs::write(&cfg, &new_path);
    Ok(())
}

#[tauri::command]
pub async fn delete_vault(state: State<'_, AppState>) -> Result<(), String> {
    let path = state
        .vault_path
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .ok_or("Vault is not unlocked")?;
    state.clear();
    fs::remove_file(&path).map_err(|e| format!("Delete failed: {}", e))?;
    let cfg = config_dir()?.join("last_vault.txt");
    if cfg.exists() {
        let _ = fs::remove_file(&cfg);
    }
    Ok(())
}
