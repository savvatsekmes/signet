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

/// Does the inserted YubiKey have a PIN configured? UI uses this to decide
/// whether to show a PIN field. Cheap probe — no touch required.
#[tauri::command]
pub async fn yubikey_requires_pin() -> Result<bool, String> {
    yubikey::requires_pin()
}

/// Enrol the currently-inserted YubiKey on the open vault. Requires the
/// master password to authorise the change. Re-encrypts the vault in place
/// and rotates the in-memory key.
///
/// `pin` is optional. If the device has a PIN set and none is supplied, the
/// inner FIDO2 call returns the ERR_PIN_REQUIRED sentinel and the UI knows
/// to pop a PIN field.
#[tauri::command]
pub async fn yubikey_enable(
    password: String,
    pin: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = state
        .vault_path
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .ok_or("Vault is not unlocked")?;

    // Perform the FIDO2 enrolment (touch prompt happens here).
    let enrollment = yubikey::enroll(pin.as_deref())?;
    let new_key = format::enable_yubikey(&path, &password, enrollment)?;
    *state.key.lock().map_err(|_| "State lock poisoned")? = Some(new_key);
    Ok(())
}

/// Remove the YubiKey requirement from the open vault. Requires the master
/// password AND a touch of the still-enrolled YubiKey to authorise.
#[tauri::command]
pub async fn yubikey_disable(
    password: String,
    pin: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = state
        .vault_path
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .ok_or("Vault is not unlocked")?;

    let new_key = format::disable_yubikey(&path, &password, pin.as_deref())?;
    *state.key.lock().map_err(|_| "State lock poisoned")? = Some(new_key);
    Ok(())
}
