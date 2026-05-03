use crate::vault::manifest::VaultManifest;
use std::sync::Mutex;
use zeroize::Zeroize;

pub struct AppState {
    pub key: Mutex<Option<[u8; 32]>>,
    pub vault_path: Mutex<Option<String>>,
    pub manifest: Mutex<Option<VaultManifest>>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            key: Mutex::new(None),
            vault_path: Mutex::new(None),
            manifest: Mutex::new(None),
        }
    }

    pub fn clear(&self) {
        if let Ok(mut key) = self.key.lock() {
            if let Some(ref mut k) = *key {
                k.zeroize();
            }
            *key = None;
        }
        if let Ok(mut path) = self.vault_path.lock() {
            *path = None;
        }
        if let Ok(mut manifest) = self.manifest.lock() {
            *manifest = None;
        }
    }
}

impl Drop for AppState {
    fn drop(&mut self) {
        self.clear();
    }
}
