use crate::crypto::{cipher, kdf};
use crate::vault::manifest::VaultManifest;
use sodiumoxide::crypto::pwhash::argon2id13;
use std::fs;

const MAGIC: &[u8; 4] = b"SIGT";
const HEADER_SIZE: usize = 128;
const SALT_OFFSET: usize = 5;
// Vault format reserves 32 bytes (5..37) for salt; libsodium argon2id13 uses 16.
// The first SALT_BYTES bytes hold the salt; the remainder of the reserved region is zero.
const SALT_BYTES: usize = argon2id13::SALTBYTES;

// Optional plaintext display name lives in the previously-reserved region.
// Byte 37 is the length (0..=NAME_MAX_BYTES); bytes 38..(38+NAME_MAX_BYTES) hold UTF-8.
const NAME_LEN_OFFSET: usize = 37;
const NAME_OFFSET: usize = 38;
pub const NAME_MAX_BYTES: usize = 64;

// Brute-force lockout state lives in the previously-reserved tail of the header.
// Stored in plaintext (so we can gate decryption attempts), small, and travels
// with the vault file. Any attacker with file-write access can wipe it — this
// guards against casual / accidental misuse, not a determined offline attacker
// (the real defence there is Argon2id making each guess expensive).
//
// Layout:
//   102..110  i64 little-endian: lockout_until (unix seconds, 0 = not locked)
//   110       u8: failed_attempts (consecutive)
//   111       u8: consecutive_lockouts (for escalation)
//   112..128  reserved
const LOCKOUT_UNTIL_OFFSET: usize = 102;
const FAILED_ATTEMPTS_OFFSET: usize = 110;
const CONSECUTIVE_LOCKOUTS_OFFSET: usize = 111;
pub const ATTEMPTS_BEFORE_LOCKOUT: u8 = 5;

#[derive(Clone, Copy, Debug, Default)]
pub struct LockoutState {
    pub failed_attempts: u8,
    pub consecutive_lockouts: u8,
    pub lockout_until: i64,
}

impl LockoutState {
    pub fn is_locked(&self) -> bool {
        chrono::Utc::now().timestamp() < self.lockout_until
    }

    pub fn seconds_remaining(&self) -> i64 {
        (self.lockout_until - chrono::Utc::now().timestamp()).max(0)
    }
}

/// Lockout schedule. consecutive_lockouts is read BEFORE incrementing — so 0
/// means "this is the first lockout in the current bad-streak", 1 means
/// "second in a row", etc.
///   1st: 1 hour
///   2nd: 1 hour
///   3rd: 3 hours    (escalation begins)
///   4th: 6 hours
///   5th: 12 hours
///   6th+: 24 hours
pub fn lockout_duration_seconds(consecutive_so_far: u8) -> i64 {
    match consecutive_so_far {
        0 | 1 => 60 * 60,
        2 => 3 * 60 * 60,
        3 => 6 * 60 * 60,
        4 => 12 * 60 * 60,
        _ => 24 * 60 * 60,
    }
}

pub fn read_lockout(path: &str) -> Result<LockoutState, String> {
    let data = fs::read(path).map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }
    let mut buf = [0u8; 8];
    buf.copy_from_slice(&data[LOCKOUT_UNTIL_OFFSET..LOCKOUT_UNTIL_OFFSET + 8]);
    Ok(LockoutState {
        failed_attempts: data[FAILED_ATTEMPTS_OFFSET],
        consecutive_lockouts: data[CONSECUTIVE_LOCKOUTS_OFFSET],
        lockout_until: i64::from_le_bytes(buf),
    })
}

pub fn write_lockout(path: &str, state: &LockoutState) -> Result<(), String> {
    let mut data = fs::read(path).map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }
    let bytes = state.lockout_until.to_le_bytes();
    data[LOCKOUT_UNTIL_OFFSET..LOCKOUT_UNTIL_OFFSET + 8].copy_from_slice(&bytes);
    data[FAILED_ATTEMPTS_OFFSET] = state.failed_attempts;
    data[CONSECUTIVE_LOCKOUTS_OFFSET] = state.consecutive_lockouts;
    fs::write(path, &data).map_err(|e| format!("Failed to update vault: {}", e))?;
    Ok(())
}

