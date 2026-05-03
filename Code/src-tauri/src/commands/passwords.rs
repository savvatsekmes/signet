use crate::state::AppState;
use crate::vault::format;
use crate::vault::manifest::PasswordEntry;
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
pub struct PasswordInput {
    pub name: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub totp_secret: Option<String>,
}

fn validate(input: &PasswordInput) -> Result<(), String> {
    if input.name.trim().is_empty() {
        return Err("Name is required".to_string());
    }
    if input.password.is_empty() {
        return Err("Password is required".to_string());
    }
    Ok(())
}

fn normalize_url(raw: Option<String>) -> Option<String> {
    raw.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn normalize_optional(raw: Option<String>) -> Option<String> {
    raw.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

#[tauri::command]
pub async fn add_password(
    input: PasswordInput,
    state: State<'_, AppState>,
) -> Result<PasswordEntry, String> {
    validate(&input)?;
    let now = chrono::Utc::now().to_rfc3339();
    let entry = PasswordEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name.trim().to_string(),
        url: normalize_url(input.url),
        username: input.username.trim().to_string(),
        password: input.password,
        notes: normalize_optional(input.notes),
        totp_secret: normalize_optional(input.totp_secret),
        created_at: now.clone(),
        updated_at: now,
    };
    let returned = entry.clone();

    let (path, key) = require_path_and_key(&state)?;
    {
        let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
        let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
        manifest.passwords.push(entry);
        format::save_vault(&path, &key, manifest)?;
    }
    Ok(returned)
}

#[tauri::command]
pub async fn update_password(
    id: String,
    input: PasswordInput,
    state: State<'_, AppState>,
) -> Result<PasswordEntry, String> {
    validate(&input)?;
    let (path, key) = require_path_and_key(&state)?;
    let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
    let target = manifest
        .passwords
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or("Password entry not found")?;
    target.name = input.name.trim().to_string();
    target.url = normalize_url(input.url);
    target.username = input.username.trim().to_string();
    target.password = input.password;
    target.notes = normalize_optional(input.notes);
    target.totp_secret = normalize_optional(input.totp_secret);
    target.updated_at = chrono::Utc::now().to_rfc3339();
    let returned = target.clone();
    format::save_vault(&path, &key, manifest)?;
    Ok(returned)
}

#[tauri::command]
pub async fn delete_password(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (path, key) = require_path_and_key(&state)?;
    let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
    let before = manifest.passwords.len();
    manifest.passwords.retain(|p| p.id != id);
    if manifest.passwords.len() == before {
        return Err("Password entry not found".to_string());
    }
    format::save_vault(&path, &key, manifest)?;
    Ok(())
}

#[tauri::command]
pub async fn list_passwords(
    state: State<'_, AppState>,
) -> Result<Vec<PasswordEntry>, String> {
    let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
    let mut list = manifest.passwords.clone();
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(list)
}

#[derive(serde::Serialize)]
pub struct ImportSummary {
    pub imported: u32,
    pub skipped: u32,
    pub total_now: u32,
    pub detected_format: String,
}

#[derive(Default, Debug)]
struct ColumnMap {
    name: Option<usize>,
    url: Option<usize>,
    username: Option<usize>,
    password: Option<usize>,
    notes: Option<usize>,
    totp: Option<usize>,
    /// Extra "username" columns (Dashlane has username, username2, username3 — fall back to next non-empty).
    extra_usernames: Vec<usize>,
}

/// Try to identify the column index for each PasswordEntry field by inspecting the
/// header row. Recognises the fields exported by Google Passwords, LastPass,
/// Bitwarden, 1Password, Dashlane, KeePassXC, NordPass, and similar tools.
fn detect_columns(headers: &csv::StringRecord) -> (ColumnMap, &'static str) {
    let mut map = ColumnMap::default();
    let mut hdrs: Vec<String> = Vec::with_capacity(headers.len());
    for h in headers.iter() {
        hdrs.push(h.trim().to_lowercase());
    }
    for (i, key) in hdrs.iter().enumerate() {
        match key.as_str() {
            "name" | "title" | "item name" | "entry" => {
                if map.name.is_none() {
                    map.name = Some(i);
                }
            }
            "url" | "website" | "login_uri" | "uri" | "site" | "web site" | "login url" => {
                if map.url.is_none() {
                    map.url = Some(i);
                }
            }
            "username" | "user name" | "login" | "login_username" | "user" | "email"
            | "e-mail" | "login email" => {
                if map.username.is_none() {
                    map.username = Some(i);
                } else {
                    map.extra_usernames.push(i);
                }
            }
            "username2" | "username3" => map.extra_usernames.push(i),
            "password" | "login_password" | "pass" => {
                if map.password.is_none() {
                    map.password = Some(i);
                }
            }
            "notes" | "note" | "extra" | "comments" | "memo" => {
                if map.notes.is_none() {
                    map.notes = Some(i);
                }
            }
            "totp" | "totp_secret" | "login_totp" | "otpauth" | "otpsecret" | "otp" | "2fa"
            | "totpsecret" => {
                if map.totp.is_none() {
                    map.totp = Some(i);
                }
            }
            _ => {}
        }
    }

    // Identify the most likely source so we can report something useful.
    let label: &'static str = if hdrs
        .iter()
        .any(|h| h == "login_uri" || h == "login_username" || h == "login_password")
    {
        "Bitwarden"
    } else if hdrs.iter().any(|h| h == "grouping")
        && hdrs.iter().any(|h| h == "extra")
    {
        "LastPass"
    } else if hdrs.iter().any(|h| h == "otpauth") {
        "1Password"
    } else if hdrs.iter().any(|h| h == "otpsecret") || hdrs.iter().any(|h| h == "username2") {
        "Dashlane"
    } else if hdrs.len() == 5
        && hdrs[0] == "name"
        && hdrs[1] == "url"
        && hdrs[2] == "username"
        && hdrs[3] == "password"
    {
        "Google Passwords"
    } else if hdrs.iter().any(|h| h == "title") && hdrs.iter().any(|h| h == "url") {
        "KeePassXC"
    } else {
        "Generic CSV"
    };

    (map, label)
}

fn pick<'a>(record: &'a csv::StringRecord, idx: Option<usize>) -> &'a str {
    idx.and_then(|i| record.get(i))
        .map(|s| s.trim())
        .unwrap_or("")
}

