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
        get_info::InfoOption,
        make_credential::make_credential_params::Extension as MCExt,
        GetAssertionArgsBuilder, MakeCredentialArgsBuilder,
    },
    public_key_credential_user_entity::PublicKeyCredentialUserEntity,
    verifier, Cfg, FidoKeyHidFactory,
};
use sodiumoxide::randombytes::randombytes;

/// Sentinel string the frontend recognises when the user must supply a PIN.
/// We prefix it so the React layer can match on it without false positives
/// from other error text. Kept stable.
pub const ERR_PIN_REQUIRED: &str = "YUBIKEY_PIN_REQUIRED";

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

/// Does the inserted YubiKey have a PIN configured? Returns Ok(true) if PIN
/// is set on the device, Ok(false) if the device supports PIN but doesn't
/// have one set (or doesn't support PIN at all — same code path for us).
///
/// Cheap probe — no user touch required, just a device info read. Used by
/// the UI to decide whether to show a PIN field before unlock/enrol.
pub fn requires_pin() -> Result<bool, String> {
    let device = first_device()?;
    match device.enable_info_option(&InfoOption::ClientPin) {
        Ok(Some(true)) => Ok(true),
        Ok(_) => Ok(false),
        Err(e) => Err(format!("Cannot read YubiKey info: {}", e)),
    }
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
/// `pin` is supplied only if the YubiKey has a PIN configured — callers
/// should check `requires_pin()` first and prompt the user accordingly. If
/// the device requires PIN and we got `None`, we surface ERR_PIN_REQUIRED so
/// the UI can pop a PIN field.
///
/// The user will be prompted (by the device's LED) to touch the key.
pub fn enroll(pin: Option<&str>) -> Result<YubikeyEnrollment, String> {
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

    // Step 1: create the credential, asking the device to support hmac-secret.
    //
    // We always try the no-UV path first. Out-of-the-box keys take this path
    // trivially, and PIN-set YubiKeys still allow it when `makeCredUvNotRqd`
    // is true (the default). Only if the device truly demands UV do we fall
    // back to the PIN path, which requires the caller to supply a PIN.
    //
    // Picking the right mode at enrolment matters because the hmac-secret
    // output is different between the two modes (CTAP2 keeps two separate
    // CredRandom secrets per credential, one for UV and one for non-UV).
    // Assert later must match enrolment mode to reproduce the same HMAC.
    let no_uv_args = MakeCredentialArgsBuilder::new(RP_ID, &challenge)
        .user_entity(&user)
        .extensions(&[MCExt::HmacSecret(Some(true))])
        .without_pin_and_uv()
        .build();
    let attestation_result = device
        .make_credential_with_args(&no_uv_args)
        .map_err(|e| map_ctap_error("YubiKey enrolment failed", e));

    let attestation = match attestation_result {
        Ok(a) => a,
        Err(e) if e == ERR_PIN_REQUIRED => {
            let p = pin.ok_or_else(|| ERR_PIN_REQUIRED.to_string())?;
            let challenge = verifier::create_challenge();
            let pin_args = MakeCredentialArgsBuilder::new(RP_ID, &challenge)
                .user_entity(&user)
                .extensions(&[MCExt::HmacSecret(Some(true))])
                .pin(p)
                .build();
            device
                .make_credential_with_args(&pin_args)
                .map_err(|e| map_ctap_error("YubiKey enrolment failed", e))?
        }
        Err(e) => return Err(e),
    };

    let credential_id = attestation.credential_descriptor.id.clone();
    if credential_id.is_empty() {
        return Err("YubiKey returned an empty credential id".to_string());
    }

    // Step 2: immediately assert to capture the initial hmac-secret output.
    // This is the secret that goes into Argon2id. The user touches once for
    // enrol and once for this assertion — most authenticators batch them.
    let secret = assert_with_device(&device, &credential_id, &hmac_salt, pin)?;

    Ok(YubikeyEnrollment {
        credential_id,
        hmac_salt,
        secret,
    })
}

/// Ask the YubiKey for the hmac-secret output for an existing credential.
/// Prompts the user to touch the key. If the device truly refuses the
/// no-UV path, returns ERR_PIN_REQUIRED so the UI can prompt for a PIN.
///
/// ## Why we always try non-UV first
///
/// CTAP2 defines **two** hmac-secret keys per credential: `CredRandomWithUV`
/// (used when the assertion is performed with user verification — i.e. PIN)
/// and `CredRandomWithoutUV` (used without). The HMAC outputs are different.
/// To get the same output mixed into Argon2id at enrolment, we must assert
/// in the same mode the credential was created in.
///
/// Our enrolment path tries non-UV first, so existing credentials are all
/// `CredRandomWithoutUV`-based. Even after the user sets a PIN on the device
/// later, the credential's hmac-secret material doesn't change — the device
/// will still return the same HMAC if we ask without UV (when `alwaysUv` is
/// false, which is the YubiKey default).
///
/// Only if the device flatly refuses the non-UV assertion do we fall back to
/// asking for a PIN. That handles the rare case where the credential was
/// enrolled fresh on an already-PIN-protected key.
pub fn assert(
    credential_id: &[u8],
    hmac_salt: &[u8; HMAC_SALT_LEN],
    pin: Option<&str>,
) -> Result<YubikeySecret, String> {
    let device = first_device()?;

    // Attempt 1: non-UV path. Matches every credential Signet has ever
    // enrolled to date, and is what the device returns the same HMAC for
    // regardless of whether a PIN has since been set on the device.
    match assert_with_device(&device, credential_id, hmac_salt, None) {
        Ok(s) => return Ok(s),
        Err(e) if !is_pin_required_err(&e) => return Err(e),
        // PIN-required from device — fall through to attempt 2.
        Err(_) => {}
    }

    // Attempt 2: device truly demands UV. Need a PIN from the caller.
    match pin {
        Some(p) => assert_with_device(&device, credential_id, hmac_salt, Some(p)),
        None => Err(ERR_PIN_REQUIRED.to_string()),
    }
}

/// True if an error string from `map_ctap_error` (or our sentinel) indicates
/// the device wants UV / PIN.
fn is_pin_required_err(err: &str) -> bool {
    err == ERR_PIN_REQUIRED
}

fn assert_with_device(
    device: &ctap_hid_fido2::fidokey::FidoKeyHid,
    credential_id: &[u8],
    hmac_salt: &[u8; HMAC_SALT_LEN],
    pin: Option<&str>,
) -> Result<YubikeySecret, String> {
    let challenge = verifier::create_challenge();
    let args = match pin {
        Some(p) => GetAssertionArgsBuilder::new(RP_ID, &challenge)
            .credential_id(credential_id)
            .extensions(&[GAExt::HmacSecret(Some(*hmac_salt))])
            .pin(p)
            .build(),
        None => GetAssertionArgsBuilder::new(RP_ID, &challenge)
            .credential_id(credential_id)
            .extensions(&[GAExt::HmacSecret(Some(*hmac_salt))])
            // Match enrolment: no PIN/UV required; presence (touch) is enough.
            .without_pin_and_uv()
            .build(),
    };
    let assertions = device
        .get_assertion_with_args(&args)
        .map_err(|e| map_ctap_error("YubiKey touch failed", e))?;
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

/// Translate the ctap-hid-fido2 error string into something a user can act on,
/// in particular the PIN-related CTAP2 status codes. The crate formats these
/// as strings containing the canonical FIDO2 error name, so substring
/// matching is sufficient. Takes any Display-able error so we don't need to
/// pull in `anyhow` as a direct dependency.
fn map_ctap_error<E: std::fmt::Display>(context: &str, err: E) -> String {
    let s = format!("{}", err);
    let lower = s.to_ascii_lowercase();
    if lower.contains("pin_required") {
        return ERR_PIN_REQUIRED.to_string();
    }
    if lower.contains("pin_invalid") {
        return "Wrong PIN. Try again — note that 8 wrong PIN attempts in total will permanently lock the FIDO2 applet on your YubiKey.".to_string();
    }
    if lower.contains("pin_auth_blocked") {
        return "Too many wrong PIN attempts in this session. Unplug your YubiKey, plug it back in, and try again.".to_string();
    }
    if lower.contains("pin_blocked") {
        return "Your YubiKey is locked from too many wrong PIN attempts. The FIDO2 applet must be factory-reset (this will erase every credential on the key for every service).".to_string();
    }
    format!("{}: {}", context, s)
}
