# Signet — Master Build Document
> signetvault.com · An encrypted local vault for the people you leave behind

---

## How to use this document

This is the single source of truth for building Signet. Upload it to Claude Code at the start of every session. At the top of each new session, paste this document and tell Claude Code which phase you are on and what is already working. Execute one phase at a time. Do not begin a new phase until the definition of done for the current phase is fully satisfied.

---

## What is Signet?

Signet is a **local-first, encrypted file vault** designed to ensure that when you die, the people you love can access everything they need — passwords, documents, crypto seeds, personal messages — without being locked out.

The name comes from a real historical practice: when a pope or nobleman died, their signet ring was ceremonially broken or defaced with a hammer so nobody could forge documents in their name. Signet is the digital version of that moment — the handover of identity and trust after death.

**Core principles:**
- No servers. No cloud. No check-ins. No subscriptions.
- Everything lives in a single encrypted `.sgt` file on a USB drive or home server.
- The vault key is split across multiple trusted people using Shamir's Secret Sharing — any 2-of-3 (configurable) must come together physically to unlock it.
- No single person can betray you or lose their shard and cause catastrophe.
- The app runs directly from USB — no installation required on any platform.
- Windows first. macOS second. Linux third.

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Desktop shell | Tauri 2 (Rust) | Native, tiny binary (~10MB), no Electron overhead, cross-platform |
| Frontend | React 18 + TypeScript + Vite | Fast dev, component-based UI |
| Styling | CSS variables + Tailwind core | Utility-first, theme-aware, no build step |
| Crypto | `sodiumoxide` Rust crate | libsodium bindings — Argon2id + secretstream |
| Key splitting | `sharks` Rust crate | Shamir's Secret Sharing, pure Rust |
| PDF export | `printpdf` Rust crate | Recovery card generation, no external deps |
| QR codes | `qrcode` Rust crate | Shard QR codes for recovery cards |
| State management | Zustand | Lightweight, no boilerplate |
| Icons | Lucide React | Consistent, tree-shakeable |
| Password strength | zxcvbn | Realistic strength estimation |

---

## Titlebar — Cross-platform

The app uses a **frameless custom titlebar** — no OS chrome, same appearance on Windows and macOS.

In `tauri.conf.json`:
```json
{
  "app": {
    "windows": [{
      "title": "Signet",
      "width": 900,
      "height": 620,
      "minWidth": 800,
      "minHeight": 560,
      "decorations": false,
      "transparent": false,
      "center": true
    }]
  }
}
```

Titlebar component rules:
- Left side: 16x16 logo mark (dark square, rounded-4) + "Signet" in 12px/500
- Right side on Windows: minimise → maximise → close buttons
- Left side on macOS: close → minimise → maximise buttons (detect OS with `@tauri-apps/plugin-os`)
- `data-tauri-drag-region` on titlebar div for dragging
- Buttons must NOT have `data-tauri-drag-region`
- Close button: turns `#c0392b` red on hover
- Minimise/maximise: subtle hover state only

---

## Vault File Format (.sgt)

Every vault is a single portable file:

```
Bytes 0–3:    Magic bytes "SIGT"
Byte  4:      Version u8 = 1
Bytes 5–36:   Argon2id salt (32 bytes)
Bytes 37–127: Reserved / padding (zeros)
Bytes 128+:   Encrypted blob (secretstream header + ciphertext)
```

Decrypted blob is a JSON manifest:
```json
{
  "version": 1,
  "created_at": "ISO8601",
  "files": [],
  "beneficiaries": [],
  "shamir_config": { "total": 3, "required": 2 }
}
```

Files are stored as base64-encoded bytes inside the manifest under each file entry's `data` field. This keeps everything in one encrypted blob with no external file references.

---

## Encryption Stack

```
Master Password
      ↓
Argon2id (memory: 64MB, iterations: 3, parallelism: 4)
      ↓
256-bit key (held in memory only, never written to disk)
      ↓
libsodium secretstream (XChaCha20-Poly1305)
      ↓
Encrypted .sgt blob
```

Key is zeroized from memory on lock or app close via the `zeroize` crate.

---

## Shamir Secret Sharing

- The 32-byte master key is split into N shards using the `sharks` crate
- Any K of N shards reconstructs the key
- Default: 2-of-3 (configurable up to 5-of-7)
- Each shard below threshold is mathematically worthless — reveals zero information
- Shards are encoded as QR codes and printed on physical recovery cards

Recovery flow:
1. Person opens Signet and selects "Open with recovery shard"
2. They scan their QR shard
3. A second keyholder does the same
4. Signet reconstructs the key and unlocks the vault

---

## Design System

