use sodiumoxide::crypto::secretstream::{self, Stream, Tag};

pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let key = secretstream::Key::from_slice(key).ok_or("Invalid key length")?;
    let (mut stream, header) =
        Stream::init_push(&key).map_err(|_| "Failed to initialise encryption stream")?;
    let ciphertext = stream
        .push(plaintext, None, Tag::Final)
        .map_err(|_| "Encryption failed")?;
    let mut result = header.0.to_vec();
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

pub fn decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    let key = secretstream::Key::from_slice(key).ok_or("Invalid key length")?;
    if data.len() < secretstream::HEADERBYTES {
        return Err("Corrupted vault header".to_string());
    }
    let header = secretstream::Header::from_slice(&data[..secretstream::HEADERBYTES])
        .ok_or("Corrupted vault header")?;
    let mut stream = Stream::init_pull(&header, &key)
        .map_err(|_| "Incorrect password or corrupted vault")?;
    let (plaintext, _tag) = stream
        .pull(&data[secretstream::HEADERBYTES..], None)
        .map_err(|_| "Incorrect password or corrupted vault")?;
    Ok(plaintext)
}