fn pick_first_non_empty<'a>(
    record: &'a csv::StringRecord,
    indices: &[usize],
) -> &'a str {
    for &i in indices {
        if let Some(v) = record.get(i) {
            let t = v.trim();
            if !t.is_empty() {
                return t;
            }
        }
    }
    ""
}

/// Import passwords from any major password-manager CSV export (Google Passwords,
/// LastPass, Bitwarden, 1Password, Dashlane, KeePassXC, NordPass, ...). Detects
/// columns from the header row; falls back to Google's positional layout
/// (name, url, username, password, note) if no header is recognised.
#[tauri::command]
pub async fn import_passwords_csv(
    csv_path: String,
    state: State<'_, AppState>,
) -> Result<ImportSummary, String> {
    let bytes = std::fs::read(&csv_path)
        .map_err(|e| format!("Could not read CSV: {}", e))?;
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(bytes.as_slice());

    let (path, key) = require_path_and_key(&state)?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut imported = 0u32;
    let mut skipped = 0u32;
    let mut detected_format: String = "Generic CSV".to_string();

    let mut iter = reader.records();
    let first = match iter.next() {
        Some(Ok(r)) => r,
        Some(Err(e)) => return Err(format!("CSV is malformed: {}", e)),
        None => {
            let manifest_lock =
                state.manifest.lock().map_err(|_| "State lock poisoned")?;
            let total_now = manifest_lock
                .as_ref()
                .map(|m| m.passwords.len() as u32)
                .unwrap_or(0);
            return Ok(ImportSummary {
                imported: 0,
                skipped: 0,
                total_now,
                detected_format,
            });
        }
    };

    // Try to detect columns from the first row. If we can't find both name and
    // password by header name, fall back to Google's positional layout and treat
    // the first row as data.
    let (mut map, label) = detect_columns(&first);
    detected_format = label.to_string();
    let first_row_is_data = if map.name.is_some() && map.password.is_some() {
        false
    } else {
        map = ColumnMap {
            name: Some(0),
            url: Some(1),
            username: Some(2),
            password: Some(3),
            notes: Some(4),
            totp: None,
            extra_usernames: vec![],
        };
        detected_format = "Google Passwords (positional)".to_string();
        true
    };

    let mut process = |record: &csv::StringRecord,
                       manifest: &mut crate::vault::manifest::VaultManifest|
     -> bool {
        let name = pick(record, map.name);
        let password = pick(record, map.password);
        if name.is_empty() || password.is_empty() {
            return false;
        }
        let url = pick(record, map.url);
        let mut username = pick(record, map.username).to_string();
        if username.is_empty() && !map.extra_usernames.is_empty() {
            username = pick_first_non_empty(record, &map.extra_usernames).to_string();
        }
        let notes = pick(record, map.notes);
        let totp = pick(record, map.totp);
        manifest.passwords.push(PasswordEntry {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            url: if url.is_empty() {
                None
            } else {
                Some(url.to_string())
            },
            username,
            password: password.to_string(),
            notes: if notes.is_empty() {
                None
            } else {
                Some(notes.to_string())
            },
            totp_secret: if totp.is_empty() {
                None
            } else {
                Some(totp.to_string())
            },
            created_at: now.clone(),
            updated_at: now.clone(),
        });
        true
    };

    {
        let mut manifest_lock =
            state.manifest.lock().map_err(|_| "State lock poisoned")?;
        let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;

        if first_row_is_data {
            if process(&first, manifest) {
                imported += 1;
            } else {
                skipped += 1;
            }
        }
        for result in iter {
            match result {
                Ok(record) => {
                    if process(&record, manifest) {
                        imported += 1;
                    } else {
                        skipped += 1;
                    }
                }
                Err(_) => skipped += 1,
            }
        }

        format::save_vault(&path, &key, manifest)?;
    }

    let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
    Ok(ImportSummary {
        imported,
        skipped,
        total_now: manifest.passwords.len() as u32,
        detected_format,
    })
}