**Colours:**
```css
:root {
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f7f6f3;
  --color-bg-tertiary: #efede8;
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #555550;
  --color-text-tertiary: #999990;
  --color-border-light: rgba(0,0,0,0.08);
  --color-border-medium: rgba(0,0,0,0.14);
  --color-accent: #1a0a0a;
  --color-accent-fg: #f5f0eb;
  --color-wax: #8B1A1A;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-primary: #1a1917;
    --color-bg-secondary: #222220;
    --color-bg-tertiary: #2a2a28;
    --color-text-primary: #f0ede8;
    --color-text-secondary: #a8a49e;
    --color-text-tertiary: #6a6660;
    --color-border-light: rgba(255,255,255,0.07);
    --color-border-medium: rgba(255,255,255,0.12);
    --color-accent: #f5f0eb;
    --color-accent-fg: #1a0a0a;
    --color-wax: #c0392b;
  }
}
```

**Category colours:**
| Category | Background | Text |
|---|---|---|
| Documents | `#FAECE7` | `#712B13` |
| Passwords | `#EEEDFE` | `#3C3489` |
| Crypto seeds | `#EAF3DE` | `#27500A` |
| Personal | `#FBEAF0` | `#72243E` |

**Typography:** System font stack. Two weights only: 400 regular, 500 medium. Never 600 or 700.

**Borders:** 0.5px solid. Flat surfaces. No gradients. No shadows.

---

## Full Screen Inventory

### Lock Screen
- Custom titlebar
- Centered: logo mark (60x60 dark square, signet ring SVG with crack), "Signet" 22px/500, tagline 12px muted
- Master password field with show/hide toggle
- "Unlock vault" button — full width, `#1a0a0a` background, `#f5f0eb` text
- Error state: inline red message below input
- Divider + "No vault yet? Create one" link
- `signetvault.com · v1.0.0` footer

### Setup Wizard (4 steps)
- Step 1 — Welcome: what Signet is, no servers, no cloud
- Step 2 — Master password: input, confirm, strength meter, Argon2id explanation
- Step 3 — Beneficiaries: add people, configure Shamir N-of-K
- Step 4 — Recovery: print cards, choose vault save location

### Vault Browser
- Custom titlebar + "Vault unlocked" status
- Sidebar: My vault, Beneficiaries, Recovery sheet, Settings + category filters
- Sidebar footer: vault completeness bar
- Main: category grid (4 cards), recent files list, drop zone, beneficiary status strip
- Add file button, Export PDF button

### Beneficiary Manager
- Shamir controls: N stepper, K stepper, visual circle representation
- Beneficiary cards: avatar, name, email, shard badge, card status pill, access pills, actions

### Recovery Card Export
- Per-beneficiary PDF: logo, name, QR shard, plain-language instructions, vault location, download URL

### Settings
- Change master password
- Change vault file location
- Export backup
- Re-generate shards
- Danger zone: delete vault

---

## Tauri Command Reference (all phases)

```rust
// Vault lifecycle
create_vault(password: String, path: String) -> Result<(), String>
unlock_vault(password: String, path: String) -> Result<VaultMeta, String>
lock_vault() -> Result<(), String>
change_password(old_password: String, new_password: String) -> Result<(), String>

// Files
add_file(source_path: String, category: String, name: String) -> Result<FileEntry, String>
get_file(id: String) -> Result<Vec<u8>, String>
delete_file(id: String) -> Result<(), String>
list_files(category: Option<String>) -> Result<Vec<FileEntry>, String>

// Beneficiaries
add_beneficiary(name: String, email: String) -> Result<Beneficiary, String>
update_beneficiary(id: String, updates: serde_json::Value) -> Result<(), String>
remove_beneficiary(id: String) -> Result<(), String>
list_beneficiaries() -> Result<Vec<Beneficiary>, String>

// Shamir
configure_shamir(total: u8, required: u8) -> Result<(), String>
generate_shards() -> Result<Vec<Shard>, String>
reconstruct_from_shards(shards: Vec<String>) -> Result<(), String>

// Export
export_recovery_pdf(beneficiary_id: String, output_path: String) -> Result<(), String>
export_vault_backup(output_path: String) -> Result<(), String>

// Utility
get_vault_meta() -> Result<VaultMeta, String>
get_completeness_score() -> Result<u8, String>
```

---

## Cargo.toml (complete)

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
tauri-plugin-os = "2"
tauri-plugin-path = "2"
tauri-plugin-dialog = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sodiumoxide = "0.2"
sharks = "0.5"
printpdf = "0.6"
qrcode = "0.13"
image = "0.24"
zeroize = { version = "1.7", features = ["derive"] }
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
base64 = "0.21"
```

---

## package.json (complete)

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-os": "^2",
    "@tauri-apps/plugin-path": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "@tauri-apps/plugin-shell": "^2",
    "zustand": "^4",
    "lucide-react": "^0.383",
    "zxcvbn": "^4.4",
    "clsx": "^2"
  },
  "devDependencies": {
    "typescript": "^5",
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "@tauri-apps/cli": "^2",
    "tailwindcss": "^3",
    "autoprefixer": "^10",
    "postcss": "^8",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@types/zxcvbn": "^4"
  }
}
```

