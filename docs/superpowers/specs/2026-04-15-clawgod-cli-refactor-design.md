# ClawGod CLI-First Refactor Design

**Date:** 2026-04-15
**Scope:** Core refactoring + minimal CLI toolkit
**Approach:** CLI-first (Option B)

---

## 1. Problem Statement

Currently, ClawGod's core logic (patcher, native extractor, wrapper generator) is duplicated between `install.sh` (Bash heredocs) and `install.ps1` (PowerShell inline strings). Adding or modifying a patch requires updating both files in sync. This creates high maintenance overhead and is error-prone.

## 2. Goals

1. **Eliminate duplication:** Core logic exists in exactly one place.
2. **Provide a CLI:** Users can run `clawgod <command>` to install, patch, and inspect status.
3. **Simplify installers:** `install.sh` and `install.ps1` become thin bootstrappers that only need to place the CLI on PATH and invoke it.
4. **Maintain compatibility:** The existing one-liner install experience (`curl | bash`, `irm | iex`) still works.

## 3. Non-Goals

- **Configuration-driven patches:** Patches remain code-based (regex + replacer functions) in the first iteration. JSON-ifying patches is a future enhancement.
- **npm publishing:** We are not publishing ClawGod to npm. Distribution remains GitHub-based.
- **Version isolation / multiple installs:** Not part of the minimum viable CLI.

## 4. Architecture

### 4.1 New Directory Structure

```
clawgod/
├── bin/
│   └── clawgod.mjs              # CLI entry point
├── src/
│   ├── commands/
│   │   ├── install.mjs          # clawgod install
│   │   ├── uninstall.mjs        # clawgod uninstall
│   │   ├── patch.mjs            # clawgod patch (apply / dry-run / verify / revert)
│   │   └── status.mjs           # clawgod status
│   ├── core/
│   │   ├── patcher.mjs          # Universal regex patch engine
│   │   ├── extractor.mjs        # Native module extractor (Mach-O / ELF / PE)
│   │   ├── wrapper.mjs          # cli.js wrapper generator
│   │   ├── downloader.mjs       # npm bundle download logic
│   │   └── vendor.mjs           # vendor/ directory setup
│   ├── utils/
│   │   ├── paths.mjs            # Cross-platform path constants
│   │   ├── platform.mjs         # Platform detection & differences
│   │   └── shell.mjs            # Child process & FS helpers
│   └── index.mjs                # CLI argument parsing & routing
├── package.json                 # type=module, bin declaration
├── install.sh                   # Bootstrap: check Node, install CLI, run install
├── install.ps1                  # Bootstrap: check Node, install CLI, run install
└── README*.md / CLAUDE.md       # Updated docs
```

### 4.2 Bootstrapper Responsibilities

Both `install.sh` and `install.ps1` perform only:

1. Verify Node.js >= 18 and npm are available.
2. Create `~/.clawgod/` and `~/.local/bin/` (or Windows equivalent).
3. Download the latest ClawGod source (git clone or GitHub Release tarball/zip) to a temp directory.
4. Copy `bin/clawgod.mjs` and `src/` into `~/.clawgod/`.
5. Create a launcher script on PATH that delegates to `node ~/.clawgod/bin/clawgod.mjs`.
6. Execute `clawgod install` with any arguments passed to the bootstrapper.

After the first run, the bootstrapper is no longer needed for day-to-day operations.

### 4.3 CLI Commands (Minimum Viable Set)

| Command | Behavior |
|---------|----------|
| `clawgod install [--version x.x.x]` | Download the specified (or latest) `@anthropic-ai/claude-code`, extract bundle, set up vendor, extract native modules, generate wrapper, apply patches, replace system `claude` command. |
| `clawgod uninstall` | Revert `claude` to the original backup (`claude.orig`), remove all generated files under `~/.clawgod/` except the CLI source itself (optional full purge flag). |
| `clawgod patch [--dry-run]` | Re-apply patches to the existing `cli.original.js`. `--dry-run` shows what would change without writing. |
| `clawgod patch --verify` | Check which patches are pending vs already applied. |
| `clawgod patch --revert` | Restore `cli.original.js` from its `.bak` backup. |
| `clawgod status` | Print current Claude Code version, patch status, config paths, and native module availability. |
| `clawgod --version` / `-v` | Print ClawGod version and installed Claude Code version. |

