SIGNET — Encrypted Vault
========================

This USB drive contains an encrypted vault.

CONTENTS
--------
  Signet.exe        The Signet application (no installation required).
  vault.signet         Your encrypted vault (created the first time you open Signet).
  recovery/         Folder for printed recovery card PDFs.
  README.txt        This file.


TO OPEN THE VAULT (owner)
-------------------------
  1. Double-click Signet.exe
  2. Enter your master password
  3. Your files will be accessible


TO OPEN THE VAULT (a beneficiary, after the owner's death)
----------------------------------------------------------
  1. Double-click Signet.exe
  2. Click "Lost your password? Open with recovery shards"
  3. Either scan the QR code from your recovery card, or type the
     base64 key printed below the QR.
  4. Ask the other keyholder(s) to do the same — at least the
     required number must combine their shards.
  5. The vault will open.


REQUIREMENTS
------------
  - Windows 10 or 11
  - Microsoft Edge WebView2 runtime (pre-installed on Windows 11;
    free download for Windows 10 from microsoft.com)


WHAT IF SIGNET WON'T LAUNCH?
----------------------------
  - If Windows blocks it ("Unknown publisher"), click "More info"
    → "Run anyway".
  - If Edge WebView2 isn't installed:
    https://developer.microsoft.com/microsoft-edge/webview2/


HOW THIS PROTECTS YOU
---------------------
  - The vault is encrypted with Argon2id + XChaCha20-Poly1305.
  - The master password is never stored anywhere.
  - The master key is split into shards using Shamir's Secret
    Sharing — any single shard reveals zero information about the
    key. Only the configured number of shards combined can
    reconstruct it.
  - Nothing leaves this USB drive. No servers. No cloud.


HELP
----
  signetvault.com

This vault was created with Signet — a local, encrypted file vault.
No servers. No cloud. No subscriptions.
