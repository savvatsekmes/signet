# Signet — Claude Code Build Specification
> signetvault.com · An encrypted local vault for the people you leave behind

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

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Desktop shell | Tauri (Rust) | Native, tiny binary (~10MB), no Electron overhead, cross-platform |
| Frontend | React + TypeScript + Vite | Fast dev, component-based UI |
| Styling | Tailwind CSS (core utilities only) | Utility-first, no build step needed for base classes |
| Crypto | libsodium via `sodiumoxide` (Rust crate) | Audited, battle-tested, Argon2id + XChaCha20-Poly1305 |
| Key splitting | `sharks` Rust crate (Shamir's Secret Sharing) | Pure Rust, no dependencies |
| PDF generation | `printpdf` Rust crate | Recovery sheet export, no external dependencies |
| File format | Custom `.sgt` format (see below) | Purpose-built, no VeraCrypt dependency |
| State management | Zustand | Lightweight, no boilerplate |
| Icons | Lucide React | Consistent, tree-shakeable |

---

## Vault File Format (.sgt)

Every vault is a single portable file with this structure:

```
[HEADER - plaintext, 128 bytes]
  Magic bytes: SIGT (4 bytes)
  Version: u8 (1 byte)
  Argon2id salt: 16 bytes random
  XChaCha20 nonce: 24 bytes random
  Reserved: padding to 128 bytes

[ENCRYPTED BLOB - everything else]
  Contains (after decryption):
    - Virtual folder/file tree (JSON manifest)
    - All file contents (raw bytes)
    - Beneficiary metadata
    - Shamir shard assignments
    - Category tags per file
```

**Why this format:**
- Attacker who finds the file cannot determine what's inside (folder tree is encrypted)
- Magic bytes allow the app to identify valid vault files
- Nonce is unique per file, preventing nonce reuse attacks
- Salt is stored in plaintext (standard practice — security comes from the key, not the salt)

---

## Encryption Stack

```
Master Password
      ↓
Argon2id (memory: 64MB, iterations: 3, parallelism: 4)
      ↓
256-bit key
      ↓
XChaCha20-Poly1305 (authenticated encryption)
      ↓
Encrypted .sgt blob
```

**Argon2id parameters:**
- `m_cost`: 65536 (64 MB memory) — makes GPU brute-force expensive
- `t_cost`: 3 iterations
- `p_cost`: 4 parallel lanes
- Output: 32 bytes (256-bit key)

**XChaCha20-Poly1305:**
- 24-byte random nonce (new nonce on every save)
- Authenticated — detects tampering in addition to decryption
- Preferred over AES-GCM for this use case (no nonce-reuse catastrophe risk)

---

## Shamir Secret Sharing

The master key can optionally be split using Shamir's Secret Sharing:

- Split the 32-byte master key into N shards
- Any K of N shards reconstruct the original key
- Default: 2-of-3 (configurable: 2-of-5, 3-of-5, etc.)
- Each shard is mathematically random-looking alone — reveals zero information below threshold
- Shards are printed as QR codes on physical recovery cards

**Recovery flow:**
1. User dies / vault needs opening
2. Two keyholders meet (or coordinate)
3. Each scans their QR shard into the app
4. App reconstructs the master key
5. Vault unlocks

---

## Screen Inventory

### 1. Lock Screen (`/screens/LockScreen.tsx`)
- App logo (broken signet ring mark)
- App name + tagline: *"When the seal is broken, they'll know what to do"*
- Master password input (masked)
- `Unlock vault` button
- `Create new vault` link for first run
- Version number at bottom

**Tauri command:** `unlock_vault(password: String) -> Result<VaultMeta, String>`

---

### 2. Setup Wizard (`/screens/SetupWizard.tsx`)
4-step flow shown in a progress indicator:

**Step 1 — Welcome**
- Brief explanation of what Signet does
- "This app has no servers. Your data never leaves this device."
- CTA: Begin setup

**Step 2 — Master Password**
- Password input + confirm
- Strength meter (zxcvbn scoring)
- Argon2id explanation in plain language
- Warning: "This password is never stored. If you lose it, the vault cannot be opened."

**Step 3 — Beneficiaries**
- Add 1+ beneficiaries (name + email)
- Configure Shamir split (N-of-M selector)
- Assign item categories per person

**Step 4 — Recovery Cards**
- Preview of generated recovery card PDF
- Print prompt (strongly encouraged before finishing)
- Option to save vault to USB or local path

**Tauri command:** `create_vault(config: VaultConfig) -> Result<(), String>`

---

### 3. Main Vault (`/screens/VaultBrowser.tsx`)

**Sidebar:**
- My Vault (home)
- Beneficiaries
- Recovery Sheet
- Settings
- Category filters: Documents, Passwords, Crypto Seeds, Personal

**Main panel:**
- Header: vault name, item count, last modified
- Actions: Export PDF, + Add File
- Category grid (4 cards: Documents, Passwords, Crypto Seeds, Personal)
- Recent files list (icon, name, date, size, category tag)
- Drop zone: drag any file to encrypt and add
- Beneficiary status strip (avatar, name, access level, card status pill)

**Vault completeness bar** in sidebar footer — nudges user toward finishing setup (will uploaded? recovery card printed? crypto seeds added?)

**Tauri commands:**
- `get_vault_contents() -> Result<VaultContents, String>`
- `add_file(path: String, category: Category) -> Result<FileEntry, String>`
- `delete_file(id: String) -> Result<(), String>`
- `get_file(id: String) -> Result<Vec<u8>, String>`

---

### 4. Beneficiary Manager (`/screens/BeneficiaryManager.tsx`)

**Top section — Shamir controls:**
- Total shards stepper (N)
- Required to unlock stepper (K)
- Visual representation: N circles, K filled = "any K of N unlocks"
- Explanation: "Each shard is mathematically worthless alone"

**Beneficiary cards (one per person):**
- Avatar initials + name + email
- Shard badge (Shard 1, Shard 2, etc.)
- Card status pill (Printed / Pending)
- Access pills (which categories they can see)
- Actions: Edit access, Reprint card, Remove

**Tauri commands:**
- `add_beneficiary(beneficiary: Beneficiary) -> Result<(), String>`
- `update_beneficiary(id: String, updates: BeneficiaryUpdate) -> Result<(), String>`
- `remove_beneficiary(id: String) -> Result<(), String>`
- `generate_shards() -> Result<Vec<Shard>, String>`

---

### 5. Recovery Card Export (`/screens/RecoveryCard.tsx`)

Generated PDF for each beneficiary containing:
- Signet logo
- Beneficiary name
- QR code of their key shard
- Step-by-step instructions (written for someone non-technical)
- What they'll find in the vault
- signetvault.com URL for app download
- Vault file location reminder

**Instructions on the card (plain language):**
1. Download Signet from signetvault.com
2. Find the vault file (`.sgt`) — location printed here
3. Open Signet and select "Open with recovery shard"
4. Scan the QR code on this card
5. If a second keyholder is required, ask them to do the same
6. The vault will unlock

**Tauri command:** `export_recovery_pdf(beneficiary_id: String) -> Result<String, String>`

---

### 6. Settings (`/screens/Settings.tsx`)
- Change master password
- Change vault file location
- Export vault backup
- Re-generate Shamir shards
- App version + licence
- Danger zone: Delete vault

---

## Rust Backend Structure

```
src-tauri/
  src/
    main.rs              — Tauri app entry point
    commands/
      vault.rs           — create, unlock, lock, backup
      files.rs           — add, get, delete, list
      beneficiaries.rs   — CRUD + shard generation
      export.rs          — PDF recovery card generation
    crypto/
      kdf.rs             — Argon2id key derivation
      cipher.rs          — XChaCha20-Poly1305 encrypt/decrypt
      shamir.rs          — Shard generation and reconstruction
    vault/
      format.rs          — .sgt file read/write
      manifest.rs        — Virtual file tree structure
    state.rs             — App state (unlocked key held in memory)
```

---

## Frontend Structure

```
src/
  App.tsx                — Route controller (lock → wizard → main)
  screens/
    LockScreen.tsx
    SetupWizard.tsx
    VaultBrowser.tsx
    BeneficiaryManager.tsx
    RecoveryCard.tsx
    Settings.tsx
  components/
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
  hooks/
    useVault.ts          — vault state + Tauri commands
    useBeneficiaries.ts
    useFiles.ts
  store/
    vaultStore.ts        — Zustand store
  lib/
    tauri.ts             — typed wrappers around invoke()
    categories.ts        — category definitions + colours
```

---

## Design System

**Colours:**
- Primary: `#1a0a0a` (near-black, dark red undertone — wax seal)
- Accent: `#8B1A1A` (deep red — the wax itself)
- Background: system default (light/dark mode aware)
- Category colours:
  - Documents: `#FAECE7` / `#712B13` (coral)
  - Passwords: `#EEEDFE` / `#3C3489` (purple)
  - Crypto: `#EAF3DE` / `#27500A` (green)
  - Personal: `#FBEAF0` / `#72243E` (pink)

**Typography:**
- System font stack
- Two weights only: 400 regular, 500 medium
- Never bold/700

**Borders:** 0.5px — refined, not heavy

**Logo:** Signet ring with a crack/break through it, pressed into a circle. Dark background, wax-red ring graphic.

---

## Build Phases for Claude Code

### Phase 1 — Shell & crypto (start here)
```
Build the Tauri app shell with:
- React + TypeScript + Vite frontend
- Lock screen UI (password input, unlock button, create vault link)
- Rust backend with Argon2id key derivation (sodiumoxide crate)
- XChaCha20-Poly1305 encrypt/decrypt functions
- Basic .sgt file create and open (header + encrypted empty manifest)
- Tauri commands: create_vault, unlock_vault, lock_vault
- App state holding decrypted key in memory only (never written to disk)
```

### Phase 2 — File manager
```
Add to the working Phase 1 app:
- VaultBrowser screen with sidebar + main panel
- Virtual folder/file tree stored inside encrypted blob
- Tauri commands: add_file, get_file, delete_file, list_files
- Drag and drop files into the vault (DropZone component)
- Category assignment on add
- File list with icon, name, date, size, category tag
- Re-encrypt and save vault on every change
```

### Phase 3 — Beneficiaries & Shamir
```
Add to the working Phase 2 app:
- BeneficiaryManager screen
- CRUD for beneficiaries stored inside encrypted blob
- Shamir's Secret Sharing via `sharks` crate
- Generate N shards from the master key
- Assign shard to each beneficiary
- N-of-K configurator UI (stepper controls)
- Visual shard representation
- Store shard assignments inside vault
```

### Phase 4 — Recovery card export
```
Add to the working Phase 3 app:
- PDF generation via printpdf crate
- Recovery card layout per beneficiary:
  - Logo, name, QR code of shard, step-by-step instructions
  - Vault file location reminder
  - signetvault.com download URL
- QR code generation from shard bytes
- Export to disk + open in system PDF viewer
- RecoveryCard preview screen in app
- Card status tracking (printed / pending) stored in vault
```

### Phase 5 — Setup wizard
```
Add to the working Phase 4 app:
- 4-step SetupWizard screen
- Step 1: Welcome
- Step 2: Master password with strength meter (zxcvbn)
- Step 3: Add first beneficiary + configure Shamir split
- Step 4: Print recovery card + choose vault save location
- First-run detection (no .sgt file found)
- Vault completeness scoring (shown in sidebar health bar)
```

### Phase 6 — USB & packaging
```
Package the working Phase 5 app for USB deployment:
- Tauri portable build (no installation required)
- Auto-detect vault file in same directory as executable
- Windows, macOS, Linux builds
- Small launcher that opens app directly from USB
- README.txt in root of USB with plain-language instructions
```

---

## Security Notes for Claude Code

- **The master key must never be written to disk** — hold in Tauri app state (memory only), cleared on lock
- **New nonce on every save** — generate fresh 24-byte random nonce each time vault is written
- **Wipe memory after use** — zero out key bytes when locking (use `zeroize` crate)
- **No logging of sensitive data** — ensure Tauri's debug logging never captures passwords or key material
- **Verify SIGT magic bytes** before attempting decryption — fail gracefully on corrupt files
- **Authenticated encryption** — XChaCha20-Poly1305 will return an error if the file has been tampered with; surface this clearly to the user

---

## Tauri Command Reference

```rust
// Vault lifecycle
#[tauri::command] create_vault(password: String, config: VaultConfig) -> Result<(), String>
#[tauri::command] unlock_vault(path: String, password: String) -> Result<VaultMeta, String>
#[tauri::command] lock_vault() -> Result<(), String>
#[tauri::command] change_password(old: String, new: String) -> Result<(), String>

// Files
#[tauri::command] add_file(path: String, category: String) -> Result<FileEntry, String>
#[tauri::command] get_file(id: String) -> Result<Vec<u8>, String>
#[tauri::command] delete_file(id: String) -> Result<(), String>
#[tauri::command] list_files(category: Option<String>) -> Result<Vec<FileEntry>, String>

// Beneficiaries
#[tauri::command] add_beneficiary(name: String, email: String) -> Result<Beneficiary, String>
#[tauri::command] update_beneficiary(id: String, updates: serde_json::Value) -> Result<(), String>
#[tauri::command] remove_beneficiary(id: String) -> Result<(), String>
#[tauri::command] list_beneficiaries() -> Result<Vec<Beneficiary>, String>

// Shamir
#[tauri::command] configure_shamir(total: u8, required: u8) -> Result<(), String>
#[tauri::command] generate_shards() -> Result<Vec<Shard>, String>
#[tauri::command] reconstruct_from_shards(shards: Vec<String>) -> Result<(), String>

// Export
#[tauri::command] export_recovery_pdf(beneficiary_id: String, output_path: String) -> Result<(), String>
#[tauri::command] export_vault_backup(output_path: String) -> Result<(), String>
```

---

## Key Dependencies (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sodiumoxide = "0.2"          # libsodium bindings (Argon2id + XChaCha20)
sharks = "0.5"               # Shamir's Secret Sharing
printpdf = "0.6"             # PDF generation
qrcode = "0.13"              # QR code generation for recovery cards
zeroize = "1.7"              # Secure memory zeroing
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
```

---

## Key Dependencies (package.json)

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "@tauri-apps/api": "^2",
    "zustand": "^4",
    "lucide-react": "^0.383",
    "zxcvbn": "^4.4",
    "clsx": "^2"
  },
  "devDependencies": {
    "typescript": "^5",
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "tailwindcss": "^3",
    "@tauri-apps/cli": "^2"
  }
}
```

---

## First Claude Code Prompt (copy-paste this)

```
Build a Tauri desktop app called Signet — an encrypted local file vault.

Tech stack:
- Tauri 2 + React 18 + TypeScript + Vite frontend
- Rust backend with sodiumoxide crate for crypto
- Tailwind CSS for styling (core utilities only)

Phase 1 requirements:

1. LOCK SCREEN
   Create src/screens/LockScreen.tsx with:
   - App logo placeholder (dark square, 64x64, rounded-2xl)
   - App name "Signet" in 20px/500 weight
   - Tagline "When the seal is broken, they'll know what to do" in 12px muted
   - Password input field (type="password", full width)
   - "Unlock vault" button (dark background #1a0a0a, cream text #f5f0eb)
   - "Create new vault" link below a divider
   - App routes: if no vault exists → SetupWizard, if vault exists → LockScreen

2. RUST CRYPTO LAYER
   Create src-tauri/src/crypto/kdf.rs:
   - derive_key(password: &str, salt: &[u8]) -> [u8; 32]
   - Uses sodiumoxide's pwhash::argon2id13
   - Parameters: OPSLIMIT_INTERACTIVE, MEMLIMIT_INTERACTIVE

   Create src-tauri/src/crypto/cipher.rs:
   - encrypt(key: &[u8; 32], plaintext: &[u8]) -> Vec<u8>
   - decrypt(key: &[u8; 32], ciphertext: &[u8]) -> Result<Vec<u8>, String>
   - Uses XChaCha20-Poly1305 (secretstream or secretbox)
   - Prepends random 24-byte nonce to ciphertext

3. VAULT FILE FORMAT
   Create src-tauri/src/vault/format.rs:
   - VaultHeader struct: magic [u8; 4] = *b"SIGT", version u8, salt [u8; 16], reserved [u8; 107]
   - create_vault(path: &str, password: &str) -> Result<(), String>
     - Generate random salt
     - Derive key via Argon2id
     - Create empty manifest JSON: {"files": [], "beneficiaries": []}
     - Encrypt manifest
     - Write header + encrypted blob to .sgt file
   - unlock_vault(path: &str, password: &str) -> Result<AppState, String>
     - Read header, extract salt
     - Derive key
     - Decrypt blob
     - Parse manifest JSON
     - Return AppState with key held in memory

4. TAURI COMMANDS
   Create src-tauri/src/commands/vault.rs:
   - create_vault(password: String, path: String) -> Result<(), String>
   - unlock_vault(password: String, path: String) -> Result<VaultMeta, String>
   - lock_vault() -> Result<(), String>
   Register all commands in main.rs

5. APP STATE
   - Hold decrypted key in Tauri managed state (Arc<Mutex<Option<[u8;32]>>>)
   - Clear key from memory on lock_vault()
   - Use zeroize crate to securely zero key bytes on drop

The app should compile and run with:
- tauri dev

On first run: show a placeholder SetupWizard screen that just says "Setup wizard coming in Phase 2"
On unlock: show a placeholder VaultBrowser screen that just says "Vault browser coming in Phase 2"

Keep the lock screen design minimal and dark — this is a serious security tool. No gradients. Clean flat surfaces. System font.
```

---

## Notes for Future Phases

When building Phase 2+, always give Claude Code the full context:
- Paste this spec document
- Paste the current file structure (`tree src/ src-tauri/src/`)
- Describe exactly what's working so far
- Ask for one phase at a time

The crypto layer built in Phase 1 should never be modified in later phases — it's the foundation everything else rests on.

---

*Signet — signetvault.com*
*Named for the ceremonial breaking of a signet ring at the moment of death — an 800-year-old practice of closing one chapter and beginning the handover.*
