use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VaultManifest {
    pub version: u8,
    pub created_at: String,
    pub files: Vec<FileEntry>,
    pub beneficiaries: Vec<Beneficiary>,
    pub shamir_config: ShamirConfig,
    /// Base64-encoded shards (length == shamir_config.total when generated, else empty).
    /// Beneficiary.shard_index points into this vec. Encrypted at rest with the rest of the manifest.
    #[serde(default)]
    pub shards: Vec<String>,
    /// Structured password entries. Field set is intentionally compatible with
    /// Google Passwords / Bitwarden / 1Password CSV exports for future imports.
    #[serde(default)]
    pub passwords: Vec<PasswordEntry>,
    /// Structured documents authored inside Signet (rich-text HTML).
    #[serde(default)]
    pub documents: Vec<DocumentEntry>,
    /// Structured crypto wallet seed entries.
    #[serde(default)]
    pub seeds: Vec<SeedEntry>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SeedEntry {
    pub id: String,
    pub name: String,
    /// Free-text chain label (Bitcoin, Ethereum, Solana, ...).
    #[serde(default)]
    pub chain: String,
    /// Hardware / Software / Paper / Other.
    #[serde(default)]
    pub wallet_type: String,
    /// The actual recovery phrase / mnemonic (BIP39 or otherwise).
    pub seed_phrase: String,
    #[serde(default)]
    pub derivation_path: Option<String>,
    /// Public address — useful so beneficiaries can confirm the wallet.
    #[serde(default)]
    pub public_address: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocumentEntry {
    pub id: String,
    pub title: String,
    /// HTML content from the in-app editor.
    pub content: String,
    /// Free-text section ("House things", "Letters", ...). Empty = unsorted.
    /// Surfaced in the UI as "Tag".
    #[serde(default)]
    pub section: String,
    /// Which top-level surface this entry belongs to. One of:
    ///   "documents" (default — also covers all legacy entries)
    ///   "personal"  (notes, letters to people)
    /// Future kinds can be added without migration.
    #[serde(default = "default_doc_kind")]
    pub kind: String,
    pub created_at: String,
    pub updated_at: String,
}

fn default_doc_kind() -> String {
    "documents".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PasswordEntry {
    pub id: String,
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
    /// Free-text folder ("Banking", "Work", ...). Empty = unsorted, shown
    /// under the "Main" folder in the UI. Surfaced as "Folder".
    #[serde(default)]
    pub section: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileEntry {
    pub id: String,
    pub name: String,
    pub category: String,
    pub size: u64,
    pub added_at: String,
    pub data: String,
    /// Optional section (used by the Documents panel to group items).
    /// Empty / missing = unsectioned (treated as "Main" by the UI).
    #[serde(default)]
    pub section: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Beneficiary {
    pub id: String,
    pub name: String,
    pub email: String,
    pub shard_index: Option<u8>,
    pub access: Vec<String>,
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
    pub password_count: u32,
    pub document_count: u32,
    pub personal_count: u32,
    pub seed_count: u32,
    pub created_at: String,
    pub shamir: ShamirConfig,
    pub shards_generated: bool,
}

/// File metadata returned to the frontend. Excludes `data` so encrypted
/// bytes are never sent across the Tauri boundary.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileEntryMeta {
    pub id: String,
    pub name: String,
    pub category: String,
    pub size: u64,
    pub added_at: String,
    pub section: String,
}

impl From<&FileEntry> for FileEntryMeta {
    fn from(entry: &FileEntry) -> Self {
        FileEntryMeta {
            id: entry.id.clone(),
            name: entry.name.clone(),
            category: entry.category.clone(),
            size: entry.size,
            added_at: entry.added_at.clone(),
            section: entry.section.clone(),
        }
    }
}

impl VaultManifest {
    pub fn empty() -> Self {
        VaultManifest {
            version: 1,
            created_at: chrono::Utc::now().to_rfc3339(),
            files: vec![],
            beneficiaries: vec![],
            shamir_config: ShamirConfig {
                total: 3,
                required: 2,
            },
            shards: vec![],
            passwords: vec![],
            documents: vec![],
            seeds: vec![],
        }
    }

    pub fn to_meta(&self) -> VaultMeta {
        let mut document_count = 0u32;
        let mut personal_count = 0u32;
        for d in &self.documents {
            if d.kind == "personal" {
                personal_count += 1;
            } else {
                document_count += 1;
            }
        }
        VaultMeta {
            item_count: self.files.len() as u32,
            beneficiary_count: self.beneficiaries.len() as u32,
            password_count: self.passwords.len() as u32,
            document_count,
            personal_count,
            seed_count: self.seeds.len() as u32,
            created_at: self.created_at.clone(),
            shamir: self.shamir_config.clone(),
            shards_generated: !self.shards.is_empty(),
        }
    }
}
