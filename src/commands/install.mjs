import { existsSync, copyFileSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import {
  CLAWGOD_DIR, BIN_DIR, VENDOR_DIR, ORIGINAL_CLI, WRAPPER_CLI,
  LAUNCHER_PATH, ORIG_LAUNCHER_PATH,
} from '../utils/paths.mjs';
import { IS_WIN, createLauncherContent, createOrigLauncherContent, getNativeBinarySearchPaths } from '../utils/platform.mjs';
import { downloadClaudeCode } from '../core/downloader.mjs';
import { setupVendor } from '../core/vendor.mjs';
import { extractNativeModules } from '../core/extractor.mjs';
import { generateWrapper } from '../core/wrapper.mjs';
import { runPatcher } from '../core/patcher.mjs';
import { ensureDir, removeIfExists, runSilent } from '../utils/shell.mjs';

function findNativeBinary() {
  const searchPaths = getNativeBinarySearchPaths();
  for (const dir of searchPaths) {
    if (!existsSync(dir)) continue;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    // Sort by mtime desc
    const withStats = entries
      .map((name) => {
        const full = join(dir, name);
        try {
          const st = statSync(full);
          return { name, full, st };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);

    for (const entry of withStats) {
      if (!entry.st.isFile() || entry.st.size < 10 * 1024 * 1024) continue;
      if (IS_WIN) {
        // On Windows, skip file-type validation (PE scanner will handle it)
        return entry.full;
      }
      try {
        const fileOut = runSilent(`file "${entry.full}"`);
        if (/Mach-O|ELF|PE32|PE32\+|executable/.test(fileOut)) {
          return entry.full;
        }
      } catch {
        // If file command unavailable, fall back to size heuristic on next entry
        continue;
      }
    }
  }
  return null;
}

export function runInstall(args) {
  let version = 'latest';
  const vIdx = args.indexOf('--version');
  if (vIdx !== -1 && args[vIdx + 1]) {
    version = args[vIdx + 1];
  }

  console.log(`Installing Claude Code @${version} ...`);

  // 1. Download
  const installedVersion = downloadClaudeCode(version);
  console.log(`[OK] Claude Code v${installedVersion} downloaded`);

  // 2. Vendor
  const vendorOk = setupVendor();
  if (vendorOk) console.log('[OK] Vendor copied');

  // 3. Extract native modules
  const nativeBin = findNativeBinary();
  if (nativeBin) {
    try {
      const outDir = VENDOR_DIR;
      const result = extractNativeModules(nativeBin, outDir);
      if (result.extracted.length > 0) {
        console.log(`[OK] Extracted ${result.extracted.length} native modules from ${nativeBin}`);
      }
    } catch (err) {
      console.log(`[WARN] Native extraction failed: ${err.message}`);
    }
  }

  // 4. Wrapper
  generateWrapper();
  console.log('[OK] Wrapper created');

  // 5. Patches
  const patchResult = runPatcher();
  console.log(`[OK] Patches applied: ${patchResult.applied}`);

  // 6. Replace claude command
  ensureDir(BIN_DIR);

  // Find existing claude binary
  let claudeBin = null;
  try {
    claudeBin = runSilent(IS_WIN ? 'where claude' : 'which claude').trim().split('\n')[0];
  } catch {
    claudeBin = LAUNCHER_PATH;
  }

  const claudeDir = dirname(claudeBin);

  // Backup original
  if (!existsSync(ORIG_LAUNCHER_PATH)) {
    if (existsSync(LAUNCHER_PATH)) {
      renameSync(LAUNCHER_PATH, ORIG_LAUNCHER_PATH);
      console.log('[OK] Original claude backed up -> claude.orig');
    }
  }

  // Write our launcher
  const launcherContent = createLauncherContent(WRAPPER_CLI);
  writeFileSync(LAUNCHER_PATH, launcherContent, { mode: 0o755 });
  console.log(`[OK] Command 'claude' -> patched (${LAUNCHER_PATH})`);

  // Also install to BIN_DIR if different from where claude was found
  if (claudeDir !== BIN_DIR) {
    ensureDir(BIN_DIR);
    writeFileSync(join(BIN_DIR, IS_WIN ? 'claude.cmd' : 'claude'), launcherContent, { mode: 0o755 });
  }

  // 7. Create default features.json
  const featuresFile = join(CLAWGOD_DIR, 'features.json');
  if (!existsSync(featuresFile)) {
    const defaults = {
      tengu_harbor: true,
      tengu_session_memory: true,
      tengu_amber_flint: true,
      tengu_auto_background_agents: true,
      tengu_destructive_command_warning: true,
      tengu_immediate_model_command: true,
      tengu_desktop_upsell: false,
      tengu_malort_pedway: { enabled: true },
      tengu_amber_quartz_disabled: false,
      tengu_prompt_cache_1h_config: { allowlist: ['*'] },
    };
    writeFileSync(featuresFile, JSON.stringify(defaults, null, 2) + '\n');
    console.log('[OK] Default features.json created');
  }

  console.log('\nClawGod installed!');
  console.log('  claude      - Start patched Claude Code');
  console.log('  claude.orig - Run original unpatched version');
}
