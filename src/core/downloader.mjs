import { join } from 'path';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { CLAWGOD_DIR, NPM_PKG_DIR, ORIGINAL_CLI } from '../utils/paths.mjs';
import { ensureDir, runSilent } from '../utils/shell.mjs';

export function downloadClaudeCode(version = 'latest') {
  ensureDir(CLAWGOD_DIR);

  const pkg = `@anthropic-ai/claude-code@${version}`;
  runSilent(`npm install --prefix "${CLAWGOD_DIR}" "${pkg}" --save-exact --no-fund --no-audit`);

  // Ensure ESM support in ~/.clawgod/package.json
  const pkgJsonPath = join(CLAWGOD_DIR, 'package.json');
  if (existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    if (!pkgJson.type) {
      pkgJson.type = 'module';
      writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
    }
  }

  // Copy bundle
  const srcCli = join(NPM_PKG_DIR, 'cli.js');
  if (!existsSync(srcCli)) {
    throw new Error(`Downloaded package missing cli.js: ${srcCli}`);
  }
  copyFileSync(srcCli, ORIGINAL_CLI);

  // Read installed version
  const installedPkg = join(NPM_PKG_DIR, 'package.json');
  const { version: installedVersion } = JSON.parse(readFileSync(installedPkg, 'utf8'));

  return installedVersion;
}
