use sharks::{Share, Sharks};

pub fn split_key(key: &[u8; 32], total: u8, required: u8) -> Vec<Vec<u8>> {
    let sharks = Sharks(required);
    let dealer = sharks.dealer(key);
    dealer
        .take(total as usize)
        .map(|share| Vec::from(&share))
        .collect()
}

pub fn reconstruct_key(shards: Vec<Vec<u8>>, required: u8) -> Result<[u8; 32], String> {
    let sharks = Sharks(required);
    let shares: Vec<Share> = shards
        .iter()
        .map(|s| Share::try_from(s.as_slice()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Invalid shard data")?;
    let secret = sharks
        .recover(shares.iter())
        .map_err(|_| "Failed to reconstruct key — not enough valid shards")?;
    if secret.len() != 32 {
        return Err("Reconstructed key has wrong length".to_string());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&secret);
    Ok(key)
}
