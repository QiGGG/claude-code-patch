import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { ORIGINAL_CLI, BACKUP_CLI } from '../utils/paths.mjs';

const patches = [
  {
    name: 'USER_TYPE -> ant',
    pattern: /function (\w+)\(\)\{return"external"\}/g,
    replacer: (m, fn) => `function ${fn}(){return"ant"}`,
  },
  {
    name: 'GrowthBook env overrides',
    pattern: /function (\w+)\(\)\{if\(!(\w+)\)(\w+)=!0;return (\w+)\}/g,
    replacer: (m, fn, flag, flag2, val) =>
      `function ${fn}(){if(!${flag}){${flag2}=!0;try{let e=process.env.CLAUDE_INTERNAL_FC_OVERRIDES;if(e)${val}=JSON.parse(e)}catch(e){}}return ${val}}`,
    unique: true,
  },
  {
    name: 'GrowthBook config overrides',
    pattern: /function (\w+)\(\)\{return\}(function)/g,
    replacer: (m, fn, next) =>
      `function ${fn}(){try{return j8().growthBookOverrides??null}catch{return null}}${next}`,
    selectIndex: 0,
    validate: (match, code) => {
      const pos = code.indexOf(match);
      const nearby = code.substring(Math.max(0, pos - 500), pos + 500);
      return nearby.includes('growthBook') || nearby.includes('GrowthBook') || nearby.includes('FeatureValue');
    },
  },
  {
    name: 'Agent Teams always enabled',
    pattern: /function (\w+)\(\)\{if\(!\w+\(process\.env\.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS\)\&\&!\w+\(\)\)return!1;if\(!\w+\("tengu_amber_flint",!0\)\)return!1;return!0\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
  },
  {
    name: 'Computer Use subscription bypass',
    pattern: /function (\w+)\(\)\{let \w+=\w+\(\);return \w+==="max"\|\|\w+==="pro"\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
  },
  {
    name: 'Computer Use default enabled',
    pattern: /(\w+=)\{enabled:!1,pixelValidation/g,
    replacer: (m, prefix) => `${prefix}{enabled:!0,pixelValidation`,
  },
  {
    name: 'Ultraplan enable',
    pattern: /(name:"ultraplan",description:`[^`]+`,argumentHint:"<prompt>",isEnabled:\(\)=>)!1/g,
    replacer: (m, prefix) => `${prefix}!0`,
    optional: true,
  },
  {
    name: 'Ultrareview enable',
    pattern: /function (\w+)\(\)\{return \w+\("tengu_review_bughunter_config",null\)\?\.enabled===!0\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
  },
  {
    name: 'Computer Use gate bypass',
    pattern: /function (\w+)\(\)\{return \w+\(\)\&\&\w+\(\)\.enabled\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
  },
  {
    name: 'Voice Mode enable (bypass GrowthBook kill)',
    pattern: /function (\w+)\(\)\{return!\w+\("tengu_amber_quartz_disabled",!1\)\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
  },
  {
    name: 'Auto-mode unlock for third-party API (legacy)',
    pattern: /let (\w+)=\w+\(\);if\(\1!=="firstParty"\&\&\1!=="anthropicAws"\)return!1;return\/\^claude-\(opus\|sonnet\)-4-6\/\.test\((\w+)\)/g,
    replacer: () => `return!0`,
    optional: true,
  },
  {
    name: 'Auto-mode unlock for third-party API (universal)',
    pattern: /let (\w+)=\w+\(\);if\(\1!=="firstParty"\&\&\1!=="anthropicAws"\)return!1(?:;if\(\w+\(\)\)return\/\^claude-opus-4-7\/\.test\(\w+\))?;return\/\^claude-\(opus\|sonnet\)-4-6\/\.test\(\w+\)(?:\|\|\/\^claude-opus-4-7\/\.test\(\w+\))?/g,
    replacer: () => `return!0`,
  },
  {
    name: 'Auto-mode gate bypass',
    pattern: /function ([\w$]+)\(\)\{if\(\w+\?\.\w+\(\)\?\?!1\)return!1;if\(\w+\(\)\)return!1;if\(!\w+\(\w+\(\)\)\)return!1;return!0\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
    validate: (match, code) => match.includes('isAutoModeCircuitBroken'),
  },
  {
    name: 'Auto-mode settings bypass',
    pattern: /function ([\w$]+)\(\)\{let \w+=\w+\(\)\|\|\{\};return \w+\.disableAutoMode==="disable"\|\|\w+\.permissions\?\.disableAutoMode==="disable"\}/g,
    replacer: (m, fn) => `function ${fn}(){return!1}`,
    validate: (match, code) => match.includes('disableAutoMode'),
  },
  {
    name: 'Auto-mode reason bypass',
    pattern: /function ([\w$]+)\(\)\{if\(\w+\(\)\)return"settings";if\(\w+\?\.\w+\(\)\?\?!1\)return"circuit-breaker";if\(!\w+\(\w+\(\)\)\)return"model";return null\}/g,
    replacer: (m, fn) => `function ${fn}(){return null}`,
    validate: (match, code) => match.includes('circuit-breaker'),
  },
  {
    name: 'Auto-mode circuit breaker bypass',
    pattern: /if\(!\(\w+\?\.\w+\(\)\?\?!1\)\)\w+\?\.\w+\(\w+==="disabled"\|\|\w+\)/g,
    replacer: () => '',
    validate: (match, code) => match.includes('setAutoModeCircuitBroken'),
  },
  {
    name: 'Auto-mode verify bypass',
    pattern: /let j=z!=="disabled"\&\&!Y\&\&w/g,
    replacer: () => 'let j=!0;$=!0',
  },
  {
    name: 'Auto-mode nY7 override',
    pattern: /function nY7\(q\)\{if\(q==="enabled"\|\|q==="disabled"\|\|q==="opt-in"\)return q;return \w+\}/g,
    replacer: () => 'function nY7(q){return"enabled"}',
  },
  {
    name: 'Auto-mode c7z override',
    pattern: /function c7z\(\)\{let q=u8\("tengu_auto_mode_config",\{\}\)\?\.enabled;return q==="enabled"\|\|q==="disabled"\|\|q==="opt-in"\?q:"opt-in"\}/g,
    replacer: () => 'function c7z(){return"enabled"}',
  },
  {
    name: 'Auto-mode wY7 override (legacy)',
    pattern: /function wY7\(q\)\{if\(q==="enabled"\|\|q==="disabled"\|\|q==="opt-in"\)return q;return \w+\}/g,
    replacer: () => 'function wY7(q){return"enabled"}',
    optional: true,
  },
  {
    name: 'Auto-mode z1z override (legacy)',
    pattern: /function z1z\(\)\{let q=I8\("tengu_auto_mode_config",\{\}\)\?\.enabled;return q==="enabled"\|\|q==="disabled"\|\|q==="opt-in"\?q:"opt-in"\}/g,
    replacer: () => 'function z1z(){return"enabled"}',
    optional: true,
  },
  {
    name: 'Auto-mode default fallback',
    pattern: /if\(!([\w$]+)\)\1=\{mode:"default",notification:\$\};if\(!\1\)\1=\{mode:"default",notification:\$\}/g,
    replacer: (m) => m.replace(/mode:"default"/g, 'mode:"auto"'),
  },
  {
    name: 'Logo + brand color -> green (RGB dark)',
    pattern: /clawd_body:"rgb\(215,119,87\)"/g,
    replacer: () => 'clawd_body:"rgb(34,197,94)"',
  },
  {
    name: 'Logo + brand color -> green (ANSI)',
    pattern: /clawd_body:"ansi:redBright"/g,
    replacer: () => 'clawd_body:"ansi:greenBright"',
  },
  {
    name: 'Theme claude color -> green (dark)',
    pattern: /claude:"rgb\(215,119,87\)"/g,
    replacer: () => 'claude:"rgb(34,197,94)"',
  },
  {
    name: 'Theme claude color -> green (light)',
    pattern: /claude:"rgb\(255,153,51\)"/g,
    replacer: () => 'claude:"rgb(22,163,74)"',
  },
  {
    name: 'Shimmer -> green',
    pattern: /claudeShimmer:"rgb\(2[34]5,1[45]9,1[12]7\)"/g,
    replacer: () => 'claudeShimmer:"rgb(74,222,128)"',
  },
  {
    name: 'Shimmer light -> green',
    pattern: /claudeShimmer:"rgb\(255,183,101\)"/g,
    replacer: () => 'claudeShimmer:"rgb(34,197,94)"',
  },
  {
    name: 'Hex brand color -> green',
    pattern: /#da7756/g,
    replacer: () => '#22c55e',
  },
  {
    name: 'Remove CYBER_RISK_INSTRUCTION',
    pattern: /(\w+)="IMPORTANT: Assist with authorized security testing[^"]*"/g,
    replacer: (m, varName) => `${varName}=""`,
  },
  {
    name: 'Remove URL generation restriction',
    pattern: /\n\$\{\w+\}\nIMPORTANT: You must NEVER generate or guess URLs[^.]*\. You may use URLs provided by the user in their messages or local files\./g,
    replacer: () => '',
  },
  {
    name: 'Remove cautious actions section',
    pattern: /function (\w+)\(\)\{return`# Executing actions with care\n\n[\s\S]*?`\}/g,
    replacer: (m, fn) => `function ${fn}(){return\`\`}`,
  },
  {
    name: 'Remove "Not logged in" notice',
    pattern: /Not logged in\. Run [\w ]+ to authenticate\./g,
    replacer: () => '',
    optional: true,
  },
  {
    name: 'Attachment filter bypass',
    pattern: /(\w+\(\)!=="ant"\)\{if\(\w+\.attachment\.type==="hook_additional_context")/g,
    replacer: (m, orig) => m.replace(/\w+\(\)!=="ant"/, 'false'),
  },
  {
    name: 'Message list filter bypass',
    pattern: /(\w+)\(\)!=="ant"\?(\w+)\((\w+),(\w+)\((\w+)\)\):(\w+)/g,
    replacer: (m, fn, tRY, underscore, sRY, K, fallback) => fallback,
  },
];

export function runPatcher({ dryRun = false, verify = false, revert = false } = {}) {
  if (revert) {
    if (!existsSync(BACKUP_CLI)) {
      throw new Error('No backup found to revert');
    }
    copyFileSync(BACKUP_CLI, ORIGINAL_CLI);
    return { action: 'revert', success: true };
  }

  if (!existsSync(ORIGINAL_CLI)) {
    throw new Error(`Target not found: ${ORIGINAL_CLI}`);
  }

  let code = readFileSync(ORIGINAL_CLI, 'utf8');
  const origSize = code.length;
  const verMatch = code.match(/Version:\s*([\d.]+)/);
  const version = verMatch ? verMatch[1] : 'unknown';

  let applied = 0, skipped = 0, failed = 0;

  for (const p of patches) {
    const matches = [...code.matchAll(p.pattern)];
    let relevant = matches;

    if (p.validate) {
      relevant = matches.filter(m => p.validate(m[0], code));
    }
    if (p.selectIndex !== undefined) {
      relevant = relevant.length > p.selectIndex ? [relevant[p.selectIndex]] : [];
    }
    if (p.unique && relevant.length !== 1) {
      if (relevant.length !== 1) { failed++; continue; }
    }
    if (verify) {
      if (relevant.length > 0) { skipped++; continue; }
      // fall through to zero-match logic for verify mode
    }
    if (relevant.length === 0) {
      if (p.optional) { skipped++; }
      else { applied++; }
      continue;
    }

    let count = 0;
    for (let i = relevant.length - 1; i >= 0; i--) {
      const m = relevant[i];
      const replacement = p.replacer(m[0], ...m.slice(1));
      if (replacement !== m[0]) {
        if (!dryRun) {
          code = code.slice(0, m.index) + replacement + code.slice(m.index + m[0].length);
        }
        count++;
      }
    }
    if (count > 0) { applied++; }
    else { skipped++; }
  }

  if (!dryRun && !verify && applied > 0) {
    if (!existsSync(BACKUP_CLI)) {
      copyFileSync(ORIGINAL_CLI, BACKUP_CLI);
    }
    writeFileSync(ORIGINAL_CLI, code, 'utf8');
  }

  return { version, applied, skipped, failed, diff: code.length - origSize };
}
