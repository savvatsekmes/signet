use crate::crypto::shamir;
use crate::state::AppState;
use crate::vault::format;
use crate::vault::manifest::VaultMeta;
use base64::{engine::general_purpose, Engine as _};
use tauri::State;

const MIN_REQUIRED: u8 = 2;
const MAX_TOTAL: u8 = 7;

fn require_path_and_key(state: &AppState) -> Result<(String, [u8; 32]), String> {
    let path = state
        .vault_path
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .ok_or("Vault is not unlocked")?;
    let key = state
        .key
        .lock()
        .map_err(|_| "State lock poisoned")?
        .ok_or("Vault is not unlocked")?;
    Ok((path, key))
}

#[tauri::command]
pub async fn configure_shamir(
    total: u8,
    required: u8,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if required < MIN_REQUIRED {
        return Err(format!("Required must be at least {}", MIN_REQUIRED));
    }
    if total > MAX_TOTAL {
        return Err(format!("Total cannot exceed {}", MAX_TOTAL));
    }
    if required > total {
        return Err("Required cannot exceed total".to_string());
    }
    let (path, key) = require_path_and_key(&state)?;
    let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
    manifest.shamir_config.total = total;
    manifest.shamir_config.required = required;
    // Config change invalidates any prior shards.
    for b in manifest.beneficiaries.iter_mut() {
        b.shard_index = None;
    }
    manifest.shards.clear();
    format::save_vault(&path, &key, manifest)?;
    Ok(())
}

/// Generate fresh shards for the current shamir_config and assign indices to beneficiaries
/// in their current order. Returns the base64 shard strings (same order as beneficiaries).
/// Any beneficiaries beyond `total` get no shard. card_printed is reset to false because
/// previously printed cards no longer match the new shards.
#[tauri::command]
pub async fn generate_shards(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let (path, key) = require_path_and_key(&state)?;
    let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
    let total = manifest.shamir_config.total;
    let required = manifest.shamir_config.required;
    if required < MIN_REQUIRED || total > MAX_TOTAL || required > total {
        return Err("Invalid Shamir configuration".to_string());
    }
    if manifest.beneficiaries.is_empty() {
        return Err("Add at least one beneficiary before generating shards".to_string());
    }

    let raw_shards = shamir::split_key(&key, total, required);
    let encoded: Vec<String> = raw_shards
        .iter()
        .map(|s| general_purpose::STANDARD.encode(s))
        .collect();

    manifest.shards = encoded.clone();
    let beneficiary_count = manifest.beneficiaries.len();
    for (idx, b) in manifest.beneficiaries.iter_mut().enumerate() {
        if idx < total as usize {
            b.shard_index = Some(idx as u8);
        } else {
            b.shard_index = None;
        }
        b.card_printed = false;
    }
    format::save_vault(&path, &key, manifest)?;

    // Return the slice of shards corresponding to beneficiaries (in beneficiary order).
    let returned: Vec<String> = encoded
        .into_iter()
        .take(beneficiary_count.min(total as usize))
        .collect();
    Ok(returned)
}

/// Standalone recovery flow: caller provides K base64 shards and a vault path.
/// Reconstructs the master key, decrypts the vault, populates app state.
#[tauri::command]
pub async fn reconstruct_from_shards(
    shards: Vec<String>,
    vault_path: String,
    state: State<'_, AppState>,
) -> Result<VaultMeta, String> {
    if shards.is_empty() {
        return Err("Provide at least one shard".to_string());
    }
    let raw: Vec<Vec<u8>> = shards
        .iter()
        .map(|s| general_purpose::STANDARD.decode(s.trim()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "One or more shards are not valid base64")?;

    // We don't yet know the required threshold — read it from the vault file's manifest after
    // a tentative reconstruction. The vault's plaintext header doesn't carry it, so we
    // optimistically use shards.len() as required and let recover() decide if we have enough.
    let required = raw.len() as u8;
    let key = crate::crypto::shamir::reconstruct_key(raw, required)?;

    let manifest = match format::unlock_with_key(&vault_path, &key) {
        Ok(m) => m,
        Err(e) => return Err(e),
    };
    let meta = manifest.to_meta();

    *state.key.lock().unwrap() = Some(key);
    *state.vault_path.lock().unwrap() = Some(vault_path);
    *state.manifest.lock().unwrap() = Some(manifest);
    Ok(meta)
}
