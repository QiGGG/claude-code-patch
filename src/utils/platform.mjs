import { platform, homedir } from 'os';
import { join } from 'path';

export const IS_WIN = platform() === 'win32';
export const IS_MAC = platform() === 'darwin';
export const IS_LINUX = platform() === 'linux';

export function getNativeBinarySearchPaths() {
  const home = homedir();
  if (IS_WIN) {
    return [
      join(home, '.local', 'share', 'claude', 'versions'),
      join(process.env.LOCALAPPDATA || '', 'Programs', 'claude-code'),
    ];
  }
  return [
    join(home, '.local', 'share', 'claude', 'versions'),
  ];
}

export function createLauncherContent(clawgodCliPath) {
  if (IS_WIN) {
    return `@echo off\r\nnode "${clawgodCliPath}" %*\r\n`;
  }
  return `#!/bin/bash\nexec node "${clawgodCliPath}" "$@"\n`;
}

export function createOrigLauncherContent(targetPath) {
  if (IS_WIN) {
    return `@echo off\r\n"${targetPath}" %*\r\n`;
  }
  return `#!/bin/bash\nexec "${targetPath}" "$@"\n`;
}

// Windows keeps ~/.claude as config dir unless overridden;
// macOS/Linux isolate to ~/.clawgod when provider API key is set.
export function shouldIsolateConfig(hasProviderApiKey) {
  if (IS_WIN) return false;
  return hasProviderApiKey;
}
