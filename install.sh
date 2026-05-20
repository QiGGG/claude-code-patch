#!/bin/bash
set -e

# Fix Windows terminal encoding (Git Bash / MSYS2 / Cygwin)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || -n "$MSYSTEM" ]]; then
  chcp.com 65001 >/dev/null 2>&1 || true
fi

CLAWGOD_DIR="$HOME/.clawgod"
BIN_DIR="$HOME/.local/bin"
VERSION="${CLAWGOD_VERSION:-2.1.112}"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --version) VERSION="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) shift ;;
  esac
done

GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "  ${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "  ${RED}[ERR]${NC} $1"; }

echo ""
echo -e "${BOLD}  ClawGod Installer${NC}"
echo ""

# ─── Prerequisites ─────────────────────────────────────

if ! command -v node &>/dev/null; then
  warn "Node.js is required (>= 18). Install from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_VERSION" -lt 18 ]; then
  warn "Node.js >= 18 required (found v$NODE_VERSION)"
  exit 1
fi

if ! command -v npm &>/dev/null; then
  warn "npm is required"
  exit 1
fi

# ─── Install / Update ClawGod CLI ──────────────────────

mkdir -p "$CLAWGOD_DIR" "$BIN_DIR"

# Download latest source (use git clone if in a git repo, otherwise curl tarball)
TMP_DIR=$(mktemp -d)
if git rev-parse --git-dir &>/dev/null; then
  # Running from repo: copy current source
  cp -R "$(git rev-parse --show-toplevel)/bin" "$CLAWGOD_DIR/"
  cp -R "$(git rev-parse --show-toplevel)/src" "$CLAWGOD_DIR/"
  cp "$(git rev-parse --show-toplevel)/package.json" "$CLAWGOD_DIR/"
else
  # Remote install: fetch latest release tarball
  curl -fsSL -o "$TMP_DIR/clawgod.tar.gz" \
    "https://github.com/QiGGG/claude-code-patch/archive/refs/heads/main.tar.gz"
  tar -xzf "$TMP_DIR/clawgod.tar.gz" -C "$TMP_DIR"
  cp -R "$TMP_DIR"/*/bin "$CLAWGOD_DIR/"
  cp -R "$TMP_DIR"/*/src "$CLAWGOD_DIR/"
  cp "$TMP_DIR"/*/package.json "$CLAWGOD_DIR/"
fi
rm -rf "$TMP_DIR"

# Install launcher
LAUNCHER="$BIN_DIR/clawgod"
cat > "$LAUNCHER" << EOF
#!/bin/bash
exec node "$CLAWGOD_DIR/bin/clawgod.mjs" "\$@"
EOF
chmod +x "$LAUNCHER"
info "ClawGod CLI installed ($LAUNCHER)"

# ─── Uninstall or Install ──────────────────────────────

if [ "$UNINSTALL" = "1" ]; then
  "$LAUNCHER" uninstall
  rm -f "$LAUNCHER"
  warn "ClawGod uninstalled"
else
  "$LAUNCHER" install --version "$VERSION"
fi

hash -r 2>/dev/null
