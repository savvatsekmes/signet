use crate::state::AppState;
use crate::vault::format;
use crate::vault::manifest::SeedEntry;
use tauri::State;

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

#[derive(serde::Deserialize)]
pub struct SeedInput {
    pub name: String,
    #[serde(default)]
    pub chain: String,
    #[serde(default)]
    pub wallet_type: String,
    pub seed_phrase: String,
    #[serde(default)]
    pub derivation_path: Option<String>,
    #[serde(default)]
    pub public_address: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

fn validate(input: &SeedInput) -> Result<(), String> {
    if input.name.trim().is_empty() {
        return Err("Name is required".to_string());
    }
    if input.seed_phrase.trim().is_empty() {
        return Err("Seed phrase is required".to_string());
    }
    Ok(())
}

fn opt(s: Option<String>) -> Option<String> {
    s.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

#[tauri::command]
pub async fn add_seed(
    input: SeedInput,
    state: State<'_, AppState>,
) -> Result<SeedEntry, String> {
    validate(&input)?;
    let now = chrono::Utc::now().to_rfc3339();
    let entry = SeedEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name.trim().to_string(),
        chain: input.chain.trim().to_string(),
        wallet_type: input.wallet_type.trim().to_string(),
        seed_phrase: input.seed_phrase.trim().to_string(),
        derivation_path: opt(input.derivation_path),
        public_address: opt(input.public_address),
        notes: opt(input.notes),
        created_at: now.clone(),
        updated_at: now,
    };
    let returned = entry.clone();
    let (path, key) = require_path_and_key(&state)?;
    {
        let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
        let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
        manifest.seeds.push(entry);
        format::save_vault(&path, &key, manifest)?;
    }
    Ok(returned)
}

#[tauri::command]
pub async fn update_seed(
    id: String,
    input: SeedInput,
    state: State<'_, AppState>,
) -> Result<SeedEntry, String> {
    validate(&input)?;
    let (path, key) = require_path_and_key(&state)?;
    let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
    let target = manifest
        .seeds
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or("Seed not found")?;
    target.name = input.name.trim().to_string();
    target.chain = input.chain.trim().to_string();
    target.wallet_type = input.wallet_type.trim().to_string();
    target.seed_phrase = input.seed_phrase.trim().to_string();
    target.derivation_path = opt(input.derivation_path);
    target.public_address = opt(input.public_address);
    target.notes = opt(input.notes);
    target.updated_at = chrono::Utc::now().to_rfc3339();
    let returned = target.clone();
    format::save_vault(&path, &key, manifest)?;
    Ok(returned)
}

#[tauri::command]
pub async fn delete_seed(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (path, key) = require_path_and_key(&state)?;
    let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
    let before = manifest.seeds.len();
    manifest.seeds.retain(|s| s.id != id);
    if manifest.seeds.len() == before {
        return Err("Seed not found".to_string());
    }
    format::save_vault(&path, &key, manifest)?;
    Ok(())
}

#[tauri::command]
pub async fn list_seeds(state: State<'_, AppState>) -> Result<Vec<SeedEntry>, String> {
    let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
    let mut list = manifest.seeds.clone();
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(list)
}