---

## Rust source structure (complete)

```
src-tauri/src/
  main.rs
  state.rs
  crypto/
    mod.rs
    kdf.rs          — Argon2id key derivation
    cipher.rs       — secretstream encrypt/decrypt
    shamir.rs       — shard generation + reconstruction
  vault/
    mod.rs
    format.rs       — .sgt file read/write
    manifest.rs     — VaultManifest, FileEntry, Beneficiary structs
  commands/
    mod.rs
    vault.rs        — lifecycle commands
    files.rs        — file CRUD commands
    beneficiaries.rs
    shamir.rs
    export.rs       — PDF recovery card
```

---

## Frontend structure (complete)

```
src/
  App.tsx
  index.css
  screens/
    LockScreen.tsx
    SetupWizard.tsx
    VaultBrowser.tsx
    BeneficiaryManager.tsx
    RecoveryCard.tsx
    Settings.tsx
  components/
    Titlebar.tsx
    Sidebar.tsx
    FileList.tsx
    FileRow.tsx
    CategoryCard.tsx
    BeneficiaryCard.tsx
    ShamirControls.tsx
    DropZone.tsx
    StrengthMeter.tsx
    StatusPill.tsx
    Avatar.tsx
    CompletionBar.tsx
  hooks/
    useVault.ts
    useFiles.ts
    useBeneficiaries.ts
  store/
    vaultStore.ts
  lib/
    tauri.ts        — typed invoke() wrappers
    categories.ts   — category definitions + colours
    completeness.ts — vault completeness scoring logic
```

---

## Security rules (non-negotiable across all phases)

- Master key is never written to disk under any circumstances
- Key is held in `Arc<Mutex<Option<[u8; 32]>>>` in Tauri app state
- Key is zeroized via `zeroize` on lock, on app close, and on drop
- New secretstream header generated on every vault save
- Magic bytes "SIGT" verified before any decryption attempt
- Wrong password returns generic error — no timing information leaked
- No passwords, keys, or key material in any log output
- `tauri::command` functions never return raw key bytes to the frontend

---

## Phase overview

| Phase | What gets built | Gate to next phase |
|---|---|---|
| 1 | App shell, crypto layer, vault format, lock screen | App compiles, vault creates and unlocks correctly |
| 2 | Vault browser, file manager, drag-drop | Files add, decrypt, and delete correctly |
| 3 | Beneficiary manager, Shamir key splitting | Shards generate and reconstruct the key correctly |
| 4 | Recovery card PDF export | PDF generates with correct QR, opens in system viewer |
| 5 | Setup wizard, completeness scoring | Full first-run flow works end to end |
| 6 | USB packaging, portable builds | App runs from USB on Windows with no installation |

---

---

# PHASE 1 — App shell, crypto, vault format, lock screen

**Build this phase now. Do not build anything from Phase 2 onwards yet.**

---

## What to build in Phase 1

### App shell

Scaffold Tauri 2 + React 18 + TypeScript + Vite. Apply `tauri.conf.json` window settings from above (decorations: false, 900x620, centered).

### Titlebar component

`src/components/Titlebar.tsx` — implement exactly as described in the Titlebar section above. Use `@tauri-apps/plugin-os` to detect Windows vs macOS and position controls accordingly.

### Lock screen

`src/screens/LockScreen.tsx`:
- Full height centered column layout
- Titlebar at top
- Logo mark: 60x60 dark square (`#1a0a0a`), `border-radius: 14px`, containing SVG of a signet ring with a crack through it — ring in deep red (`#8B1A1A`), crack highlight in cream (`#f5f0eb`)
- "Signet" — 22px, weight 500, letter-spacing -0.5px
- Tagline — 12px, `color: var(--color-text-tertiary)`, centered, line-height 1.5
- 32px gap
- Label "MASTER PASSWORD" — 10px, uppercase, `var(--color-text-secondary)`
- Password input — full width, 38px, 0.5px border, bg secondary, show/hide eye icon toggle on right
- "Unlock vault" button — full width, 38px, `background: #1a0a0a`, `color: #f5f0eb`, 13px/500, loading spinner state while key is being derived
- Inline error below button: "Incorrect password" in `var(--color-text-danger)` — only shown on failed unlock
- Thin 0.5px divider
- "No vault yet? Create one" — 12px centered, "Create one" underlined and clickable
- `signetvault.com · v1.0.0` — 10px, `var(--color-text-tertiary)`, bottom

### App routing (App.tsx)

On mount:
1. Check for `.sgt` file in the same directory as the executable using `@tauri-apps/plugin-path`
2. If found → render `<LockScreen />`
3. If not found → render `<SetupWizard />` (placeholder only in Phase 1)
4. After successful unlock → render `<VaultBrowser />` (placeholder only in Phase 1)

### Placeholder screens (Phase 1 only)

