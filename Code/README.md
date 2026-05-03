# Signet

Local-first encrypted file vault for the people you leave behind. Tauri 2 + Rust + React.

## Prerequisites (Windows)

1. **Node.js 18+** (`node --version`)
2. **Rust** — install via <https://rustup.rs>
3. **Microsoft Visual Studio C++ Build Tools** — <https://visualstudio.microsoft.com/visual-cpp-build-tools/> (select "Desktop development with C++")
4. **WebView2 runtime** — preinstalled on Windows 11; for Windows 10, evergreen installer at <https://developer.microsoft.com/microsoft-edge/webview2/>

## Develop

```sh
npm install
npm run tauri dev
```

First build downloads ~400 crates and takes a few minutes. After that, incremental rebuilds are seconds.

## Vault file location during dev

Signet looks for `vault.signet` in the same directory as the running executable. During dev that's `src-tauri/target/debug/`. The lock screen also has a Browse… button if you want to open a vault elsewhere; the chosen path is remembered in `last_vault.txt` next to the .exe.

## Icons

Built into the binary at compile time from `src-tauri/icons/`. To regenerate from a single source PNG:

```sh
npm run tauri icon path/to/source.png
```

Use a 1024×1024 transparent PNG.

## Release build

```sh
npm run tauri build
```

Produces:

- `src-tauri/target/release/signet.exe` — **portable executable**. No installer, no DLLs to copy. Drop on a USB.
- `src-tauri/target/release/bundle/nsis/Signet_<version>_x64-setup.exe` — **NSIS installer** for traditional Windows install.

The portable .exe still depends on the WebView2 runtime being present on the target machine (always present on Windows 11).

## USB distribution

The `dist-usb/` folder contains the layout to ship on a USB drive:

```
SIGNET_USB/
  Signet.exe              (copy from src-tauri/target/release/signet.exe)
  vault.signet               (created on first run)
  recovery/               (folder for printed PDF cards)
  README.txt              (plain-English instructions for owner + beneficiaries)
```

The portable build looks for `vault.signet` next to the .exe, so this layout works as-is.

## macOS build (future)

Tauri 2 supports macOS natively. From a Mac with Xcode installed:

```sh
# Apple Silicon
rustup target add aarch64-apple-darwin
npm run tauri build -- --target aarch64-apple-darwin

# Intel
rustup target add x86_64-apple-darwin
npm run tauri build -- --target x86_64-apple-darwin

# Universal binary (both)
npm run tauri build -- --target universal-apple-darwin
```

Output: `src-tauri/target/<target>/release/bundle/macos/Signet.app`. App looks for `vault.signet` alongside itself.

## Linux build (future)

```sh
npm run tauri build
```

Produces `.AppImage` and `.deb` in `src-tauri/target/release/bundle/`. Same vault-next-to-binary discovery rule.
