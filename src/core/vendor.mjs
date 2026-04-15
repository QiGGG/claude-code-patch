import { join } from 'path';
import { existsSync, cpSync } from 'fs';
import { NPM_PKG_DIR, VENDOR_DIR } from '../utils/paths.mjs';
import { ensureDir, removeIfExists } from '../utils/shell.mjs';

export function setupVendor() {
  const npmVendor = join(NPM_PKG_DIR, 'vendor');

  removeIfExists(VENDOR_DIR);
  ensureDir(VENDOR_DIR);

  if (existsSync(npmVendor)) {
    try {
      cpSync(npmVendor, VENDOR_DIR, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
