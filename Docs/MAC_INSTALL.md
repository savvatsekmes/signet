# Installing Signet on macOS

Signet ships as a `.dmg` containing `Signet.app`. The same release publishes two builds:

- `Signet_1.0.1_aarch64.dmg` — Apple Silicon (M1/M2/M3/M4)
- `Signet_1.0.1_x64.dmg` — Intel Macs

If you're not sure which one you need, open the Apple menu  → **About This Mac** and look at the **Chip** / **Processor** line. "Apple M*" → aarch64; "Intel Core *" → x64.

Signet works on macOS 10.15 (Catalina) and later.

## Install

1. Download the `.dmg` for your Mac from the [latest release](https://github.com/savvatsekmes/signet/releases/latest).
2. Open the `.dmg`. A Finder window appears with **Signet** on the left and an **Applications** shortcut on the right.
3. Drag **Signet** onto **Applications**.
4. Eject the disk image.

## First launch — Gatekeeper warning

Signet is currently distributed **unsigned**. The author does not (yet) have a paid Apple Developer account, so macOS Gatekeeper will refuse to open the app on the first launch:

> "Signet" can't be opened because Apple cannot check it for malicious software.

This is expected. To get past it, **right-click** (or Control-click) the app in `/Applications` and choose **Open**. macOS will then show a slightly different dialog with an **Open** button. Click **Open** once and macOS will remember the choice forever.

### Or, from Terminal

If you prefer the command line, you can strip the quarantine flag in one shot:

```sh
xattr -d com.apple.quarantine /Applications/Signet.app
```

Then double-click as normal.

## Where your data lives

| What | Location |
|------|----------|
| Default vault location | `~/Documents/Signet/vault.signet` |
| Last-opened vault pointer | `~/Library/Application Support/Signet/last_vault.txt` |
| Skipped-update marker | `~/Library/Application Support/Signet/skipped_update.txt` |

Your `vault.signet` file is the only file that contains your secrets. Back it up the same way you'd back up any important document. You can move it anywhere on disk — Signet remembers the last opened location.

## Uninstall

1. Quit Signet.
2. Drag `/Applications/Signet.app` to the Trash.
3. Optional — also delete config files: `rm -rf ~/Library/Application\ Support/Signet`
4. Optional — delete your vault: `rm ~/Documents/Signet/vault.signet` (only do this if you have backups; this is irreversible).

## Verifying the download (optional)

The release page lists the SHA-256 of each `.dmg`. To check:

```sh
shasum -a 256 ~/Downloads/Signet_1.0.1_aarch64.dmg
```

Compare against the hash published on the release page.

## Known limitations

- **No code signing or notarization.** Until Signet has a paid Apple Developer ID, every release will trigger the Gatekeeper warning above. The app is otherwise fully functional.
- **YubiKey support is not yet implemented** on macOS or Windows. The vault format reserves space for it; the UI is wired up; the actual FIDO2 integration is a planned later release.