/// Apply the rules: increment failed_attempts; if it reached the threshold,
/// flip into a locked state and increment the consecutive-lockout counter.
/// Returns the post-increment state.
pub fn record_failed_attempt(path: &str) -> Result<LockoutState, String> {
    let mut state = read_lockout(path)?;
    state.failed_attempts = state.failed_attempts.saturating_add(1);
    if state.failed_attempts >= ATTEMPTS_BEFORE_LOCKOUT {
        let dur = lockout_duration_seconds(state.consecutive_lockouts);
        state.lockout_until = chrono::Utc::now().timestamp() + dur;
        state.consecutive_lockouts = state.consecutive_lockouts.saturating_add(1);
        state.failed_attempts = 0;
    }
    write_lockout(path, &state)?;
    Ok(state)
}

pub fn reset_lockout(path: &str) -> Result<(), String> {
    write_lockout(path, &LockoutState::default())
}

pub fn create_vault(path: &str, password: &str) -> Result<(), String> {
    let salt = kdf::generate_salt();
    let key = kdf::derive_key(password, &salt);
    let manifest = VaultManifest::empty();
    let json =
        serde_json::to_vec(&manifest).map_err(|e| format!("Serialisation error: {}", e))?;
    let encrypted = cipher::encrypt(&key, &json)?;
    let mut header = vec![0u8; HEADER_SIZE];
    header[0..4].copy_from_slice(MAGIC);
    header[4] = 1;
    header[SALT_OFFSET..SALT_OFFSET + SALT_BYTES].copy_from_slice(&salt.0);
    let mut file_data = header;
    file_data.extend_from_slice(&encrypted);
    fs::write(path, file_data).map_err(|e| format!("Failed to write vault file: {}", e))?;
    Ok(())
}

pub fn unlock_vault(path: &str, password: &str) -> Result<(VaultManifest, [u8; 32]), String> {
    // Refuse early if the vault is currently locked out.
    let state = read_lockout(path)?;
    if state.is_locked() {
        return Err(format!(
            "Vault is locked. Try again in {} seconds.",
            state.seconds_remaining()
        ));
    }

    let data = fs::read(path).map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }
    let salt_bytes = &data[SALT_OFFSET..SALT_OFFSET + SALT_BYTES];
    let salt = argon2id13::Salt::from_slice(salt_bytes).ok_or("Corrupted vault salt")?;
    let key = kdf::derive_key(password, &salt);
    let decrypted = match cipher::decrypt(&key, &data[HEADER_SIZE..]) {
        Ok(d) => d,
        Err(e) => {
            // Wrong password (or corrupted vault). Bump the failed counter;
            // if it reached the threshold we just got locked out.
            let _ = record_failed_attempt(path);
            return Err(e);
        }
    };
    let manifest: VaultManifest =
        serde_json::from_slice(&decrypted).map_err(|_| "Corrupted vault manifest")?;
    // Successful unlock — wipe lockout state.
    let _ = reset_lockout(path);
    Ok((manifest, key))
}

/// Decrypt a vault file using a key supplied directly (e.g. reconstructed from Shamir shards).
pub fn unlock_with_key(path: &str, key: &[u8; 32]) -> Result<VaultManifest, String> {
    // Same lockout gate as password unlock.
    let state = read_lockout(path)?;
    if state.is_locked() {
        return Err(format!(
            "Vault is locked. Try again in {} seconds.",
            state.seconds_remaining()
        ));
    }
    let data = fs::read(path).map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }
    let decrypted = match cipher::decrypt(key, &data[HEADER_SIZE..]) {
        Ok(d) => d,
        Err(e) => {
            let _ = record_failed_attempt(path);
            return Err(e);
        }
    };
    let manifest: VaultManifest =
        serde_json::from_slice(&decrypted).map_err(|_| "Corrupted vault manifest")?;
    let _ = reset_lockout(path);
    Ok(manifest)
}

