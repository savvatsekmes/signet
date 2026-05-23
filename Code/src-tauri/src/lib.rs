mod commands;
mod crypto;
mod state;
mod vault;

use commands::beneficiaries::{
    add_beneficiary, list_beneficiaries, remove_beneficiary, update_beneficiary,
};
use commands::export::export_recovery_pdf;
use commands::files::{
    add_file, delete_file, export_all_files, get_file, get_file_data, is_directory,
    list_files, list_files_recursively, save_file_to_disk, set_file_section,
    update_file_data,
};
use commands::documents::{
    add_document, delete_document, export_document, export_document_html, get_document,
    list_documents, update_document,
};
use commands::passwords::{
    add_password, delete_password, import_passwords_csv, list_passwords, update_password,
};
use commands::seeds::{add_seed, delete_seed, list_seeds, update_seed};
use commands::settings::{
    change_master_password, change_vault_location, delete_vault, show_in_file_explorer,
};
use commands::shamir::{configure_shamir, generate_shards, reconstruct_from_shards};
use commands::updates::{check_for_update, get_app_version};
use commands::vault::{
    create_vault, default_vault_path, get_display_name, get_last_vault_path,
    get_lockout_state, get_skipped_update_version, get_vault_meta, lock_vault,
    set_display_name, set_last_vault_path, set_skipped_update_version, unlock_vault,
    vault_exists,
};
use commands::yubikey::{vault_has_yubikey, yubikey_disable, yubikey_enable, yubikey_is_present};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    sodiumoxide::init().expect("Failed to initialise libsodium");

    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            create_vault,
            unlock_vault,
            lock_vault,
            vault_exists,
            default_vault_path,
            get_display_name,
            set_display_name,
            get_vault_meta,
            get_last_vault_path,
            set_last_vault_path,
            get_lockout_state,
            get_skipped_update_version,
            set_skipped_update_version,
            add_file,
            list_files,
            get_file,
            get_file_data,
            update_file_data,
            set_file_section,
            delete_file,
            save_file_to_disk,
            export_all_files,
            is_directory,
            list_files_recursively,
            add_password,
            update_password,
            delete_password,
            list_passwords,
            import_passwords_csv,
            add_seed,
            update_seed,
            delete_seed,
            list_seeds,
            add_document,
            update_document,
            delete_document,
            list_documents,
            get_document,
            export_document,
            export_document_html,
            add_beneficiary,
            update_beneficiary,
            remove_beneficiary,
            list_beneficiaries,
            configure_shamir,
            generate_shards,
            reconstruct_from_shards,
            export_recovery_pdf,
            change_master_password,
            change_vault_location,
            show_in_file_explorer,
            delete_vault,
            get_app_version,
            check_for_update,
            vault_has_yubikey,
            yubikey_is_present,
            yubikey_enable,
            yubikey_disable,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Signet");
}
