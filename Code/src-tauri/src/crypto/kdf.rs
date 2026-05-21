use sodiumoxide::crypto::pwhash::argon2id13;

pub fn derive_key(password: &str, salt: &argon2id13::Salt) -> [u8; 32] {
    derive_key_with_secret(password, salt, None)
}

/// Argon2id over (password || optional_secret). When a YubiKey is enrolled
/// the 32-byte hmac-secret output is appended to the password bytes before
/// hashing — so a wrong key (or no key) yields a wrong derived key, which
/// surfaces as an authentication failure on decrypt. This deliberately
/// gives no oracle distinguishing "wrong password" from "wrong/missing
/// YubiKey".
pub fn derive_key_with_secret(
    password: &str,
    salt: &argon2id13::Salt,
    extra_secret: Option<&[u8]>,
) -> [u8; 32] {
    let mut key = [0u8; 32];
    let mut input = password.as_bytes().to_vec();
    if let Some(extra) = extra_secret {
        input.extend_from_slice(extra);
    }
    argon2id13::derive_key(
        &mut key,
        &input,
        salt,
        argon2id13::OPSLIMIT_INTERACTIVE,
        argon2id13::MEMLIMIT_INTERACTIVE,
    )
    .expect("Key derivation failed");
    key
}

pub fn generate_salt() -> argon2id13::Salt {
    argon2id13::gen_salt()
}
