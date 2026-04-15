import { runPatcher } from '../core/patcher.mjs';

export function runPatch(args) {
  const dryRun = args.includes('--dry-run');
  const verify = args.includes('--verify');
  const revert = args.includes('--revert');

  try {
    const result = runPatcher({ dryRun, verify, revert });

    if (revert) {
      console.log('[OK] Reverted from backup');
      return;
    }

    console.log(`\n${'='.repeat(55)}`);
    console.log(`  ClawGod (universal)`);
    console.log(`  Target: cli.original.js (v${result.version})`);
    console.log(`  Mode: ${dryRun ? 'DRY RUN' : verify ? 'VERIFY' : 'APPLY'}`);
    console.log(`${'='.repeat(55)}\n`);
    console.log(`  Result: ${result.applied} applied, ${result.skipped} skipped, ${result.failed} failed`);
    if (!dryRun && !verify && result.applied > 0) {
      console.log(`  [Write] cli.original.js (${result.diff >= 0 ? '+' : ''}${result.diff} bytes)`);
    }
    console.log(`${'='.repeat(55)}\n`);
  } catch (err) {
    console.error('[ERR]', err.message);
    process.exit(1);
  }
}
