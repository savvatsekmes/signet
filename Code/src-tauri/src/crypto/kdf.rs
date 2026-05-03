use sodiumoxide::crypto::pwhash::argon2id13;

pub fn derive_key(password: &str, salt: &argon2id13::Salt) -> [u8; 32] {
    let mut key = [0u8; 32];
    argon2id13::derive_key(
        &mut key,
        password.as_bytes(),
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