`src/screens/SetupWizard.tsx` — just renders "Setup wizard — coming in Phase 2"
`src/screens/VaultBrowser.tsx` — just renders "Vault browser — coming in Phase 2"

These will be replaced in full in later phases.

### Rust: crypto/kdf.rs

```rust
use sodiumoxide::crypto::pwhash::argon2id13;

pub fn derive_key(password: &str, salt: &argon2id13::Salt) -> [u8; 32] {
    let mut key = [0u8; 32];
    argon2id13::derive_key(
        &mut key,
        password.as_bytes(),
        salt,
        argon2id13::OPSLIMIT_INTERACTIVE,
        argon2id13::MEMLIMIT_INTERACTIVE,
    ).expect("Key derivation failed");
    key
}

pub fn generate_salt() -> argon2id13::Salt {
    argon2id13::gen_salt()
}
```

### Rust: crypto/cipher.rs

Use libsodium secretstream (XChaCha20-Poly1305):

```rust
use sodiumoxide::crypto::secretstream::{self, Stream, Tag};

pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let key = secretstream::Key::from_slice(key)
        .ok_or("Invalid key length")?;
    let (mut stream, header) = Stream::init_push(&key)
        .map_err(|_| "Failed to initialise encryption stream")?;
    let ciphertext = stream.push(plaintext, None, Tag::Final)
        .map_err(|_| "Encryption failed")?;
    let mut result = header.0.to_vec();
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

pub fn decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    let key = secretstream::Key::from_slice(key)
        .ok_or("Invalid key length")?;
    let header = secretstream::Header::from_slice(&data[..secretstream::HEADERBYTES])
        .ok_or("Corrupted vault header")?;
    let mut stream = Stream::init_pull(&header, &key)
        .map_err(|_| "Incorrect password or corrupted vault")?;
    let (plaintext, _tag) = stream.pull(&data[secretstream::HEADERBYTES..], None)
        .map_err(|_| "Incorrect password or corrupted vault")?;
    Ok(plaintext)
}
```

