use crate::crypto::yubikey;
use crate::state::AppState;
use crate::vault::format;
use tauri::State;

/// True iff this vault file requires a YubiKey to unlock with a password.
/// Shamir reconstruction bypasses the YubiKey regardless.
#[tauri::command]
pub async fn vault_has_yubikey(path: String) -> Result<bool, String> {
    format::has_yubikey(&path)
}

/// Probe for a connected, FIDO2-capable YubiKey. Reported back so the UI can
/// disable the "Enable hardware key" button until a key is detected, without
/// the user having to guess what went wrong.
#[tauri::command]
pub async fn yubikey_is_present() -> Result<bool, String> {
    yubikey::is_present()
}

/// Enrol the currently-inserted YubiKey on the open vault. Requires the
/// master password to authorise the change. Re-encrypts the vault in place
/// and rotates the in-memory key.
#[tauri::command]
pub async fn yubikey_enable(
    password: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = state
        .vault_path
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .ok_or("Vault is not unlocked")?;

    // Perform the FIDO2 enrolment (touch prompt happens here).
    let enrollment = yubikey::enroll()?;
    let new_key = format::enable_yubikey(&path, &password, enrollment)?;
    *state.key.lock().map_err(|_| "State lock poisoned")? = Some(new_key);
    Ok(())
}

/// Remove the YubiKey requirement from the open vault. Requires the master
/// password AND a touch of the still-enrolled YubiKey to authorise.
#[tauri::command]
pub async fn yubikey_disable(
    password: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = state
        .vault_path
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .ok_or("Vault is not unlocked")?;

    let new_key = format::disable_yubikey(&path, &password)?;
    *state.key.lock().map_err(|_| "State lock poisoned")? = Some(new_key);
    Ok(())
}
