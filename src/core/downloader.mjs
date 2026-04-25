import { join, dirname } from 'path';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { arch, platform } from 'os';
import { CLAWGOD_DIR, NPM_PKG_DIR, ORIGINAL_CLI } from '../utils/paths.mjs';
import { ensureDir, runSilent } from '../utils/shell.mjs';

const PACKAGE_PREFIX = '@anthropic-ai/claude-code';

const PLATFORMS = {
  'darwin-arm64': { pkg: PACKAGE_PREFIX + '-darwin-arm64', bin: 'claude' },
  'darwin-x64':   { pkg: PACKAGE_PREFIX + '-darwin-x64',   bin: 'claude' },
  'linux-x64':    { pkg: PACKAGE_PREFIX + '-linux-x64',    bin: 'claude' },
  'linux-arm64':  { pkg: PACKAGE_PREFIX + '-linux-arm64',  bin: 'claude' },
  'linux-x64-musl':    { pkg: PACKAGE_PREFIX + '-linux-x64-musl',    bin: 'claude' },
  'linux-arm64-musl':  { pkg: PACKAGE_PREFIX + '-linux-arm64-musl',  bin: 'claude' },
  'win32-x64':    { pkg: PACKAGE_PREFIX + '-win32-x64',    bin: 'claude.exe' },
  'win32-arm64':  { pkg: PACKAGE_PREFIX + '-win32-arm64',  bin: 'claude.exe' },
};

function detectMusl() {
  if (platform() !== 'linux') return false;
  const report = typeof process.report?.getReport === 'function' ? process.report.getReport() : null;
  return report != null && report.header?.glibcVersionRuntime === undefined;
}

function getPlatformKey() {
  const plt = platform();
  let cpu = arch();
  if (plt === 'linux') {
    return 'linux-' + cpu + (detectMusl() ? '-musl' : '');
  }
  if (plt === 'darwin' && cpu === 'x64') {
    try {
      const r = runSilent('sysctl -n sysctl.proc_translated');
      if (r.trim() === '1') cpu = 'arm64';
    } catch {}
  }
  return plt + '-' + cpu;
}

function findNativeBinary() {
  // 1. Check if postinstall already placed it in bin/claude.exe
  const postinstallBin = join(NPM_PKG_DIR, 'bin', platform() === 'win32' ? 'claude.exe' : 'claude');
  if (existsSync(postinstallBin)) {
    return postinstallBin;
  }

  // 2. Check platform-specific optional dependency
  const platformKey = getPlatformKey();
  const info = PLATFORMS[platformKey];
  if (info) {
    try {
      const platformPkgDir = join(CLAWGOD_DIR, 'node_modules', info.pkg);
      const platformBin = join(platformPkgDir, info.bin);
      if (existsSync(platformBin)) {
        return platformBin;
      }
    } catch {}
  }

  return null;
}

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

  // Read installed version from main package
  const installedPkg = join(NPM_PKG_DIR, 'package.json');
  const { version: installedVersion } = JSON.parse(readFileSync(installedPkg, 'utf8'));

  // Detect architecture: does cli.js exist?
  const srcCli = join(NPM_PKG_DIR, 'cli.js');
  if (existsSync(srcCli)) {
    // Legacy mode: JS bundle
    copyFileSync(srcCli, ORIGINAL_CLI);
    return { version: installedVersion, mode: 'legacy' };
  }

  // Native mode: compiled binary
  const binaryPath = findNativeBinary();
  if (!binaryPath) {
    throw new Error(
      `Claude Code v${installedVersion} uses a native binary architecture. ` +
      `Could not find the platform-specific binary for ${getPlatformKey()}. ` +
      `Try installing with: npm install --prefix "${CLAWGOD_DIR}" "${pkg}"`
    );
  }

  return { version: installedVersion, mode: 'native', binaryPath };
}
