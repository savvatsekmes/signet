use crate::crypto::{cipher, kdf, yubikey};
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
//   112       u8: yubikey_enabled flag (0 = none, 1 = block follows after header)
//   113..128  reserved
const LOCKOUT_UNTIL_OFFSET: usize = 102;
const FAILED_ATTEMPTS_OFFSET: usize = 110;
const CONSECUTIVE_LOCKOUTS_OFFSET: usize = 111;
const YUBIKEY_FLAG_OFFSET: usize = 112;
pub const ATTEMPTS_BEFORE_LOCKOUT: u8 = 5;

// Layout of the optional YubiKey block, when YUBIKEY_FLAG_OFFSET = 1:
//   header[HEADER_SIZE..HEADER_SIZE + HMAC_SALT_LEN]    hmac-secret salt
//   header[HEADER_SIZE + HMAC_SALT_LEN..+2]             u16 LE credential id length N
//   header[..+ N]                                       credential id
//   ciphertext follows
const HMAC_SALT_LEN: usize = yubikey::HMAC_SALT_LEN;
const CREDENTIAL_LEN_BYTES: usize = 2;
// Practical cap; FIDO2 credential IDs are typically 64-128 bytes.
const MAX_CREDENTIAL_ID_LEN: usize = 1024;

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

/// In-memory representation of a parsed YubiKey block, with the byte
/// offset at which the ciphertext starts.
struct YubikeyBlock {
    salt: [u8; HMAC_SALT_LEN],
    credential_id: Vec<u8>,
    ciphertext_start: usize,
}

/// Parse the YubiKey block (if present) and return where the ciphertext
/// begins. Returns Ok(None) when the flag byte is zero — vault has no
/// hardware key enrolled.
fn parse_yubikey_block(data: &[u8]) -> Result<Option<YubikeyBlock>, String> {
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if data[YUBIKEY_FLAG_OFFSET] == 0 {
        return Ok(None);
    }
    let salt_start = HEADER_SIZE;
    let len_start = salt_start + HMAC_SALT_LEN;
    if data.len() < len_start + CREDENTIAL_LEN_BYTES {
        return Err("Vault yubikey block is truncated".to_string());
    }
    let mut salt = [0u8; HMAC_SALT_LEN];
    salt.copy_from_slice(&data[salt_start..len_start]);
    let mut len_bytes = [0u8; 2];
    len_bytes.copy_from_slice(&data[len_start..len_start + 2]);
    let cred_len = u16::from_le_bytes(len_bytes) as usize;
    if cred_len == 0 || cred_len > MAX_CREDENTIAL_ID_LEN {
        return Err("Vault yubikey credential id has an invalid length".to_string());
    }
    let cred_start = len_start + CREDENTIAL_LEN_BYTES;
    let cred_end = cred_start + cred_len;
    if data.len() < cred_end {
        return Err("Vault yubikey block is truncated".to_string());
    }
    let credential_id = data[cred_start..cred_end].to_vec();
    Ok(Some(YubikeyBlock {
        salt,
        credential_id,
        ciphertext_start: cred_end,
    }))
}

/// Cheap probe — does this vault require a YubiKey to unlock?
pub fn has_yubikey(path: &str) -> Result<bool, String> {
    let data = fs::read(path).map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }
    Ok(data[YUBIKEY_FLAG_OFFSET] != 0)
}

/// Read the (credential_id, salt) for a yubikey-enabled vault. Used by the
/// frontend immediately after the user supplies a password so we can prompt
/// for the physical key.
pub fn read_yubikey_block(path: &str) -> Result<Option<(Vec<u8>, [u8; HMAC_SALT_LEN])>, String> {
    let data = fs::read(path).map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }
    Ok(parse_yubikey_block(&data)?.map(|b| (b.credential_id, b.salt)))
}

