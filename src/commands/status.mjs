import { existsSync, readFileSync } from 'fs';
import {
  CLAWGOD_DIR, ORIGINAL_CLI, BACKUP_CLI, WRAPPER_CLI, VENDOR_DIR,
} from '../utils/paths.mjs';
import { IS_WIN } from '../utils/platform.mjs';
import { runPatcher } from '../core/patcher.mjs';

export function runStatus() {
  const hasOriginal = existsSync(ORIGINAL_CLI);
  const hasBackup = existsSync(BACKUP_CLI);
  const hasWrapper = existsSync(WRAPPER_CLI);

  let version = 'not installed';
  if (hasOriginal) {
    const code = readFileSync(ORIGINAL_CLI, 'utf8');
    const m = code.match(/Version:\s*([\d.]+)/);
    version = m ? m[1] : 'unknown';
  }

  let patchStatus = 'unknown';
  if (hasOriginal) {
    const result = runPatcher({ verify: true });
    patchStatus = `${result.applied} applied, ${result.skipped} skipped, ${result.failed} failed`;
  }

  console.log('ClawGod Status');
  console.log('==============');
  console.log(`Claude Code version: ${version}`);
  console.log(`Patch status:        ${patchStatus}`);
  console.log(`Backup present:      ${hasBackup ? 'yes' : 'no'}`);
  console.log(`Wrapper present:     ${hasWrapper ? 'yes' : 'no'}`);
  console.log(`Config directory:    ${CLAWGOD_DIR}`);
  console.log(`Platform:            ${process.platform}`);
  console.log(`Windows config isolation: ${IS_WIN ? 'disabled' : 'enabled (when API key set)'}`);
}
