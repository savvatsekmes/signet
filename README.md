# Signet

> An encrypted local vault for the people you leave behind.

Signet is a local-first, single-file encrypted vault designed so that when you die, the people you trust can access everything they need — passwords, documents, crypto seeds, personal messages — without being locked out.

- **No servers, no cloud, no subscriptions.** Everything lives in a single `.signet` file you control.
- **One-time vault key.** Argon2id for password derivation, XChaCha20-Poly1305 for the data, libsodium under the hood.
- **Shamir's Secret Sharing.** Your master key is split among trusted keyholders (any K of N reconstruct it); a single shard reveals nothing.
- **Portable.** A single `Signet.exe` runs from a USB drive — no install required.

The name comes from the historical practice of breaking a signet ring at the moment of death — the digital version of that handover.

## Repository layout

```
Signet/
├── Code/                # The application
│   ├── src/             # React + TypeScript frontend
│   ├── src-tauri/       # Rust backend (crypto, vault format, commands)
│   ├── dist-usb/        # USB-ready layout (README.txt + recovery folder)
│   └── README.md        # Build / develop instructions
├── Design/              # Source artwork (logo, icons, mockups)
└── SIGNET_MASTER.md     # Original full spec (Phases 1–6)
```

See [Code/README.md](Code/README.md) for build instructions.

## Status

All six phases of the original spec are built and shipping:

| Phase | What | Status |
|---|---|---|
| 1 | Crypto layer, vault format, lock screen | ✅ |
| 2 | Vault browser, file manager, drag-drop | ✅ |
| 3 | Beneficiaries + Shamir key splitting | ✅ |
| 4 | Recovery card PDF export | ✅ |
| 5 | Setup wizard + completeness scoring | ✅ |
| 6 | Portable Windows .exe + NSIS installer | ✅ |

Plus a long list of post-spec polish: structured password manager (with Google/Bitwarden/1Password CSV import), in-app rich-text documents and personal items with tags, structured crypto wallet entries, image gallery, vault file picker on the lock screen, file extension auto-categorisation, last-vault persistence, multi-format document export (PDF / HTML / Markdown / TXT), unified bulk export with category folders, Settings page (change password, move vault, regenerate shards, update checker, danger-zone delete), and more.

## Tech

- **Tauri 2** (Rust + WebView2) — small native binary
- **React 18** + TypeScript + Vite
- **sodiumoxide** — libsodium bindings (Argon2id + XChaCha20-Poly1305 secretstream)
- **sharks** — Shamir's Secret Sharing
- **printpdf + qrcode** — Recovery card PDFs

## License

Not yet decided. All rights reserved by the author until a license is added.

---

[signetvault.com](https://signetvault.com) (placeholder)
