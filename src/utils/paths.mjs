import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HOME = homedir();

export const CLAWGOD_DIR = join(HOME, '.clawgod');
export const BIN_DIR = join(HOME, '.local', 'bin');
export const VENDOR_DIR = join(CLAWGOD_DIR, 'vendor');
export const NODE_MODULES_DIR = join(CLAWGOD_DIR, 'node_modules');
export const NPM_PKG_DIR = join(NODE_MODULES_DIR, '@anthropic-ai', 'claude-code');

// Working files
export const ORIGINAL_CLI = join(CLAWGOD_DIR, 'cli.original.js');
export const BACKUP_CLI = join(CLAWGOD_DIR, 'cli.original.js.bak');
export const WRAPPER_CLI = join(CLAWGOD_DIR, 'cli.js');
export const PROVIDER_JSON = join(CLAWGOD_DIR, 'provider.json');
export const FEATURES_JSON = join(CLAWGOD_DIR, 'features.json');

// Launcher paths
const isWin = process.platform === 'win32';

export const LAUNCHER_NAME = isWin ? 'claude.cmd' : 'claude';
export const ORIG_LAUNCHER_NAME = isWin ? 'claude.orig.cmd' : 'claude.orig';
export const CLAWGOD_LAUNCHER_NAME = isWin ? 'clawgod.cmd' : 'clawgod';

export const LAUNCHER_PATH = join(BIN_DIR, LAUNCHER_NAME);
export const ORIG_LAUNCHER_PATH = join(BIN_DIR, ORIG_LAUNCHER_NAME);
export const CLAWGOD_LAUNCHER_PATH = join(BIN_DIR, CLAWGOD_LAUNCHER_NAME);

// This repo's source files when installed
export const __dirname = dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = join(__dirname, '..');
export const BIN_FILE = join(SRC_DIR, '..', 'bin', 'clawgod.mjs');