### Rust: vault/manifest.rs

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VaultManifest {
    pub version: u8,
    pub created_at: String,
    pub files: Vec<FileEntry>,
    pub beneficiaries: Vec<Beneficiary>,
    pub shamir_config: ShamirConfig,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileEntry {
    pub id: String,
    pub name: String,
    pub category: String,
    pub size: u64,
    pub added_at: String,
    pub data: String, // base64 encoded file bytes
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Beneficiary {
    pub id: String,
    pub name: String,
    pub email: String,
    pub shard_index: Option<u8>,
    pub access: Vec<String>, // category names
    pub card_printed: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ShamirConfig {
    pub total: u8,
    pub required: u8,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VaultMeta {
    pub item_count: u32,
    pub beneficiary_count: u32,
    pub created_at: String,
}

impl VaultManifest {
    pub fn empty() -> Self {
        VaultManifest {
            version: 1,
            created_at: chrono::Utc::now().to_rfc3339(),
            files: vec![],
            beneficiaries: vec![],
            shamir_config: ShamirConfig { total: 3, required: 2 },
        }
    }

    pub fn to_meta(&self) -> VaultMeta {
        VaultMeta {
            item_count: self.files.len() as u32,
            beneficiary_count: self.beneficiaries.len() as u32,
            created_at: self.created_at.clone(),
        }
    }
}
```

### Rust: vault/format.rs

```rust
use std::fs;
use crate::crypto::{kdf, cipher};
use crate::vault::manifest::VaultManifest;

const MAGIC: &[u8; 4] = b"SIGT";
const HEADER_SIZE: usize = 128;
const SALT_OFFSET: usize = 5;
const SALT_SIZE: usize = 32;

pub fn create_vault(path: &str, password: &str) -> Result<(), String> {
    let salt = kdf::generate_salt();
    let key = kdf::derive_key(password, &salt);
    let manifest = VaultManifest::empty();
    let json = serde_json::to_vec(&manifest)
        .map_err(|e| format!("Serialisation error: {}", e))?;
    let encrypted = cipher::encrypt(&key, &json)?;
    let mut header = vec![0u8; HEADER_SIZE];
    header[0..4].copy_from_slice(MAGIC);
    header[4] = 1; // version
    header[SALT_OFFSET..SALT_OFFSET + SALT_SIZE].copy_from_slice(&salt.0);
    let mut file_data = header;
    file_data.extend_from_slice(&encrypted);
    fs::write(path, file_data)
        .map_err(|e| format!("Failed to write vault file: {}", e))?;
    Ok(())
}

pub fn unlock_vault(path: &str, password: &str) -> Result<(VaultManifest, [u8; 32]), String> {
    let data = fs::read(path)
        .map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }
    let salt_bytes = &data[SALT_OFFSET..SALT_OFFSET + SALT_SIZE];
    let salt = sodiumoxide::crypto::pwhash::argon2id13::Salt::from_slice(salt_bytes)
        .ok_or("Corrupted vault salt")?;
    let key = kdf::derive_key(password, &salt);
    let decrypted = cipher::decrypt(&key, &data[HEADER_SIZE..])?;
    let manifest: VaultManifest = serde_json::from_slice(&decrypted)
        .map_err(|_| "Corrupted vault manifest")?;
    Ok((manifest, key))
}

pub fn save_vault(path: &str, key: &[u8; 32], manifest: &VaultManifest) -> Result<(), String> {
    let existing = fs::read(path)
        .map_err(|_| "Cannot read existing vault to save")?;
    let salt_bytes = &existing[SALT_OFFSET..SALT_OFFSET + SALT_SIZE];
    let json = serde_json::to_vec(manifest)
        .map_err(|e| format!("Serialisation error: {}", e))?;
    let encrypted = cipher::encrypt(key, &json)?;
    let mut file_data = existing[..HEADER_SIZE].to_vec();
    file_data.extend_from_slice(&encrypted);
    fs::write(path, file_data)
        .map_err(|e| format!("Failed to save vault: {}", e))?;
    Ok(())
}
```

### Rust: state.rs

```rust
use std::sync::Mutex;
use zeroize::Zeroize;
use crate::vault::manifest::VaultManifest;

pub struct AppState {
    pub key: Mutex<Option<[u8; 32]>>,
    pub vault_path: Mutex<Option<String>>,
    pub manifest: Mutex<Option<VaultManifest>>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            key: Mutex::new(None),
            vault_path: Mutex::new(None),
            manifest: Mutex::new(None),
        }
    }

    pub fn clear(&self) {
        if let Ok(mut key) = self.key.lock() {
            if let Some(ref mut k) = *key {
                k.zeroize();
            }
            *key = None;
        }
        if let Ok(mut path) = self.vault_path.lock() {
            *path = None;
        }
        if let Ok(mut manifest) = self.manifest.lock() {
            *manifest = None;
        }
    }
}
```

### Rust: commands/vault.rs

```rust
use tauri::State;
use crate::state::AppState;
use crate::vault::{format, manifest::VaultMeta};

#[tauri::command]
pub async fn create_vault(
    password: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    format::create_vault(&path, &password)?;
    let (manifest, key) = format::unlock_vault(&path, &password)?;
    *state.key.lock().unwrap() = Some(key);
    *state.vault_path.lock().unwrap() = Some(path);
    *state.manifest.lock().unwrap() = Some(manifest);
    Ok(())
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
```

### Phase 1 definition of done

- [ ] `cargo tauri dev` compiles and runs without errors or warnings
- [ ] App opens as a frameless window with custom titlebar
- [ ] Titlebar is draggable, all three window controls work
- [ ] Lock screen renders correctly — logo, input, button, error state, create link
- [ ] `create_vault` creates a valid `.sgt` file with correct magic bytes
- [ ] `unlock_vault` with correct password succeeds and returns VaultMeta
- [ ] `unlock_vault` with wrong password returns clear error shown inline
- [ ] Correct password navigates to VaultBrowser placeholder
- [ ] `lock_vault` clears the key from memory
- [ ] Dark mode works via `prefers-color-scheme`
- [ ] App routes correctly on startup based on presence of `.sgt` file

---

---

# PHASE 2 — Vault browser and file manager

**Only start this phase when Phase 1 definition of done is fully satisfied.**

Before starting, tell Claude Code:
- "Phase 1 is complete and working"
- Paste the current file tree: `tree src/ src-tauri/src/`
- Paste this full document again

---

## What to build in Phase 2

Replace `VaultBrowser.tsx` placeholder with the full vault browser. Add file management Tauri commands.

### Vault Browser screen

Layout: sidebar (200px fixed) + main panel (flex 1). Custom titlebar at top spanning full width.

**Sidebar:**
- Section "Vault": My vault (active), Beneficiaries, Recovery sheet, Settings
- Section "Categories": Documents, Passwords, Crypto seeds, Personal — each with item count badge
- Footer: CompletionBar component (vault completeness 0–100%)

**Main panel:**
- Header: "My vault" title, item count + last modified subtitle, "Export PDF" secondary button, "+ Add file" primary button
- Category grid: 4 cards (Documents, Passwords, Crypto seeds, Personal) — each shows count
- Section heading "Recent files"
- FileList: rows with category colour icon, filename, date added, file size, category pill
- DropZone: dashed border, "Drop any file here to encrypt and add to vault"
- Section heading "Beneficiaries"
- BeneficiaryStrip: avatar initials, name, access summary, card status pill (Ready/Pending)

**Sidebar navigation** updates the main panel — clicking a category filters the file list to that category.

**Vault completeness scoring** (`src/lib/completeness.ts`):
- Has at least 1 document: +20
- Has at least 1 password entry: +20
- Has at least 1 personal message: +20
- Has at least 1 beneficiary with card printed: +20
- Has crypto seeds: +20
- Return 0–100

### New Tauri commands (commands/files.rs)

```rust
#[tauri::command]
pub async fn add_file(
    source_path: String,
    category: String,
    state: State<'_, AppState>,
) -> Result<FileEntry, String>
// Read file from source_path
// base64 encode the bytes
// Create FileEntry with uuid, name from path, category, size, timestamp, data
// Push to manifest.files
// Save vault
// Return FileEntry (without data field — data is never sent to frontend)

#[tauri::command]
pub async fn list_files(
    category: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<FileEntryMeta>, String>
// FileEntryMeta is FileEntry without the data field
// Filter by category if provided

#[tauri::command]
pub async fn get_file(
    id: String,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String>
// Find file by id in manifest
// Decode base64 data
// Return raw bytes (Tauri will handle binary response)

#[tauri::command]
pub async fn delete_file(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String>
// Remove from manifest.files
// Save vault

#[tauri::command]
pub async fn save_file_to_disk(
    id: String,
    output_path: String,
    state: State<'_, AppState>,
) -> Result<(), String>
// Get file bytes, write to output_path
```

### DropZone behaviour

- User drags a file onto the DropZone
- App calls `add_file` with the dropped file path
- Loading state on DropZone while encrypting
- File appears in list on success
- "+ Add file" button opens a system file picker via `@tauri-apps/plugin-dialog`

### Phase 2 definition of done

- [ ] Vault browser renders with correct sidebar + main panel layout
- [ ] Sidebar navigation works — clicking categories filters the file list
- [ ] "+ Add file" opens file picker, selected file appears in list
- [ ] Drag and drop onto DropZone works, file appears in list
- [ ] Files persist across lock/unlock cycles (stored in encrypted vault)
- [ ] Delete file removes it from the list and vault
- [ ] Vault completeness bar updates as files are added
- [ ] Beneficiary strip shows correctly (empty state if no beneficiaries yet)
- [ ] Dark mode correct throughout

---

---

# PHASE 3 — Beneficiary manager and Shamir key splitting

**Only start this phase when Phase 2 definition of done is fully satisfied.**

---

## What to build in Phase 3

Replace `BeneficiaryManager.tsx` placeholder. Add beneficiary and Shamir Tauri commands.

### Beneficiary Manager screen

**Top — Shamir controls:**
- "Shamir key splitting" section heading
- Explanation: "Your vault key is split into shards. Any K people must come together to unlock the vault. No single person can open it alone."
- Two steppers side by side: "Total shards" (N) and "Required to unlock" (K)
- Stepper constraints: K must always be ≤ N, minimum K=2, minimum N=2, maximum N=7
- Visual: N circles — first K are filled dark, rest are outlined dashed
- Below: "Any K of N unlocks the vault"
- Explanation box: "Each shard is mathematically worthless alone — reveals zero information below the threshold. Losing one shard is not catastrophic."

**Beneficiary cards:**
- Avatar (initials circle), name, email, role (Primary/Secondary)
- Shard badge: "Shard 1", "Shard 2" etc — dark background, cream text
- Card status pill: "Card printed" (green) or "Card pending" (amber)
- Access pills: coloured category pills showing what this person can see
- Actions: "Edit access", "Reprint card", "Remove"

**+ Add beneficiary** button opens inline form: name field, email field, access checkboxes (Documents, Passwords, Crypto seeds, Personal), Save button

### New Tauri commands (commands/beneficiaries.rs + commands/shamir.rs)

```rust
#[tauri::command]
pub async fn add_beneficiary(
    name: String,
    email: String,
    access: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Beneficiary, String>

#[tauri::command]
pub async fn update_beneficiary(
    id: String,
    name: Option<String>,
    email: Option<String>,
    access: Option<Vec<String>>,
    card_printed: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String>

#[tauri::command]
pub async fn remove_beneficiary(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String>

#[tauri::command]
pub async fn list_beneficiaries(
    state: State<'_, AppState>,
) -> Result<Vec<Beneficiary>, String>

#[tauri::command]
pub async fn configure_shamir(
    total: u8,
    required: u8,
    state: State<'_, AppState>,
) -> Result<(), String>
// Validate: required <= total, required >= 2, total <= 7
// Update manifest.shamir_config
// Save vault

#[tauri::command]
pub async fn generate_shards(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String>
// Get master key from state
// Use sharks crate to split into N shards
// base64 encode each shard
// Assign shard_index to each beneficiary in manifest
// Save vault
// Return vec of base64 shard strings (same order as beneficiaries)

#[tauri::command]
pub async fn reconstruct_from_shards(
    shards: Vec<String>,
    vault_path: String,
) -> Result<VaultMeta, String>
// base64 decode each shard
// Use sharks crate to reconstruct key
// Use reconstructed key to unlock vault at vault_path
// This is the recovery flow — no master password needed
```

### Shamir implementation (crypto/shamir.rs)

```rust
use sharks::{Share, Sharks};

pub fn split_key(key: &[u8; 32], total: u8, required: u8) -> Vec<Vec<u8>> {
    let sharks = Sharks(required);
    let dealer = sharks.dealer(key);
    dealer.take(total as usize)
        .map(|share| Vec::from(&share))
        .collect()
}

pub fn reconstruct_key(shards: Vec<Vec<u8>>, required: u8) -> Result<[u8; 32], String> {
    let sharks = Sharks(required);
    let shares: Vec<Share> = shards.iter()
        .map(|s| Share::try_from(s.as_slice()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Invalid shard data")?;
    let secret = sharks.recover(&shares)
        .map_err(|_| "Failed to reconstruct key — not enough valid shards")?;
    if secret.len() != 32 {
        return Err("Reconstructed key has wrong length".to_string());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&secret);
    Ok(key)
}
```

### Phase 3 definition of done

- [ ] Beneficiary manager screen renders correctly
- [ ] Add beneficiary works — person appears in list
- [ ] Edit access works — category pills update
- [ ] Remove beneficiary works
- [ ] Shamir N and K steppers work with correct constraints
- [ ] `generate_shards` splits the key and assigns shard indices to beneficiaries
- [ ] `reconstruct_from_shards` correctly reconstructs the key and unlocks the vault
- [ ] Shards persist in vault (shard_index stored per beneficiary)
- [ ] Card status tracked correctly (pending until printed)

---

---

# PHASE 4 — Recovery card PDF export

**Only start this phase when Phase 3 definition of done is fully satisfied.**

---

## What to build in Phase 4

Generate a printable PDF recovery card for each beneficiary and add a Recovery Card preview screen.

### Recovery Card PDF layout

One A4 page per beneficiary:

```
[Top]
  Signet logo mark (left) + "Signet" wordmark
  "Recovery card for [Name]" — large heading
  Horizontal rule

[Middle left — Instructions]
  "How to open the vault" heading
  Step 1: Download Signet from signetvault.com
  Step 2: Find the vault file — location: [vault path]
  Step 3: Open Signet, select "Open with recovery shard"
  Step 4: When prompted, scan the QR code on this card
  Step 5: If a second keyholder is needed, ask them to do the same
  Step 6: The vault will open

  "What you will find" heading
  List of categories this person has access to

[Middle right — QR code]
  Large QR code of the base64 shard string
  "Your key shard — keep this card safe"
  "This card alone cannot open the vault"

[Bottom]
  "In case of difficulty, visit signetvault.com"
  Date generated
  "This card was generated by Signet — an encrypted local vault"
```

### RecoveryCard screen

`src/screens/RecoveryCard.tsx`:
- List of beneficiaries with card status (printed / pending)
- Per-beneficiary: preview thumbnail, "Print card" / "Reprint card" button
- On print: call `export_recovery_pdf`, then open the PDF in system viewer
- On successful print: update card_printed = true for that beneficiary
- Warning banner if any beneficiary has card_printed = false: "Recovery cards not yet printed — your beneficiaries cannot access the vault without these"

### New Tauri command (commands/export.rs)

```rust
#[tauri::command]
pub async fn export_recovery_pdf(
    beneficiary_id: String,
    output_path: String,
    state: State<'_, AppState>,
) -> Result<(), String>
// Get beneficiary from manifest
// Get their shard (generate if not yet generated)
// Generate QR code from base64 shard using qrcode crate
// Render QR as PNG image bytes
// Build PDF using printpdf
// Write to output_path
// Return Ok(())
```

Use `@tauri-apps/plugin-shell` to open the PDF in the system default viewer after export.

Use `@tauri-apps/plugin-dialog` to let the user choose the output path.

### Phase 4 definition of done

- [ ] Recovery card screen renders with correct beneficiary list
- [ ] "Print card" generates a PDF at chosen path
- [ ] PDF opens in system viewer automatically
- [ ] PDF contains: beneficiary name, QR code, instructions, vault path, download URL
- [ ] QR code encodes the shard correctly (verify by scanning with phone)
- [ ] card_printed status updates to true after successful export
- [ ] Warning banner shows correctly when cards are not yet printed
- [ ] Reprinting a card works correctly

---

---

# PHASE 5 — Setup wizard and first-run flow

**Only start this phase when Phase 4 definition of done is fully satisfied.**

---

## What to build in Phase 5

Replace `SetupWizard.tsx` placeholder with the full 4-step wizard. Add completeness scoring. Polish first-run experience.

### Setup Wizard steps

**Step 1 — Welcome**
- Logo mark + "Signet" heading
- Three short lines explaining what the app does:
  - "Store your passwords, documents, and crypto seeds safely."
  - "Choose people you trust to receive them."
  - "No servers. No cloud. No subscriptions."
- "Begin setup →" button

**Step 2 — Master password**
- "Set your master password" heading
- Warning box: "This password is never stored. If you lose it, the vault cannot be opened. Write it down."
- Password input + confirm input
- StrengthMeter component (zxcvbn score 0–4, shown as 5 coloured bars)
- Argon2id explanation: "Your password is run through Argon2id — a memory-hard algorithm that makes brute-force attacks extremely expensive."
- Back / Continue buttons
- Continue disabled until passwords match and strength ≥ 2

**Step 3 — Beneficiaries**
- "Add the people who should receive access" heading
- Add beneficiary inline form (name, email, access checkboxes)
- Added beneficiaries appear as cards below
- Shamir N-of-K configurator (same as BeneficiaryManager)
- Explanation of Shamir in plain language
- Skip option: "I'll add beneficiaries later" (vault can be used without beneficiaries)
- Back / Continue buttons

**Step 4 — Recovery cards + save location**
- "Almost done" heading
- If beneficiaries added: show card export buttons per person — strongly encourage printing now
- Vault save location picker: "Where would you like to save your vault?"
  - Default: same folder as the executable
  - Option: choose folder via file dialog
- "Create my vault" button — calls `create_vault`, adds beneficiaries, generates shards, saves everything
- Loading state with "Encrypting your vault…" message

On completion: navigate to VaultBrowser.

### Completeness scoring updates

Update sidebar footer CompletionBar to reflect:
- Files added: Documents (20%), Passwords (20%), Crypto seeds (10%), Personal (10%)
- Beneficiaries: at least one with card printed (20%)
- Will/legal document specifically (20%)

Show tooltip on hover explaining what's missing.

### Phase 5 definition of done

- [ ] First-run (no .sgt file) shows wizard on launch
- [ ] All 4 steps render and navigate correctly
- [ ] Password strength meter works
- [ ] Back/Continue validation works (can't continue with mismatched passwords)
- [ ] Beneficiaries added in wizard persist in vault
- [ ] Recovery cards can be printed from within the wizard
- [ ] Vault save location can be changed
- [ ] "Create my vault" creates the vault, saves everything, navigates to browser
- [ ] CompletionBar updates correctly throughout the wizard
- [ ] Full flow from launch to unlocked vault works without errors

---

---

# PHASE 6 — USB packaging and portable builds

**Only start this phase when Phase 5 definition of done is fully satisfied.**

---

## What to build in Phase 6

Package Signet as a portable executable that runs directly from a USB drive with no installation.

### Portable build configuration

**Windows:**
- Use Tauri's `portable` build target (no installer, single .exe)
- App looks for `.sgt` file in same directory as the .exe
- Bundle all required DLLs into the output directory
- Target: `x86_64-pc-windows-msvc`

**macOS (future):**
- Standard `.app` bundle
- App looks for `.sgt` file alongside the .app
- Target: `aarch64-apple-darwin` (Apple Silicon) + `x86_64-apple-darwin` (Intel)
- Universal binary via `lipo`

### USB directory structure

```
/SIGNET_USB/
  Signet.exe              — Windows portable executable
  vault.sgt               — the encrypted vault (created by app on first run)
  README.txt              — plain English instructions
  /recovery/              — folder for printed recovery card PDFs
```

### README.txt content

```
SIGNET — Encrypted Vault
========================

This USB drive contains an encrypted vault.

TO OPEN THE VAULT (owner):
1. Double-click Signet.exe
2. Enter your master password
3. Your files will be accessible

TO OPEN THE VAULT (beneficiary after owner's death):
1. Double-click Signet.exe
2. Click "Open with recovery shard"
3. Scan the QR code from your recovery card
4. Ask other keyholders to do the same if required
5. The vault will open

If you need help: signetvault.com

This vault was created with Signet — a local, encrypted file vault.
No servers. No cloud. No subscriptions.
```

### GitHub Actions CI (optional but recommended)

Set up `.github/workflows/build.yml` to:
- Build Windows portable on push to `main`
- Upload artifact (the .exe + README.txt) as a release asset

### Phase 6 definition of done

- [ ] `cargo tauri build` produces a working Windows portable .exe
- [ ] App runs from USB with no installation on a clean Windows machine
- [ ] Vault file auto-detected in same directory as .exe
- [ ] README.txt is clear and correct
- [ ] App logo/icon set correctly in Tauri config (not default Tauri icon)
- [ ] macOS build target documented and attempted (can be marked future if no Mac available)

---

---

## General rules for all phases

- Read the full document before writing any code
- Build only the current phase — do not implement future phase features early
- After each file you create or modify, confirm it compiles before moving on
- Never modify the crypto layer (kdf.rs, cipher.rs) after Phase 1 — it is the foundation
- Always paste `tree src/ src-tauri/src/` output when starting a new session
- The key never leaves Rust — never return raw key bytes from any Tauri command
- Test the definition of done checklist before declaring a phase complete

---

*Signet — signetvault.com*
*Named for the ceremonial breaking of a signet ring at the moment of death — an 800-year-old practice of closing one chapter and beginning the handover.*
