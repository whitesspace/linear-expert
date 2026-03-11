import { spawnSync } from 'node:child_process';

const tests = [
  'test/storage.memory.test.ts',
  'test/schemas.test.ts',
  'test/signature.test.ts',
  'test/internal.routes.test.ts',
  'test/healthz.test.ts',
  'test/smoke.contracts.test.ts',
  'test/webhooks.agent-session.test.ts',
  'test/agent-runs.routes.test.ts',
  'test/openclaw.runner-utils.test.ts',
  'test/invoke-replay.test.mjs'
];

for (const file of tests) {
  const result = spawnSync('node', ['--import', 'tsx', file], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('All tests passed');
