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
//! ## Backend
//!
//! Talks to the device over USB HID via `ctap-hid-fido2`. Same protocol
//! works on Windows, macOS, and Linux without admin privileges for FIDO HID
//! class devices (Windows 10+).

use ctap_hid_fido2::{
    fidokey::{
        get_assertion::get_assertion_params::Extension as GAExt,
        make_credential::make_credential_params::Extension as MCExt,
        GetAssertionArgsBuilder, MakeCredentialArgsBuilder,
    },
    public_key_credential_user_entity::PublicKeyCredentialUserEntity,
    verifier, Cfg, FidoKeyHidFactory,
};
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

/// Relying-party ID used when registering credentials. FIDO2 ties credentials
/// to an RP ID — keeping this stable means previously-enrolled vaults still
/// work after upgrades, and means a credential registered for Signet cannot
/// be used by any other software.
const RP_ID: &str = "vault.signet";
const RP_NAME: &str = "Signet";

/// Generate a fresh random hmac-secret salt.
pub fn fresh_salt() -> [u8; HMAC_SALT_LEN] {
    let mut salt = [0u8; HMAC_SALT_LEN];
    salt.copy_from_slice(&randombytes(HMAC_SALT_LEN));
    salt
}

fn cfg() -> Cfg {
    let mut cfg = Cfg::init();
    // The CTAP library logs verbosely by default. Quiet it down for release.
    cfg.enable_log = false;
    cfg
}

/// Probe for a connected, FIDO2-capable YubiKey. Returns Ok(true) if any FIDO
/// HID device is enumerable on the system, Ok(false) otherwise. Never errors;
/// hardware faults are reported as "not present" so callers can prompt the
/// user to plug a key in.
pub fn is_present() -> Result<bool, String> {
    let devices = ctap_hid_fido2::get_fidokey_devices();
    Ok(!devices.is_empty())
}

/// Pick the first FIDO device. Errors with a user-facing message if none is
/// plugged in. We don't try to disambiguate between multiple keys — the
/// common case is one, and prompting for a touch on whichever responds
/// matches user expectations.
fn first_device() -> Result<ctap_hid_fido2::fidokey::FidoKeyHid, String> {
    let devices = ctap_hid_fido2::get_fidokey_devices();
    let info = devices
        .first()
        .ok_or("No security key detected. Plug your YubiKey into a USB port and try again.")?;
    FidoKeyHidFactory::create_by_params(&[info.param.clone()], &cfg())
        .map_err(|e| format!("Cannot communicate with security key: {}", e))
}

/// Enroll a new credential on the inserted YubiKey for this vault. Generates
/// a per-vault hmac-secret salt and asks the device for the corresponding
/// 32-byte HMAC output, which is mixed into the master-key derivation.
///
/// The user will be prompted (by the device's LED) to touch the key.
pub fn enroll() -> Result<YubikeyEnrollment, String> {
    let device = first_device()?;
    let hmac_salt = fresh_salt();

    // Random challenge — FIDO requires one but it is unused for our purposes
    // (we never verify the attestation server-side).
    let challenge = verifier::create_challenge();

    let user = PublicKeyCredentialUserEntity::new(
        Some(b"signet-vault-owner"),
        Some("Signet vault owner"),
        None,
    );

    // Step 1: create the credential, asking the device to support hmac-secret
    // for it. The actual hmac-secret output comes from the assertion in step 2.
    let mc_args = MakeCredentialArgsBuilder::new(RP_ID, &challenge)
        .user_entity(&user)
        .extensions(&[MCExt::HmacSecret(Some(true))])
        // Don't require PIN/UV: out-of-the-box YubiKeys have no PIN set,
        // and our use case (one HMAC, instant touch-to-confirm) doesn't
        // need verification beyond presence.
        .without_pin_and_uv()
        .build();
    let attestation = device
        .make_credential_with_args(&mc_args)
        .map_err(|e| format!("YubiKey enrolment failed: {}", e))?;

    let credential_id = attestation.credential_descriptor.id.clone();
    if credential_id.is_empty() {
        return Err("YubiKey returned an empty credential id".to_string());
    }

    // Step 2: immediately assert to capture the initial hmac-secret output.
    // This is the secret that goes into Argon2id. The user touches once for
    // enrol and once for this assertion — most authenticators batch them.
    let secret = assert_with_device(&device, &credential_id, &hmac_salt)?;

    Ok(YubikeyEnrollment {
        credential_id,
        hmac_salt,
        secret,
    })
}

/// Ask the YubiKey for the hmac-secret output for an existing credential.
/// Prompts the user to touch the key.
pub fn assert(credential_id: &[u8], hmac_salt: &[u8; HMAC_SALT_LEN]) -> Result<YubikeySecret, String> {
    let device = first_device()?;
    assert_with_device(&device, credential_id, hmac_salt)
}

fn assert_with_device(
    device: &ctap_hid_fido2::fidokey::FidoKeyHid,
    credential_id: &[u8],
    hmac_salt: &[u8; HMAC_SALT_LEN],
) -> Result<YubikeySecret, String> {
    let challenge = verifier::create_challenge();
    let args = GetAssertionArgsBuilder::new(RP_ID, &challenge)
        .credential_id(credential_id)
        .extensions(&[GAExt::HmacSecret(Some(*hmac_salt))])
        // Match enrolment: no PIN/UV required; presence (touch) is enough.
        .without_pin_and_uv()
        .build();
    let assertions = device
        .get_assertion_with_args(&args)
        .map_err(|e| format!("YubiKey touch failed: {}", e))?;
    let first = assertions
        .first()
        .ok_or("YubiKey returned no assertions")?;
    // Find the hmac-secret extension result in the returned assertion. The
    // crate exposes it through the extensions vector.
    for ext in &first.extensions {
        if let GAExt::HmacSecret(Some(bytes)) = ext {
            if bytes.len() != HMAC_SALT_LEN {
                return Err(format!(
                    "YubiKey returned hmac-secret of unexpected length: {}",
                    bytes.len()
                ));
            }
            let mut out = [0u8; HMAC_SALT_LEN];
            out.copy_from_slice(bytes);
            return Ok(out);
        }
    }
    Err("YubiKey response did not include hmac-secret. Ensure the key supports the FIDO2 hmac-secret extension.".to_string())
}
