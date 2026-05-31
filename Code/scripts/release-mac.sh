#!/usr/bin/env bash
# Build signed + notarized macOS DMGs for Apple Silicon and Intel.
#
# Reads the Apple notarization password from the macOS keychain entry
# `signet-notarize` (account: savvatsekmes@live.com). Set up once with:
#
#   security add-generic-password \
#       -s "signet-notarize" \
#       -a "savvatsekmes@live.com" \
#       -w "xxxx-xxxx-xxxx-xxxx" \
#       -T "" -U
#
# Usage:
#   ./scripts/release-mac.sh                   # build + verify only
#   ./scripts/release-mac.sh --upload v1.0.1   # build, verify, clobber-upload to a release
#
# Run from the Code/ directory or anywhere — the script resolves its own path.

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────
APPLE_ID_VALUE="savvatsekmes@live.com"
APPLE_TEAM_ID_VALUE="7YX5W79L52"
APPLE_SIGNING_IDENTITY_VALUE="Developer ID Application: Sam Tsekmes (7YX5W79L52)"
KEYCHAIN_SERVICE="signet-notarize"
GH_REPO="savvatsekmes/signet"

# ─── Resolve project root (the Code/ directory) ────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$CODE_DIR"

# ─── Args ──────────────────────────────────────────────────────────────────
UPLOAD_TAG=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --upload)
            UPLOAD_TAG="${2:-}"
            if [[ -z "$UPLOAD_TAG" ]]; then
                echo "✗ --upload requires a tag (e.g. --upload v1.0.1)" >&2
                exit 2
            fi
            shift 2
            ;;
        -h|--help)
            sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "✗ Unknown argument: $1" >&2
            exit 2
            ;;
    esac
done

# ─── Load notarization password from keychain ──────────────────────────────
echo "→ Loading notarization password from keychain"
APPLE_PASSWORD_VALUE="$(
    security find-generic-password \
        -s "$KEYCHAIN_SERVICE" \
        -a "$APPLE_ID_VALUE" \
        -w 2>/dev/null || true
)"
if [[ -z "$APPLE_PASSWORD_VALUE" ]]; then
    cat >&2 <<EOF
✗ No keychain entry found for service "$KEYCHAIN_SERVICE" / account "$APPLE_ID_VALUE".
  Set one up with:

    security add-generic-password \\
        -s "$KEYCHAIN_SERVICE" \\
        -a "$APPLE_ID_VALUE" \\
        -w "<app-specific-password-from-appleid.apple.com>" \\
        -T "" -U

EOF
    exit 1
fi

export APPLE_ID="$APPLE_ID_VALUE"
export APPLE_TEAM_ID="$APPLE_TEAM_ID_VALUE"
export APPLE_SIGNING_IDENTITY="$APPLE_SIGNING_IDENTITY_VALUE"
export APPLE_PASSWORD="$APPLE_PASSWORD_VALUE"

# Make sure the Rust toolchain installed via rustup is on PATH.
[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"

# ─── Sanity check identity ─────────────────────────────────────────────────
if ! security find-identity -v -p codesigning 2>&1 | grep -qF "$APPLE_SIGNING_IDENTITY_VALUE"; then
    echo "✗ Codesigning identity '$APPLE_SIGNING_IDENTITY_VALUE' not found in keychain" >&2
    exit 1
fi
echo "✓ Codesigning identity present"

# ─── Build both architectures ──────────────────────────────────────────────
build_target() {
    local target="$1"
    local label="$2"
    echo ""
    echo "════ Building $label ($target) ═════════════════════════════════════"
    npm run tauri build -- --target "$target"
}

build_target aarch64-apple-darwin "Apple Silicon"
build_target x86_64-apple-darwin   "Intel"

# ─── Verify ────────────────────────────────────────────────────────────────
verify_bundle() {
    local target="$1"
    local label="$2"
    local app="$CODE_DIR/src-tauri/target/$target/release/bundle/macos/Signet.app"

    echo ""
    echo "── Verifying $label ────────────────────────────────────────────────"
    codesign --verify --deep --strict --verbose=1 "$app"
    local spctl_out
    spctl_out="$(spctl --assess --type execute --verbose=4 "$app" 2>&1)"
    echo "$spctl_out"
    if ! echo "$spctl_out" | grep -qE "source=Notarized Developer ID"; then
        echo "✗ Bundle for $target is not recognised as notarized" >&2
        exit 1
    fi
    echo "✓ $label: signed, hardened, notarized, stapled"
}

verify_bundle aarch64-apple-darwin "Apple Silicon"
verify_bundle x86_64-apple-darwin   "Intel"

AARCH_DMG="$CODE_DIR/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Signet_1.0.1_aarch64.dmg"
X64_DMG="$CODE_DIR/src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/Signet_1.0.1_x64.dmg"

echo ""
echo "DMGs ready:"
echo "  $AARCH_DMG"
echo "  $X64_DMG"

# ─── Optional upload ───────────────────────────────────────────────────────
if [[ -n "$UPLOAD_TAG" ]]; then
    echo ""
    echo "→ Uploading to $GH_REPO release $UPLOAD_TAG (clobbering existing assets)"
    gh release upload "$UPLOAD_TAG" "$AARCH_DMG" "$X64_DMG" \
        --repo "$GH_REPO" --clobber
    echo "✓ Upload complete"
fi

echo ""
echo "Done."