pub fn read_display_name(path: &str) -> Result<Option<String>, String> {
    let data = fs::read(path).map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }
    let len = data[NAME_LEN_OFFSET] as usize;
    if len == 0 || len > NAME_MAX_BYTES {
        return Ok(None);
    }
    let bytes = &data[NAME_OFFSET..NAME_OFFSET + len];
    Ok(std::str::from_utf8(bytes).ok().map(str::to_string))
}

pub fn write_display_name(path: &str, name: &str) -> Result<(), String> {
    let bytes = name.as_bytes();
    if bytes.len() > NAME_MAX_BYTES {
        return Err(format!(
            "Display name too long (max {} bytes, got {})",
            NAME_MAX_BYTES,
            bytes.len()
        ));
    }
    let mut data = fs::read(path).map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }
    data[NAME_LEN_OFFSET] = bytes.len() as u8;
    for i in NAME_OFFSET..NAME_OFFSET + NAME_MAX_BYTES {
        data[i] = 0;
    }
    if !bytes.is_empty() {
        data[NAME_OFFSET..NAME_OFFSET + bytes.len()].copy_from_slice(bytes);
    }
    fs::write(path, &data).map_err(|e| format!("Failed to update vault: {}", e))?;
    Ok(())
}

/// Re-encrypt the vault with a new master password. Generates a fresh salt,
/// derives a new key, re-encrypts the existing manifest. Returns the new key.
pub fn change_master_password(
    path: &str,
    old_password: &str,
    new_password: &str,
) -> Result<[u8; 32], String> {
    if new_password.is_empty() {
        return Err("New password cannot be empty".to_string());
    }
    let data = fs::read(path).map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }

    // Verify old password by decrypting with the existing salt + key.
    let old_salt_bytes = &data[SALT_OFFSET..SALT_OFFSET + SALT_BYTES];
    let old_salt = argon2id13::Salt::from_slice(old_salt_bytes).ok_or("Corrupted vault salt")?;
    let old_key = kdf::derive_key(old_password, &old_salt);
    let plaintext = cipher::decrypt(&old_key, &data[HEADER_SIZE..])
        .map_err(|_| "Current password is incorrect")?;

    // Generate a fresh salt + key, re-encrypt with new fresh secretstream header.
    let new_salt = kdf::generate_salt();
    let new_key = kdf::derive_key(new_password, &new_salt);
    let new_encrypted = cipher::encrypt(&new_key, &plaintext)?;

    // Rebuild the header with the new salt; preserve the rest (display name, padding).
    let mut new_data = data[..HEADER_SIZE].to_vec();
    for i in 0..SALT_BYTES {
        new_data[SALT_OFFSET + i] = new_salt.0[i];
    }
    new_data.extend_from_slice(&new_encrypted);
    fs::write(path, new_data).map_err(|e| format!("Failed to write vault: {}", e))?;
    Ok(new_key)
}

pub fn save_vault(path: &str, key: &[u8; 32], manifest: &VaultManifest) -> Result<(), String> {
    let existing = fs::read(path).map_err(|_| "Cannot read existing vault to save")?;
    if existing.len() < HEADER_SIZE {
        return Err("Existing vault file is corrupted".to_string());
    }
    let json =
        serde_json::to_vec(manifest).map_err(|e| format!("Serialisation error: {}", e))?;
    let encrypted = cipher::encrypt(key, &json)?;
    let mut file_data = existing[..HEADER_SIZE].to_vec();
    file_data.extend_from_slice(&encrypted);
    fs::write(path, file_data).map_err(|e| format!("Failed to save vault: {}", e))?;
    Ok(())
}
