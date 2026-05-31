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
5. Open Signet from `/Applications` — it should launch straight away.

Signet is signed with an Apple Developer ID (Team `7YX5W79L52`, Sam Tsekmes) and notarized by Apple. Gatekeeper recognises the notarization ticket on first launch, so there's no "unidentified developer" warning and no `xattr`/right-click ritual to deal with.

## Where your data lives

| What | Location |
|------|----------|
| Default vault location | `~/Documents/Signet/vault.signet` |
| Last-opened vault pointer | `~/Library/Application Support/Signet/last_vault.txt` |
| Skipped-update marker | `~/Library/Application Support/Signet/skipped_update.txt` |

Your `vault.signet` file is the only file that contains your secrets. Back it up the same way you'd back up any important document. You can move it anywhere on disk — Signet remembers the last opened location.

## Using a YubiKey (optional)

Signet 1.0.1 ships with optional hardware-key 2FA — turn it on in **Settings → Hardware key** and your master password becomes "password + tap of YubiKey" for every unlock.

### Apple Silicon (M1/M2/M3/M4): allow USB-C accessories

On Apple Silicon Macs, macOS gates every USB-C device behind an "Allow accessory to connect?" prompt. If you miss the prompt (it can auto-dismiss quickly), the YubiKey will appear unplugged to every app on the system, and Signet will say **"No security key detected."**

The fix is one setting:

1. Open **System Settings → Privacy & Security**
2. Scroll to **Allow accessories to connect**
3. Set it to **Always**
4. Unplug and replug the YubiKey
5. Try **Enable YubiKey** in Signet again

If you'd rather keep the prompt for security, leave it on "Ask for New Accessories" — just be ready to click **Allow** the moment the popup appears. Once you approve the YubiKey once, macOS remembers it forever.

### Still not detected?

Confirm macOS sees the YubiKey HID interface:

```sh
hidutil list | grep -i yubi
```

If nothing comes back, the device hasn't been authorized at the USB level yet — re-check the "Allow accessories" setting. If that returns a Yubico device but Signet still can't see it, plug the key directly into the Mac (skip any hubs or USB-A → USB-C adapters), then try again.

A future release will move to the OS-native WebAuthn API (`AuthenticationServices.framework`), at which point Signet can route through Touch ID / passkeys and the USB-C authorization step won't matter.

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

- **YubiKey 2FA needs USB-C accessories to be allowed** on Apple Silicon (see [Using a YubiKey](#using-a-yubikey-optional)). A future release will switch to the OS WebAuthn API so the USB-C authorization step won't matter.
