use crate::state::AppState;
use crate::vault::format;
use crate::vault::manifest::Beneficiary;
use tauri::State;

const VALID_ACCESS: &[&str] = &[
    "documents",
    "passwords",
    "crypto",
    "personal",
    "images",
];

fn check_access(access: &[String]) -> Result<(), String> {
    for a in access {
        if !VALID_ACCESS.contains(&a.as_str()) {
            return Err(format!("Unknown access category: {}", a));
        }
    }
    Ok(())
}

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
pub async fn add_beneficiary(
    name: String,
    email: String,
    access: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Beneficiary, String> {
    let trimmed_name = name.trim().to_string();
    if trimmed_name.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    check_access(&access)?;

    let beneficiary = Beneficiary {
        id: uuid::Uuid::new_v4().to_string(),
        name: trimmed_name,
        email: email.trim().to_string(),
        shard_index: None,
        access,
        card_printed: false,
    };
    let returned = beneficiary.clone();

    let (path, key) = require_path_and_key(&state)?;
    {
        let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
        let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
        manifest.beneficiaries.push(beneficiary);
        // Adding a beneficiary invalidates existing shards (the split must be redone).
        for b in manifest.beneficiaries.iter_mut() {
            b.shard_index = None;
        }
        manifest.shards.clear();
        format::save_vault(&path, &key, manifest)?;
    }

    Ok(returned)
}

#[tauri::command]
pub async fn update_beneficiary(
    id: String,
    name: Option<String>,
    email: Option<String>,
    access: Option<Vec<String>>,
    card_printed: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Some(ref a) = access {
        check_access(a)?;
    }
    if let Some(ref n) = name {
        if n.trim().is_empty() {
            return Err("Name cannot be empty".to_string());
        }
    }

    let (path, key) = require_path_and_key(&state)?;
    let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
    let target = manifest
        .beneficiaries
        .iter_mut()
        .find(|b| b.id == id)
        .ok_or("Beneficiary not found")?;
    if let Some(n) = name {
        target.name = n.trim().to_string();
    }
    if let Some(e) = email {
        target.email = e.trim().to_string();
    }
    if let Some(a) = access {
        target.access = a;
    }
    if let Some(c) = card_printed {
        target.card_printed = c;
    }
    format::save_vault(&path, &key, manifest)?;
    Ok(())
}

#[tauri::command]
pub async fn remove_beneficiary(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (path, key) = require_path_and_key(&state)?;
    let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
    let before = manifest.beneficiaries.len();
    manifest.beneficiaries.retain(|b| b.id != id);
    if manifest.beneficiaries.len() == before {
        return Err("Beneficiary not found".to_string());
    }
    // Removing a beneficiary invalidates shards (assignment changes).
    for b in manifest.beneficiaries.iter_mut() {
        b.shard_index = None;
    }
    manifest.shards.clear();
    format::save_vault(&path, &key, manifest)?;
    Ok(())
}

#[tauri::command]
pub async fn list_beneficiaries(
    state: State<'_, AppState>,
) -> Result<Vec<Beneficiary>, String> {
    let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
    Ok(manifest.beneficiaries.clone())
}
