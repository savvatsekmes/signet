//! YubiKey / FIDO2 hmac-secret integration.
//!
//! Signet uses the FIDO2 `hmac-secret` extension to derive a 32-byte secret
//! from a hardware authenticator that is mixed into the Argon2id key
//! derivation. The user must therefore present both their master password AND
//! the physical YubiKey to unlock the vault.
//!
//! ## Why hmac-secret
//!
//! The FIDO2 hmac-secret extension lets a relying party (us) hand the
//! authenticator a salt; the device returns HMAC-SHA-256(device-secret, salt).
//! The device-secret never leaves the YubiKey. We store only:
//!   - the credential ID (public, lets the device locate its private key)
//!   - the salt (32 random bytes, generated per vault, stored in plaintext)
//!
//! Anyone with the vault file can read both — but they can never compute the
//! HMAC output without the physical device.
//!
//! ## Loss recovery
//!
//! YubiKey is required only for the normal password unlock path. Shamir
//! recovery (`vault::format::unlock_with_key`) is unchanged: a quorum of
//! shards reconstructs the master key directly, bypassing both password and
//! YubiKey. Losing your YubiKey is recoverable via the printed cards.
//!
//! ## Implementation status
//!
//! The FIDO2/CTAP calls themselves are stubbed pending hardware arrival.
//! The vault format, key derivation, command surface, and UI flows are
//! fully wired against this module's interface — when the stubs are
//! replaced with real CTAP calls, the feature is end-to-end functional
//! without further changes elsewhere.

use sodiumoxide::randombytes::randombytes;

/// Size of the per-vault hmac-secret salt. FIDO2 hmac-secret accepts a
/// 32-byte salt and returns a 32-byte HMAC output.
pub const HMAC_SALT_LEN: usize = 32;

/// The 32-byte secret returned by the YubiKey for our (credential, salt) pair.
pub type YubikeySecret = [u8; 32];

/// Result of enrolling a YubiKey for a new (or existing) vault. The credential
/// ID and salt are stored in the vault file; the secret is consumed
/// immediately to derive the master key and is not persisted.
pub struct YubikeyEnrollment {
    pub credential_id: Vec<u8>,
    pub hmac_salt: [u8; HMAC_SALT_LEN],
    pub secret: YubikeySecret,
}

/// Generate a fresh random hmac-secret salt.
pub fn fresh_salt() -> [u8; HMAC_SALT_LEN] {
    let mut salt = [0u8; HMAC_SALT_LEN];
    salt.copy_from_slice(&randombytes(HMAC_SALT_LEN));
    salt
}

/// Probe for a connected YubiKey. Returns Ok(true) if a key supporting
/// FIDO2 + hmac-secret is present, Ok(false) otherwise. Never errors;
/// hardware faults are reported as "not present" so callers can prompt
/// the user to plug a key in.
///
/// **Stub:** returns `Ok(false)` until real CTAP probing lands.
pub fn is_present() -> Result<bool, String> {
    Ok(false)
}

/// Enroll a new credential on the inserted YubiKey for this vault.
/// Prompts the user (via OS UI / device LED) to touch the key.
///
/// **Stub:** returns an error until real CTAP enrolment lands.
pub fn enroll() -> Result<YubikeyEnrollment, String> {
    Err("YubiKey support is not yet built. Plug in your key and try again \
         once the next Signet release with hardware-key support is installed."
        .to_string())
}

/// Ask the YubiKey for the hmac-secret output for an existing credential.
/// Prompts the user to touch the key.
///
/// **Stub:** returns an error until real CTAP assertion lands.
#[allow(unused_variables)]
pub fn assert(credential_id: &[u8], hmac_salt: &[u8; HMAC_SALT_LEN]) -> Result<YubikeySecret, String> {
    Err("YubiKey support is not yet built. This vault has a hardware key \
         enrolled but Signet cannot talk to it from this build."
        .to_string())
}
