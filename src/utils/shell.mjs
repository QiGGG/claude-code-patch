import { execSync } from 'child_process';
import { mkdirSync, existsSync, rmSync } from 'fs';

export function run(cmd, options = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: options.silent ? 'pipe' : 'inherit',
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
  });
}

export function runSilent(cmd, options = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: 'pipe',
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
  });
}

export function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function removeIfExists(path) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}
