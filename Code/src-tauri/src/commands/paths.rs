use std::path::PathBuf;

/// Directory for small config files (last_vault.txt, skipped_update.txt).
///
/// Windows keeps the historical "next to the .exe" layout so the portable
/// build stays portable. macOS uses ~/Library/Application Support/Signet,
/// since the binary lives inside a read-only .app bundle. Linux uses
/// $XDG_CONFIG_HOME/signet (default ~/.config/signet).
pub fn config_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let exe = std::env::current_exe()
            .map_err(|e| format!("Cannot resolve executable path: {}", e))?;
        Ok(exe
            .parent()
            .ok_or("Executable has no parent directory")?
            .to_path_buf())
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME")
            .map_err(|_| "HOME environment variable not set".to_string())?;
        let dir = PathBuf::from(home).join("Library/Application Support/Signet");
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
        Ok(dir)
    }
    #[cfg(target_os = "linux")]
    {
        let base = std::env::var("XDG_CONFIG_HOME")
            .ok()
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                let home = std::env::var("HOME").unwrap_or_default();
                PathBuf::from(home).join(".config")
            });
        let dir = base.join("signet");
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
        Ok(dir)
    }
}

/// Default path the "create vault" dialog suggests when no last_vault is set.
///
/// Windows: next to the binary, matching the portable model. macOS/Linux:
/// ~/Documents/Signet/vault.signet, so the file is discoverable, backup-friendly,
/// and not buried inside the .app bundle (which is read-only on macOS anyway).
pub fn default_vault_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let exe = std::env::current_exe()
            .map_err(|e| format!("Cannot resolve executable path: {}", e))?;
        Ok(exe
            .parent()
            .ok_or("Executable has no parent directory")?
            .join("vault.signet"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME")
            .map_err(|_| "HOME environment variable not set".to_string())?;
        let dir = PathBuf::from(home).join("Documents/Signet");
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create vault directory: {}", e))?;
        Ok(dir.join("vault.signet"))
    }
}
