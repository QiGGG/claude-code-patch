import { existsSync, renameSync, unlinkSync } from 'fs';
import {
  CLAWGOD_DIR, ORIGINAL_CLI, BACKUP_CLI, WRAPPER_CLI,
  LAUNCHER_PATH, ORIG_LAUNCHER_PATH,
} from '../utils/paths.mjs';
import { removeIfExists } from '../utils/shell.mjs';

export function runUninstall() {
  // Restore original launcher
  if (existsSync(ORIG_LAUNCHER_PATH)) {
    if (existsSync(LAUNCHER_PATH)) {
      unlinkSync(LAUNCHER_PATH);
    }
    renameSync(ORIG_LAUNCHER_PATH, LAUNCHER_PATH);
    console.log('[OK] Original claude restored');
  } else if (existsSync(LAUNCHER_PATH)) {
    // If it's our launcher and no backup exists, just remove it
    unlinkSync(LAUNCHER_PATH);
    console.log('[OK] Removed ClawGod launcher');
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

  // Optionally keep node_modules and vendor for faster reinstall,
  // but remove them to be fully clean
  removeIfExists(`${CLAWGOD_DIR}/node_modules`);
  removeIfExists(`${CLAWGOD_DIR}/vendor`);

  console.log('[OK] ClawGod uninstalled');
  console.log('  Restart your terminal or run: hash -r');
}