### 4.4 Core Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `downloader.mjs` | Run `npm install --prefix ~/.clawgod @anthropic-ai/claude-code@<version>`, then copy `node_modules/.../cli.js` to `~/.clawgod/cli.original.js`. |
| `vendor.mjs` | Copy `vendor/` from the npm bundle into `~/.clawgod/vendor/`. |
| `extractor.mjs` | Scan the local filesystem for the official Claude Code native binary, parse its Mach-O / ELF / PE sections, and extract embedded `.node` modules (audio-capture, image-processor, computer-use, url-handler) into `~/.clawgod/vendor/`. This logic is ported verbatim from the current heredoc/inline implementations. |
| `patcher.mjs` | Load `cli.original.js`, apply the regex-based patch list, support `optional`, `unique`, `selectIndex`, and `validate` flags. Implement `--dry-run`, `--verify`, and `--revert`. The patch list itself is migrated directly from `install.sh` lines 628-771. |
| `wrapper.mjs` | Generate `~/.clawgod/cli.js`, injecting `provider.json`, `features.json`, model aliases, and environment variables. The generated wrapper must match the existing behavior for both macOS/Linux (isolate config when provider API key is set) and Windows (keep `~/.claude` unless overridden). |
| `paths.mjs` | Export constants such as `CLAWGOD_DIR`, `BIN_DIR`, `VENDOR_DIR`, `CLAUDE_BIN`, etc., resolving cross-platform differences (`$HOME` vs `$env:USERPROFILE`). |
| `platform.mjs` | Encapsulate platform-specific behavior: launcher script extension (`.cmd` vs none), shell command syntax, native binary search paths, and config directory isolation rules. |

### 4.5 Execution Flow (`clawgod install`)

```
commands/install.mjs
    -> downloader.mjs  (npm install + copy cli.original.js)
    -> vendor.mjs       (copy vendor/)
    -> extractor.mjs    (extract native .node modules, optional)
    -> wrapper.mjs      (write cli.js)
    -> patcher.mjs      (apply patches to cli.original.js)
    -> platform.mjs     (install claude launcher + backup original)
```

## 5. Backward Compatibility

### 5.1 Existing One-Liner Install

```bash
curl -fsSL https://github.com/0Chencc/clawgod/releases/latest/download/install.sh | bash
irm https://github.com/0Chencc/clawgod/releases/latest/download/install.ps1 | iex
```

These commands continue to work. The scripts they fetch are now much smaller bootstrappers, but the user-visible behavior is unchanged.

### 5.2 Migration from Old Structure

- **Clean install:** `clawgod install` cleans up old npm modules and generated files before writing new ones. The `src/` directory is overwritten in place.
- **Uninstall:** `clawgod uninstall` restores `claude.orig`, removes `cli.js`, `cli.original.js`, `patch.js`, `node_modules`, and `vendor/`. The CLI itself (`bin/`, `src/`) may optionally be removed with a `--purge` flag.

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Regex patches break on new Claude Code bundle | High | `patcher.mjs` keeps `optional`/`unique`/`validate` semantics. Non-fatal mismatches emit warnings and do not abort installation. |
| Native extractor incompatible with future Bun binary | Medium | `extractor.mjs` is optional. Failure warns the user but allows installation to continue. |
| PATH / permission issues during bootstrap | Medium | The CLI performs runtime checks and prints actionable error messages. |
| Windows PowerShell execution policy blocks install.ps1 | Medium | Simplified script is smaller and easier to run manually if needed. README retains manual download instructions. |
| Old files in `~/.clawgod/` conflict with new layout | Low | `clawgod install` proactively removes conflicting artifacts before generation. |

## 7. Testing Strategy

1. **Patcher dry-run:** After migration, run `clawgod patch --dry-run` against the latest Claude Code bundle and confirm all expected patches match.
2. **Launcher verification:** On each target OS, verify that `claude` resolves to the patched version and `claude.orig` resolves to the original.
3. **Uninstall / reinstall cycle:** Run `clawgod uninstall` followed by `clawgod install` and ensure a clean state.
4. **Version switch:** Run `clawgod install --version 2.1.89` and then `clawgod install --version 2.1.90` and verify the bundle and patches update correctly.

## 8. Implementation Phases

1. **Scaffold:** Create `package.json`, `bin/`, `src/` directories.
2. **Migrate core logic:** Port patcher, extractor, wrapper, downloader, and vendor logic from `install.sh` into standalone `.mjs` modules.
3. **Build CLI:** Implement argument parsing and the four commands (`install`, `uninstall`, `patch`, `status`).
4. **Rewrite bootstrappers:** Reduce `install.sh` and `install.ps1` to thin wrappers.
5. **Validate:** Run dry-run tests, cross-platform launcher checks, and uninstall/reinstall cycles.
6. **Document:** Update `CLAUDE.md`, `README.md`, and `README_ZH.md` with new CLI usage.
