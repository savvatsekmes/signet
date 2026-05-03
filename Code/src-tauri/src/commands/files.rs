use crate::state::AppState;
use crate::vault::format;
use crate::vault::manifest::{FileEntry, FileEntryMeta};
use base64::{engine::general_purpose, Engine as _};
use std::path::Path;
use tauri::State;

const VALID_CATEGORIES: &[&str] = &[
    "documents",
    "passwords",
    "crypto",
    "personal",
    "images",
];

fn check_category(category: &str) -> Result<(), String> {
    if VALID_CATEGORIES.contains(&category) {
        Ok(())
    } else {
        Err(format!("Unknown category: {}", category))
    }
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
pub async fn add_file(
    source_path: String,
    category: String,
    section: Option<String>,
    state: State<'_, AppState>,
) -> Result<FileEntryMeta, String> {
    check_category(&category)?;
    let bytes = std::fs::read(&source_path)
        .map_err(|e| format!("Could not read source file: {}", e))?;
    let size = bytes.len() as u64;
    let encoded = general_purpose::STANDARD.encode(&bytes);
    let name = Path::new(&source_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();

    let entry = FileEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        category,
        size,
        added_at: chrono::Utc::now().to_rfc3339(),
        data: encoded,
        section: section.map(|s| s.trim().to_string()).unwrap_or_default(),
    };
    let meta = FileEntryMeta::from(&entry);

    let (path, key) = require_path_and_key(&state)?;
    {
        let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
        let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
        manifest.files.push(entry);
        format::save_vault(&path, &key, manifest)?;
    }

    Ok(meta)
}

#[tauri::command]
pub async fn list_files(
    category: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<FileEntryMeta>, String> {
    let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
    let result: Vec<FileEntryMeta> = manifest
        .files
        .iter()
        .filter(|f| match &category {
            Some(c) => &f.category == c,
            None => true,
        })
        .map(FileEntryMeta::from)
        .collect();
    Ok(result)
}

#[tauri::command]
pub async fn get_file(
    id: String,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
    let entry = manifest
        .files
        .iter()
        .find(|f| f.id == id)
        .ok_or("File not found")?;
    general_purpose::STANDARD
        .decode(&entry.data)
        .map_err(|e| format!("Failed to decode file data: {}", e))
}

#[tauri::command]
pub async fn delete_file(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (path, key) = require_path_and_key(&state)?;
    let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
    let before = manifest.files.len();
    manifest.files.retain(|f| f.id != id);
    if manifest.files.len() == before {
        return Err("File not found".to_string());
    }
    format::save_vault(&path, &key, manifest)?;
    Ok(())
}

/// Move a file into a different section (used by the Documents panel).
#[tauri::command]
pub async fn set_file_section(
    id: String,
    section: String,
    state: State<'_, AppState>,
) -> Result<FileEntryMeta, String> {
    let (path, key) = require_path_and_key(&state)?;
    let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
    let entry = manifest
        .files
        .iter_mut()
        .find(|f| f.id == id)
        .ok_or("File not found")?;
    entry.section = section.trim().to_string();
    let meta = FileEntryMeta::from(&*entry);
    format::save_vault(&path, &key, manifest)?;
    Ok(meta)
}

/// Replace the bytes of an existing file (used by the in-app text editor).
/// Updates the file's size + added_at timestamp.
#[tauri::command]
pub async fn update_file_data(
    id: String,
    data_b64: String,
    state: State<'_, AppState>,
) -> Result<FileEntryMeta, String> {
    let (path, key) = require_path_and_key(&state)?;
    // Decode once to compute byte size and validate.
    let bytes = general_purpose::STANDARD
        .decode(&data_b64)
        .map_err(|e| format!("Invalid base64 data: {}", e))?;
    let size = bytes.len() as u64;
    let now = chrono::Utc::now().to_rfc3339();
    let meta = {
        let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
        let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
        let entry = manifest
            .files
            .iter_mut()
            .find(|f| f.id == id)
            .ok_or("File not found")?;
        entry.data = data_b64;
        entry.size = size;
        entry.added_at = now;
        let meta = FileEntryMeta::from(&*entry);
        format::save_vault(&path, &key, manifest)?;
        meta
    };
    Ok(meta)
}

/// Return the file's base64-encoded data (already stored b64 in the manifest, so this
/// is essentially a clone — no decode/encode round-trip). The frontend uses this for
/// in-app previews via `data:` URLs.
#[tauri::command]
pub async fn get_file_data(
    id: String,
    state: State<'_, AppState>,
) -> Result<(String, String), String> {
    let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
    let entry = manifest
        .files
        .iter()
        .find(|f| f.id == id)
        .ok_or("File not found")?;
    Ok((entry.name.clone(), entry.data.clone()))
}

#[tauri::command]
pub async fn save_file_to_disk(
    id: String,
    output_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let bytes = {
        let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
        let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
        let entry = manifest
            .files
            .iter()
            .find(|f| f.id == id)
            .ok_or("File not found")?;
        general_purpose::STANDARD
            .decode(&entry.data)
            .map_err(|e| format!("Failed to decode file data: {}", e))?
    };
    std::fs::write(&output_path, &bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct ExportSummary {
    pub files_written: u32,
    pub passwords_written: u32,
    pub documents_written: u32,
    pub seeds_written: u32,
    pub skipped: u32,
    pub root: String,
}

/// Build a complete vault export under
///   `output_dir/signet-vault-YYYYMMDD-HHMMSS/`
/// containing one folder per category. Files are written verbatim. Structured
/// passwords are emitted as `passwords/passwords.csv` (Google Passwords header
/// format). Structured documents are emitted as `documents/<title>.html`.
#[tauri::command]
pub async fn export_all_files(
    output_dir: String,
    state: State<'_, AppState>,
) -> Result<ExportSummary, String> {
    let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
    let parent = Path::new(&output_dir);
    if !parent.exists() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create output directory: {}", e))?;
    }

    // Master folder, timestamped so multiple runs don't clobber each other.
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let mut master = parent.join(format!("signet-vault-{}", stamp));
    let mut suffix = 1;
    while master.exists() {
        suffix += 1;
        master = parent.join(format!("signet-vault-{}_{}", stamp, suffix));
    }
    std::fs::create_dir_all(&master)
        .map_err(|e| format!("Cannot create master folder: {}", e))?;

    let mut files_written = 0u32;
    let mut skipped = 0u32;

    // ── 1. Files: write each into <master>/<category>/[<section>/]<filename>
    // Files in the Documents category get nested by their section (Main by
    // default). Other categories don't use sections — files land flat.
    for entry in &manifest.files {
        let category = if VALID_CATEGORIES.contains(&entry.category.as_str()) {
            entry.category.as_str()
        } else {
            "other"
        };
        let mut target_dir = master.join(category);
        // Categories that surface tags in the UI nest files by tag.
        if matches!(category, "documents" | "personal" | "images") {
            let raw = entry.section.trim();
            let tag_name = if raw.is_empty() || raw.eq_ignore_ascii_case("main") {
                "main".to_string()
            } else {
                sanitize_filename(raw)
            };
            target_dir = target_dir.join(tag_name);
        }
        if let Err(e) = std::fs::create_dir_all(&target_dir) {
            return Err(format!("Cannot create {}: {}", category, e));
        }
        let bytes = match general_purpose::STANDARD.decode(&entry.data) {
            Ok(b) => b,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        let safe = sanitize_filename(&entry.name);
        let target = unique_path(&target_dir, &safe);
        match std::fs::write(&target, &bytes) {
            Ok(_) => files_written += 1,
            Err(_) => skipped += 1,
        }
    }

    // ── 2. Passwords: passwords/passwords.csv (Google Passwords format) ───
    let mut passwords_written = 0u32;
    if !manifest.passwords.is_empty() {
        let pw_dir = master.join("passwords");
        std::fs::create_dir_all(&pw_dir)
            .map_err(|e| format!("Cannot create passwords folder: {}", e))?;
        let csv_path = unique_path(&pw_dir, "passwords.csv");
        let mut writer = csv::WriterBuilder::new()
            .has_headers(false)
            .from_path(&csv_path)
            .map_err(|e| format!("Cannot create passwords.csv: {}", e))?;
        // Header (matches Google Passwords / NordPass exact format).
        writer
            .write_record(&["name", "url", "username", "password", "note"])
            .map_err(|e| format!("CSV header write failed: {}", e))?;
        for p in &manifest.passwords {
            if let Err(_) = writer.write_record(&[
                p.name.as_str(),
                p.url.as_deref().unwrap_or(""),
                p.username.as_str(),
                p.password.as_str(),
                p.notes.as_deref().unwrap_or(""),
            ]) {
                skipped += 1;
                continue;
            }
            passwords_written += 1;
        }
        writer
            .flush()
            .map_err(|e| format!("CSV flush failed: {}", e))?;
    }

    // ── 3. Seeds: crypto/seeds.txt with one section per wallet ─────────────
    let mut seeds_written = 0u32;
    if !manifest.seeds.is_empty() {
        let seeds_dir = master.join("crypto");
        std::fs::create_dir_all(&seeds_dir)
            .map_err(|e| format!("Cannot create crypto folder: {}", e))?;
        let seeds_path = unique_path(&seeds_dir, "seeds.txt");
        let mut body = String::new();
        body.push_str("Signet — Crypto wallet seeds\n");
        body.push_str("============================\n\n");
        body.push_str("Anyone with a seed phrase below has full control of that wallet.\n");
        body.push_str("Treat this file like cash. Store it somewhere safe.\n\n");
        for s in &manifest.seeds {
            body.push_str("-----------------------------------------------------------\n");
            body.push_str(&format!("Wallet: {}\n", s.name));
            if !s.chain.is_empty() {
                body.push_str(&format!("Chain:  {}\n", s.chain));
            }
            if !s.wallet_type.is_empty() {
                body.push_str(&format!("Type:   {}\n", s.wallet_type));
            }
            if let Some(addr) = &s.public_address {
                body.push_str(&format!("Public address:\n  {}\n", addr));
            }
            if let Some(deriv) = &s.derivation_path {
                body.push_str(&format!("Derivation path: {}\n", deriv));
            }
            body.push_str("\nSeed phrase:\n");
            body.push_str(&format!("  {}\n", s.seed_phrase));
            if let Some(notes) = &s.notes {
                body.push_str(&format!("\nNotes:\n  {}\n", notes));
            }
            body.push('\n');
            seeds_written += 1;
        }
        std::fs::write(&seeds_path, body.as_bytes())
            .map_err(|e| format!("Failed to write seeds.txt: {}", e))?;
    }

    // ── 4. Rich entries (documents + personal): grouped by kind, then tag ──
    // Each entry lands in <kind>/<tag>/<title>.html where:
    //   kind  = "documents" (default) or "personal"
    //   tag   = the entry's tag, or "main" if blank
    let mut documents_written = 0u32;
    for d in &manifest.documents {
        let kind = if d.kind.is_empty() {
            "documents".to_string()
        } else {
            d.kind.clone()
        };
        let kind_dir = master.join(&kind);
        if let Err(e) = std::fs::create_dir_all(&kind_dir) {
            return Err(format!("Cannot create {} folder: {}", kind, e));
        }
        let raw = d.section.trim();
        let tag_name = if raw.is_empty() || raw.eq_ignore_ascii_case("main") {
            "main".to_string()
        } else {
            sanitize_filename(raw)
        };
        let tag_dir = kind_dir.join(&tag_name);
        if let Err(e) = std::fs::create_dir_all(&tag_dir) {
            return Err(format!("Cannot create tag {}: {}", tag_name, e));
        }
        let safe = sanitize_filename(&format!("{}.html", d.title));
        let target = unique_path(&tag_dir, &safe);
        let html = render_document_html_export(d);
        match std::fs::write(&target, html.as_bytes()) {
            Ok(_) => documents_written += 1,
            Err(_) => skipped += 1,
        }
    }

    // ── 5. README.txt at the root explaining the layout ────────────────────
    let _ = std::fs::write(
        master.join("README.txt"),
        build_export_readme(
            files_written,
            passwords_written,
            documents_written,
            seeds_written,
        )
        .as_bytes(),
    );

    Ok(ExportSummary {
        files_written,
        passwords_written,
        documents_written,
        seeds_written,
        skipped,
        root: master.to_string_lossy().into_owned(),
    })
}

/// Inline HTML-document renderer used by the bulk exporter so we don't need
/// to cross-call into commands::documents.
fn render_document_html_export(entry: &crate::vault::manifest::DocumentEntry) -> String {
    let title = entry
        .title
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    format!(
        "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"/><title>{title}</title>\
<style>body {{ font-family: -apple-system, system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.6; }} h1 {{ font-size: 24px; }} a {{ color: #8B1A1A; }}</style>\
</head><body><h1>{title}</h1>{body}</body></html>",
        title = title,
        body = entry.content
    )
}

fn build_export_readme(files: u32, passwords: u32, documents: u32, seeds: u32) -> String {
    format!(
        "Signet vault export\n\
=====================\n\n\
Generated: {date}\n\n\
This folder contains a decrypted snapshot of your Signet vault.\n\
Anything in here is in the clear — store it somewhere safe.\n\n\
Contents\n\
--------\n\
  documents/   Documents as .html, grouped by tag, plus any uploaded files.\n\
  personal/    Personal items (notes, letters) as .html, grouped by tag,\n\
               plus any uploaded files.\n\
  passwords/   {passwords} password entr{p_plural} as passwords.csv,\n\
               plus any uploaded files. The CSV is in Google Passwords\n\
               format (name, url, username, password, note) and can be\n\
               re-imported into Signet, Bitwarden, 1Password, Dashlane,\n\
               LastPass, KeePass, etc.\n\
  crypto/      {seeds} wallet(s) in seeds.txt, plus any uploaded files.\n\
               The seed phrases are in plain text — anyone with this file\n\
               can move the funds. Treat it like cash.\n\
  images/      Uploaded images, grouped by tag.\n\n\
{documents} document(s) total were written.\n\
{files} file(s) total were exported.\n",
        date = chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
        files = files,
        passwords = passwords,
        documents = documents,
        seeds = seeds,
        p_plural = if passwords == 1 { "y" } else { "ies" }
    )
}

fn sanitize_filename(name: &str) -> String {
    let mut cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '_',
            c if (c as u32) < 32 => '_',
            c => c,
        })
        .collect();
    cleaned = cleaned.trim().to_string();
    if cleaned.is_empty() {
        cleaned = "file".to_string();
    }
    // Avoid Windows reserved names.
    let upper = cleaned.to_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5",
        "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4",
        "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if reserved.iter().any(|r| upper == *r || upper.starts_with(&format!("{}.", r))) {
        cleaned = format!("_{}", cleaned);
    }
    cleaned
}

fn unique_path(dir: &Path, filename: &str) -> std::path::PathBuf {
    let candidate = dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match filename.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{}", e)),
        _ => (filename.to_string(), String::new()),
    };
    for i in 1..1000 {
        let attempt = dir.join(format!("{} ({}){}", stem, i, ext));
        if !attempt.exists() {
            return attempt;
        }
    }
    candidate
}