/// Build the bytes for the YubiKey block (without the header itself).
fn build_yubikey_block(salt: &[u8; HMAC_SALT_LEN], credential_id: &[u8]) -> Result<Vec<u8>, String> {
    if credential_id.is_empty() || credential_id.len() > MAX_CREDENTIAL_ID_LEN {
        return Err("Refusing to enrol a yubikey credential id of invalid length".to_string());
    }
    let mut out = Vec::with_capacity(HMAC_SALT_LEN + CREDENTIAL_LEN_BYTES + credential_id.len());
    out.extend_from_slice(salt);
    out.extend_from_slice(&(credential_id.len() as u16).to_le_bytes());
    out.extend_from_slice(credential_id);
    Ok(out)
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

pub fn unlock_vault(
    path: &str,
    password: &str,
    yubikey_pin: Option<&str>,
) -> Result<(VaultManifest, [u8; 32]), String> {
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

    // If the vault has a YubiKey enrolled, talk to it now so we can mix the
    // hmac-secret output into Argon2id alongside the password.
    let (yubikey_secret, ciphertext_start) = match parse_yubikey_block(&data)? {
        Some(block) => {
            let secret = yubikey::assert(&block.credential_id, &block.salt, yubikey_pin)?;
            (Some(secret), block.ciphertext_start)
        }
        None => (None, HEADER_SIZE),
    };
    let extra: Option<&[u8]> = yubikey_secret.as_ref().map(|s| s.as_ref());
    let key = kdf::derive_key_with_secret(password, &salt, extra);

    let decrypted = match cipher::decrypt(&key, &data[ciphertext_start..]) {
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
/// Shamir reconstruction bypasses the YubiKey requirement by design — losing
/// the hardware key must not lock beneficiaries out of their inheritance.
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
    let ciphertext_start = match parse_yubikey_block(&data)? {
        Some(b) => b.ciphertext_start,
        None => HEADER_SIZE,
    };
    let decrypted = match cipher::decrypt(key, &data[ciphertext_start..]) {
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
/// If a YubiKey is currently enrolled it remains enrolled and is required for
/// both the old and new key derivation.
pub fn change_master_password(
    path: &str,
    old_password: &str,
    new_password: &str,
    yubikey_pin: Option<&str>,
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

    // If a YubiKey is enrolled, talk to it once — same secret feeds both the
    // old-key check (verifies the user really holds the right key) and the
    // new-key derivation. We deliberately keep the same hmac-salt + credential
    // ID so the user does not need to re-enrol after a password change.
    let yubikey_block = parse_yubikey_block(&data)?;
    let yubikey_secret = if let Some(block) = yubikey_block.as_ref() {
        Some(yubikey::assert(&block.credential_id, &block.salt, yubikey_pin)?)
    } else {
        None
    };
    let extra: Option<&[u8]> = yubikey_secret.as_ref().map(|s| s.as_ref());
    let ciphertext_start = yubikey_block
        .as_ref()
        .map(|b| b.ciphertext_start)
        .unwrap_or(HEADER_SIZE);

    // Verify old password by decrypting with the existing salt + key.
    let old_salt_bytes = &data[SALT_OFFSET..SALT_OFFSET + SALT_BYTES];
    let old_salt = argon2id13::Salt::from_slice(old_salt_bytes).ok_or("Corrupted vault salt")?;
    let old_key = kdf::derive_key_with_secret(old_password, &old_salt, extra);
    let plaintext = cipher::decrypt(&old_key, &data[ciphertext_start..])
        .map_err(|_| "Current password is incorrect")?;

    // Generate a fresh salt + key, re-encrypt with new fresh secretstream header.
    let new_salt = kdf::generate_salt();
    let new_key = kdf::derive_key_with_secret(new_password, &new_salt, extra);
    let new_encrypted = cipher::encrypt(&new_key, &plaintext)?;

    // Rebuild the header with the new salt; preserve the rest (display name,
    // lockout state, yubikey flag, the yubikey block, all padding).
    let mut new_data = data[..HEADER_SIZE].to_vec();
    for i in 0..SALT_BYTES {
        new_data[SALT_OFFSET + i] = new_salt.0[i];
    }
    if let Some(block) = yubikey_block.as_ref() {
        new_data.extend_from_slice(&build_yubikey_block(&block.salt, &block.credential_id)?);
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
    // Re-emit the YubiKey block verbatim if present. Pull only the header +
    // the optional yubikey metadata; drop the previous ciphertext.
    let prefix_end = match parse_yubikey_block(&existing)? {
        Some(b) => b.ciphertext_start,
        None => HEADER_SIZE,
    };
    let json =
        serde_json::to_vec(manifest).map_err(|e| format!("Serialisation error: {}", e))?;
    let encrypted = cipher::encrypt(key, &json)?;
    let mut file_data = existing[..prefix_end].to_vec();
    file_data.extend_from_slice(&encrypted);
    fs::write(path, file_data).map_err(|e| format!("Failed to save vault: {}", e))?;
    Ok(())
}

/// Add a YubiKey requirement to an existing vault. Verifies the current
/// password, derives a fresh key that includes the YubiKey secret, and
/// re-encrypts in place. Returns the new in-memory master key so callers can
/// keep the session active without prompting for unlock again.
///
/// `enrollment` carries the credential_id + salt + the secret returned by the
/// just-enrolled YubiKey; the secret is consumed here and not persisted.
pub fn enable_yubikey(
    path: &str,
    password: &str,
    enrollment: yubikey::YubikeyEnrollment,
) -> Result<[u8; 32], String> {
    let data = fs::read(path).map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }
    if data[YUBIKEY_FLAG_OFFSET] != 0 {
        return Err("This vault already has a YubiKey enrolled. Remove it first.".to_string());
    }
    // Verify the supplied password by decrypting with the current (password-only) key.
    let salt_bytes = &data[SALT_OFFSET..SALT_OFFSET + SALT_BYTES];
    let salt = argon2id13::Salt::from_slice(salt_bytes).ok_or("Corrupted vault salt")?;
    let old_key = kdf::derive_key(password, &salt);
    let plaintext = cipher::decrypt(&old_key, &data[HEADER_SIZE..])
        .map_err(|_| "Current password is incorrect")?;

    // Fresh salt + new key combining password + YubiKey secret.
    let new_salt = kdf::generate_salt();
    let new_key = kdf::derive_key_with_secret(password, &new_salt, Some(&enrollment.secret));
    let new_encrypted = cipher::encrypt(&new_key, &plaintext)?;

    // Rebuild header: copy existing (preserving display name, lockout state),
    // overwrite salt, set yubikey flag, then append the yubikey block + ciphertext.
    let mut new_data = data[..HEADER_SIZE].to_vec();
    for i in 0..SALT_BYTES {
        new_data[SALT_OFFSET + i] = new_salt.0[i];
    }
    new_data[YUBIKEY_FLAG_OFFSET] = 1;
    new_data.extend_from_slice(&build_yubikey_block(&enrollment.hmac_salt, &enrollment.credential_id)?);
    new_data.extend_from_slice(&new_encrypted);
    fs::write(path, new_data).map_err(|e| format!("Failed to write vault: {}", e))?;
    Ok(new_key)
}

/// Remove the YubiKey requirement. Requires the current password AND a touch
/// of the still-enrolled YubiKey to authorise the change. Returns the new
/// (password-only) master key.
pub fn disable_yubikey(
    path: &str,
    password: &str,
    yubikey_pin: Option<&str>,
) -> Result<[u8; 32], String> {
    let data = fs::read(path).map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }
    let block = parse_yubikey_block(&data)?
        .ok_or("This vault does not have a YubiKey enrolled.")?;

    let yubi_secret = yubikey::assert(&block.credential_id, &block.salt, yubikey_pin)?;

    // Verify password+yubikey by decrypting.
    let salt_bytes = &data[SALT_OFFSET..SALT_OFFSET + SALT_BYTES];
    let salt = argon2id13::Salt::from_slice(salt_bytes).ok_or("Corrupted vault salt")?;
    let old_key = kdf::derive_key_with_secret(password, &salt, Some(&yubi_secret));
    let plaintext = cipher::decrypt(&old_key, &data[block.ciphertext_start..])
        .map_err(|_| "Current password (or YubiKey) is incorrect")?;

    // Fresh salt + password-only key.
    let new_salt = kdf::generate_salt();
    let new_key = kdf::derive_key(password, &new_salt);
    let new_encrypted = cipher::encrypt(&new_key, &plaintext)?;

    let mut new_data = data[..HEADER_SIZE].to_vec();
    for i in 0..SALT_BYTES {
        new_data[SALT_OFFSET + i] = new_salt.0[i];
    }
    new_data[YUBIKEY_FLAG_OFFSET] = 0;
    new_data.extend_from_slice(&new_encrypted);
    fs::write(path, new_data).map_err(|e| format!("Failed to write vault: {}", e))?;
    Ok(new_key)
}
