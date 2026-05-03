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
// Bytes 102..128 remain reserved for future use.
const NAME_LEN_OFFSET: usize = 37;
const NAME_OFFSET: usize = 38;
pub const NAME_MAX_BYTES: usize = 64;

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
    let decrypted = cipher::decrypt(&key, &data[HEADER_SIZE..])?;
    let manifest: VaultManifest =
        serde_json::from_slice(&decrypted).map_err(|_| "Corrupted vault manifest")?;
    Ok((manifest, key))
}

/// Decrypt a vault file using a key supplied directly (e.g. reconstructed from Shamir shards).
pub fn unlock_with_key(path: &str, key: &[u8; 32]) -> Result<VaultManifest, String> {
    let data = fs::read(path).map_err(|_| "Vault file not found or unreadable")?;
    if data.len() < HEADER_SIZE {
        return Err("File is too small to be a valid Signet vault".to_string());
    }
    if &data[0..4] != MAGIC {
        return Err("This file is not a valid Signet vault".to_string());
    }
    let decrypted = cipher::decrypt(key, &data[HEADER_SIZE..])?;
    let manifest: VaultManifest =
        serde_json::from_slice(&decrypted).map_err(|_| "Corrupted vault manifest")?;
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
