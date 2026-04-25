import { runInstall } from './commands/install.mjs';
import { runUninstall } from './commands/uninstall.mjs';
import { runPatch } from './commands/patch.mjs';
import { runStatus } from './commands/status.mjs';

const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
  console.log(`Usage: clawgod <command> [options]

Commands:
  install [--version x.x.x]   Install or update patched Claude Code
  uninstall                   Remove patches and restore original claude
  patch [--dry-run|--verify|--revert]  Manage patches
  status                      Show installation status
  --version, -v               Show version
`);
}

function showVersion() {
  console.log('ClawGod 1.0.0');
}

export async function main() {
  // Global --version only when no subcommand is given
  if (!command || command === '--version' || command === '-v') {
    showVersion();
    return;
  }

  switch (command) {
    case 'install':
      runInstall(args.slice(1));
      break;
    case 'uninstall':
      runUninstall();
      break;
    case 'patch':
      runPatch(args.slice(1));
      break;
    case 'status':
      runStatus();
      break;
    case 'help':
    case '--help':
    case '-h':
    default:
      showHelp();
      break;
  }
}
