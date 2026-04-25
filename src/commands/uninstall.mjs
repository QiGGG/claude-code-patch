import { existsSync, renameSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  CLAWGOD_DIR, VENDOR_DIR, ORIGINAL_CLI, BACKUP_CLI, WRAPPER_CLI,
  BIN_DIR, LAUNCHER_PATH, ORIG_LAUNCHER_PATH, CLAWGOD_LAUNCHER_PATH,
} from '../utils/paths.mjs';
import { IS_WIN } from '../utils/platform.mjs';
import { removeIfExists, runSilent } from '../utils/shell.mjs';

export function runUninstall() {
  if (IS_WIN) {
    // Restore original claude.cmd
    const claudeOrigCmd = join(BIN_DIR, 'claude.orig.cmd');
    const claudeCmd = join(BIN_DIR, 'claude.cmd');
    if (existsSync(claudeOrigCmd)) {
      if (existsSync(claudeCmd)) {
        unlinkSync(claudeCmd);
      }
      renameSync(claudeOrigCmd, claudeCmd);
      console.log('[OK] Original claude restored');
    }
    // Restore original claude.exe
    const claudeOrigExe = join(BIN_DIR, 'claude.orig.exe');
    const claudeExe = join(BIN_DIR, 'claude.exe');
    if (existsSync(claudeOrigExe)) {
      if (existsSync(claudeExe)) {
        unlinkSync(claudeExe);
      }
      renameSync(claudeOrigExe, claudeExe);
      console.log('[OK] Original claude.exe restored');
    }
  } else {
    // Restore original claude launcher across possible directories
    const dirsToCheck = [BIN_DIR, dirname(LAUNCHER_PATH)]
      .filter((d, i, arr) => arr.indexOf(d) === i);

    for (const dir of dirsToCheck) {
      const orig = join(dir, 'claude.orig');
      const launcher = join(dir, 'claude');
      if (existsSync(orig)) {
        if (existsSync(launcher)) {
          unlinkSync(launcher);
        }
        renameSync(orig, launcher);
        console.log(`[OK] Original claude restored (${launcher})`);
      } else if (existsSync(launcher)) {
        // Our launcher, no backup — remove it
        try {
          const isOurLauncher = readFileSync(launcher, 'utf8').includes('clawgod');
          if (isOurLauncher) {
            unlinkSync(launcher);
            console.log(`[OK] Removed ClawGod launcher (${launcher})`);
          }
        } catch {}
      }
    }
  }

  // Remove generated files
  const toRemove = [
    ORIGINAL_CLI,
    BACKUP_CLI,
    WRAPPER_CLI,
    `${CLAWGOD_DIR}/patch.js`,
    `${CLAWGOD_DIR}/extract-natives.mjs`,
  ];
  for (const f of toRemove) {
    removeIfExists(f);
  }

  // Remove vendor and CLI launcher
  removeIfExists(VENDOR_DIR);
  removeIfExists(CLAWGOD_LAUNCHER_PATH);

  // Optionally keep node_modules for faster reinstall,
  // but remove it to be fully clean
  removeIfExists(`${CLAWGOD_DIR}/node_modules`);

  console.log('[OK] ClawGod uninstalled');
  console.log('  Restart your terminal or run: hash -r');
}
