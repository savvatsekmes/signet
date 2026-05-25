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

## Using a YubiKey (optional)

Signet 1.0.1 ships with optional hardware-key 2FA — turn it on in **Settings → Hardware key** and your master password becomes "password + tap of YubiKey" for every unlock.

The underlying implementation (`ctap-hid-fido2`) talks directly to the FIDO HID device, which on macOS requires **Input Monitoring** permission. macOS doesn't always prompt for it automatically, so if Signet says **"No security key detected"** while a YubiKey is plugged in:

1. Open **System Settings → Privacy & Security → Input Monitoring**
2. If Signet isn't listed, drag `/Applications/Signet.app` into the list
3. Toggle Signet **on**
4. **Fully quit Signet** (Cmd-Q — not just closing the window) and reopen it
5. Try **Enable YubiKey** again

If the device still isn't found, confirm macOS sees the YubiKey at all:

```sh
ioreg -p IOUSB -l -w 0 | grep -A2 -i yubikey
```

If nothing appears there, the issue is hardware/cable/driver-level, not Signet.

A future release will move to the OS-native WebAuthn API (`AuthenticationServices.framework`), at which point this permission step won't be needed.

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
- **YubiKey 2FA requires a one-time Input Monitoring grant** (see [Using a YubiKey](#using-a-yubikey-optional)). A future release will switch to the OS WebAuthn API so the permission step goes away.
