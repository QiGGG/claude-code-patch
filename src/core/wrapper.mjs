import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { WRAPPER_CLI, CLAWGOD_DIR, PROVIDER_JSON } from '../utils/paths.mjs';
import { IS_WIN } from '../utils/platform.mjs';

export function generateWrapper() {
  const claudeDir = join(homedir(), '.claude');
  const configDir = process.env.CLAUDE_CONFIG_DIR || (existsSync(claudeDir) ? claudeDir : CLAWGOD_DIR);
  const providerDir = CLAWGOD_DIR;

  const defaultConfig = {
    apiKey: '',
    baseURL: 'https://api.anthropic.com',
    model: '',
    smallModel: '',
    timeoutMs: 3000000,
  };

  let config = { ...defaultConfig };
  if (existsSync(PROVIDER_JSON)) {
    try {
      const raw = JSON.parse(readFileSync(PROVIDER_JSON, 'utf8'));
      config = { ...defaultConfig, ...raw };
    } catch {}
  } else {
    mkdirSync(providerDir, { recursive: true });
    writeFileSync(PROVIDER_JSON, JSON.stringify(defaultConfig, null, 2) + '\n');
  }

  // Model aliases
  const aliasesFile = join(providerDir, 'model-aliases.json');
  let aliases = {};
  if (existsSync(aliasesFile)) {
    try { aliases = JSON.parse(readFileSync(aliasesFile, 'utf8')); } catch {}
  }
  const resolveAlias = (name) => aliases[name] || name;

  const hasProviderApiKey = !!config.apiKey;

  const wrapperSource = `#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const claudeDir = join(homedir(), '.claude');
const clawgodDir = ${JSON.stringify(CLAWGOD_DIR)};
const configDir = process.env.CLAUDE_CONFIG_DIR || (existsSync(claudeDir) ? claudeDir : clawgodDir);
const providerDir = clawgodDir;
const configFile = join(providerDir, 'provider.json');

const defaultConfig = {
  apiKey: '',
  baseURL: 'https://api.anthropic.com',
  model: '',
  smallModel: '',
  timeoutMs: 3000000,
};

let config = { ...defaultConfig };
if (existsSync(configFile)) {
  try {
    const raw = JSON.parse(readFileSync(configFile, 'utf8'));
    config = { ...defaultConfig, ...raw };
  } catch {}
} else {
  mkdirSync(providerDir, { recursive: true });
  writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2) + '\\n');
}

const aliasesFile = join(providerDir, 'model-aliases.json');
let aliases = {};
if (existsSync(aliasesFile)) {
  try { aliases = JSON.parse(readFileSync(aliasesFile, 'utf8')); } catch {}
}
function resolveAlias(name) { return aliases[name] || name; }

const hasProviderApiKey = !!config.apiKey;

if (hasProviderApiKey) {
  process.env.ANTHROPIC_API_KEY = config.apiKey;
  if (config.baseURL) process.env.ANTHROPIC_BASE_URL = config.baseURL;
  if (config.model) process.env.ANTHROPIC_MODEL = resolveAlias(config.model);
  if (config.smallModel) process.env.ANTHROPIC_SMALL_FAST_MODEL = resolveAlias(config.smallModel);
  ${IS_WIN ? '' : 'process.env.CLAUDE_CONFIG_DIR = clawgodDir;'}
  if (config.baseURL && !/anthropic\\.com/i.test(config.baseURL)) {
    process.env.ANTHROPIC_AUTH_TOKEN ??= config.apiKey;
  }
} else {
  if (config.baseURL && config.baseURL !== defaultConfig.baseURL) {
    process.env.ANTHROPIC_BASE_URL ??= config.baseURL;
  }
  process.env.CLAUDE_CONFIG_DIR ??= configDir;
}

if (config.timeoutMs) {
  process.env.API_TIMEOUT_MS ??= String(config.timeoutMs);
}
process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ??= '1';
process.env.DISABLE_INSTALLATION_CHECKS ??= '1';

const featuresFile = join(providerDir, 'features.json');
if (!process.env.CLAUDE_INTERNAL_FC_OVERRIDES && existsSync(featuresFile)) {
  try {
    const raw = readFileSync(featuresFile, 'utf8');
    JSON.parse(raw);
    process.env.CLAUDE_INTERNAL_FC_OVERRIDES = raw;
  } catch {}
}

await import('./cli.original.js');
`;

  writeFileSync(WRAPPER_CLI, wrapperSource);
}
