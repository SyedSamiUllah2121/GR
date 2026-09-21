/**
 * The whole suite, in one command.
 *
 * Each file runs in its own process. That is not tidiness: the stores hold
 * module-level state and read a `localStorage` shim installed on the global,
 * so two suites in one process would share a browser and the second would
 * inherit whatever the first left behind — which is exactly the bug these
 * tests exist to catch.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const suites = readdirSync(here)
  .filter((f) => /^[a-z]-.*\.mts$/.test(f))
  .sort();

let failed = 0;
for (const suite of suites) {
  console.log(`\n${'━'.repeat(64)}\n  ${suite}\n${'━'.repeat(64)}`);
  // Quoted: a shell splits the path on spaces, and the checkout may sit under one.
  const run = spawnSync('npx', ['tsx', JSON.stringify(join(here, suite))], { stdio: 'inherit', shell: true });
  if (run.status !== 0) failed += 1;
}

console.log(`\n${'═'.repeat(64)}`);
console.log(failed === 0 ? `ALL ${suites.length} SUITES PASSED` : `${failed} of ${suites.length} SUITES FAILED`);
process.exit(failed === 0 ? 0 : 1);
