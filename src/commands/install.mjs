import { existsSync, copyFileSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import {
  CLAWGOD_DIR, BIN_DIR, VENDOR_DIR, ORIGINAL_CLI, WRAPPER_CLI,
  LAUNCHER_PATH, ORIG_LAUNCHER_PATH,
} from '../utils/paths.mjs';
import { IS_WIN, createLauncherContent, getNativeBinarySearchPaths } from '../utils/platform.mjs';
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
        return entry.full;
      }
      try {
        const fileOut = runSilent(`file "${entry.full}"`);
        if (/Mach-O|ELF|PE32|PE32\+|executable/.test(fileOut)) {
          return entry.full;
        }
      } catch {
        continue;
      }
    }
  }

  if (IS_WIN) {
    const origExe = join(BIN_DIR, 'claude.orig.exe');
    if (existsSync(origExe)) {
      const st = statSync(origExe);
      if (st.isFile() && st.size > 10 * 1024 * 1024) {
        return origExe;
      }
    }
  }

  return null;
}

function setupWindowsLauncher() {
  const claudeExe = join(BIN_DIR, 'claude.exe');
  const claudeOrigExe = join(BIN_DIR, 'claude.orig.exe');
  const claudeCmd = join(BIN_DIR, 'claude.cmd');

  const searchLocs = [
    claudeExe,
    join(homedir(), '.local', 'share', 'claude', 'versions'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'claude-code'),
  ];

  for (const loc of searchLocs) {
    if (!existsSync(loc)) continue;
    const st = statSync(loc);
    if (st.isFile() && loc.endsWith('.exe')) {
      if (!existsSync(claudeOrigExe)) {
        copyFileSync(loc, claudeOrigExe);
        console.log('[OK] Original claude.exe backed up -> claude.orig.exe');
      }
      break;
    }
    if (st.isDirectory()) {
      let exes;
      try {
        exes = readdirSync(loc)
          .map((n) => join(loc, n))
          .filter((f) => existsSync(f) && statSync(f).isFile() && f.endsWith('.exe'))
          .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      } catch {
        continue;
      }
      if (exes.length > 0 && !existsSync(claudeOrigExe)) {
        copyFileSync(exes[0], claudeOrigExe);
        console.log(`[OK] Original claude backed up -> claude.orig.exe (${exes[0]})`);
      }
      break;
    }
  }

  if (existsSync(claudeExe)) {
    if (!existsSync(claudeOrigExe)) {
      renameSync(claudeExe, claudeOrigExe);
      console.log('[OK] Renamed claude.exe -> claude.orig.exe');
    } else {
      try {
        unlinkSync(claudeExe);
        console.log('[OK] Removed claude.exe (.cmd now takes priority)');
      } catch {
        const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        renameSync(claudeExe, join(BIN_DIR, `claude.${ts}.exe`));
      }
    }
  }

  try {
    readdirSync(BIN_DIR)
      .filter((n) => /^claude\.\d+\.exe$/.test(n))
      .forEach((n) => unlinkSync(join(BIN_DIR, n)));
  } catch {}

  const launcherContent = createLauncherContent(WRAPPER_CLI);
  writeFileSync(claudeCmd, launcherContent);
  console.log("[OK] Command 'claude' -> patched");

  try {
    const userPath = runSilent(`powershell -Command "[Environment]::GetEnvironmentVariable('Path', 'User')"`).trim();
    if (!userPath.includes(BIN_DIR)) {
      runSilent(`powershell -Command "[Environment]::SetEnvironmentVariable('Path', '${BIN_DIR};${userPath}', 'User')"`);
      console.log(`[OK] Added ${BIN_DIR} to user PATH`);
      console.log('  (restart terminal for PATH to take effect)');
    }
  } catch {}
}

function setupUnixLauncher() {
  let claudeBin = null;
  try {
    claudeBin = runSilent('which claude').trim().split('\n')[0];
  } catch {
    claudeBin = LAUNCHER_PATH;
  }

  const claudeDir = dirname(claudeBin);

  if (!existsSync(ORIG_LAUNCHER_PATH)) {
    if (existsSync(claudeBin)) {
      try {
        const isSymlink = runSilent(`test -L "${claudeBin}" && readlink "${claudeBin}"`);
        if (isSymlink) {
          const target = isSymlink.trim();
          runSilent(`ln -sf "${target}" "${ORIG_LAUNCHER_PATH}"`);
          console.log(`[OK] Original claude backed up -> claude.orig (-> ${target})`);
        } else {
          copyFileSync(claudeBin, ORIG_LAUNCHER_PATH);
          console.log('[OK] Original claude backed up -> claude.orig');
        }
      } catch {
        copyFileSync(claudeBin, ORIG_LAUNCHER_PATH);
        console.log('[OK] Original claude backed up -> claude.orig');
      }
      unlinkSync(claudeBin);
    }
  }

  const launcherContent = createLauncherContent(WRAPPER_CLI);
  writeFileSync(claudeBin, launcherContent, { mode: 0o755 });
  console.log(`[OK] Command 'claude' -> patched (${claudeBin})`);

  if (claudeDir !== BIN_DIR) {
    ensureDir(BIN_DIR);
    writeFileSync(join(BIN_DIR, 'claude'), launcherContent, { mode: 0o755 });
  }
}

export function runInstall(args) {
  let version = '2.1.112';
  const vIdx = args.indexOf('--version');
  if (vIdx !== -1 && args[vIdx + 1]) {
    version = args[vIdx + 1];
  }

  console.log(`Installing Claude Code @${version} ...`);

  // 1. Download
  const { version: installedVersion, mode, binaryPath } = downloadClaudeCode(version);
  console.log(`[OK] Claude Code v${installedVersion} downloaded (${mode} mode)`);

  if (mode === 'legacy') {
    // ── Legacy Mode: full patch workflow ──────────────────────────

    // 2. Vendor
    const vendorOk = setupVendor();
    if (vendorOk) console.log('[OK] Vendor copied');

    // 3. Extract native modules
    const nativeBin = findNativeBinary();
    if (nativeBin) {
      try {
        const result = extractNativeModules(nativeBin, VENDOR_DIR);
        if (result.extracted.length > 0) {
          console.log(`[OK] Extracted ${result.extracted.length} native modules from ${nativeBin}`);
        }
      } catch (err) {
        console.log(`[WARN] Native extraction failed: ${err.message}`);
      }
    }

    // 4. Wrapper
    generateWrapper('legacy');
    console.log('[OK] Wrapper created');

    // 5. Patches
    const patchResult = runPatcher();
    console.log(`[OK] Patches applied: ${patchResult.applied}`);

  } else {
    // ── Native Mode: wrapper-only (no patches possible) ──────────

    console.log('[INFO] Native binary detected. Running in wrapper-only mode.');
    console.log('  - Feature flags, API proxy, and model aliases are still injected via environment variables.');
    console.log('  - Source-level patches (green theme, message filters, internal user mode) are unavailable.');
    console.log('  - Consider using --version 2.1.112 or earlier for full patch support.');

    // 4. Wrapper (spawns native binary)
    generateWrapper('native', binaryPath);
    console.log('[OK] Wrapper created (native mode)');
  }

  // 6. Replace claude command
  ensureDir(BIN_DIR);

  if (IS_WIN) {
    setupWindowsLauncher();
  } else {
    setupUnixLauncher();
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
