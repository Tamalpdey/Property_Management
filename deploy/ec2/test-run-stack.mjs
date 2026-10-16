import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'maple-deploy-test-'));
const log = join(temporary, 'calls.jsonl');
const docker = join(temporary, 'docker');

// Record commands without building, pushing, stopping, or deploying real containers.
writeFileSync(docker, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKER_STUB_LOG, JSON.stringify({
  args, cwd: process.cwd(), platform: process.env.DOCKER_PLATFORM,
  defaultPlatform: process.env.DOCKER_DEFAULT_PLATFORM, caddyfile: process.env.CADDYFILE
}) + '\\n');
if (args.includes('config')) console.log('services:\\n  lorne-modulith:\\n    image: backend\\n  redis:\\n    image: redis\\n  public-site:\\n    image: website');
if (process.env.FAIL_SITE && args.includes('up') && args.at(-1) === 'public-site') process.exit(17);
if (process.env.FAIL_PULL && args.includes('pull')) process.exit(18);
`, { mode: 0o755 });

function run(args, environment = {}) {
  writeFileSync(log, '');
  const result = spawnSync('bash', [join(directory, 'run-stack.sh'), ...args], {
    cwd: temporary,
    encoding: 'utf8',
    env: {
      ...process.env,
      TARGET_PLATFORM: '',
      PATH: `${temporary}:${process.env.PATH}`,
      DOCKER_STUB_LOG: log,
      ...environment,
    },
  });
  const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  for (const call of calls) {
    assert.equal(call.cwd, directory);
    assert.deepEqual(call.args.slice(0, 5), ['compose', '--env-file', '.env.prod', '-f', 'docker-compose.yml']);
  }
  return { ...result, calls: calls.map(call => ({ ...call, args: call.args.slice(5) })) };
}

try {
  const applicationServices = ['edge', 'lorne-modulith', 'public-site', 'tenant-portal', 'admin-portal', 'worker-app'];
  let publish = run(['prod', 'push']);
  assert.equal(publish.status, 0, publish.stderr);
  assert.deepEqual(publish.calls[0].args, ['push', ...applicationServices]);
  publish = run(['prod', 'build-push']);
  assert.equal(publish.status, 0, publish.stderr);
  assert.deepEqual(publish.calls[0].args, ['build', '--push', ...applicationServices]);
  publish = run(['prod', 'push', 'worker-app']);
  assert.equal(publish.status, 0, publish.stderr);
  assert.deepEqual(publish.calls[0].args, ['push', 'worker-app']);
  for (const action of ['push', 'build-push']) {
    for (const service of ['redis', 'db-migration', 'unknown']) {
      const denied = run(['prod', action, service]);
      assert.equal(denied.status, 1);
      assert.equal(denied.calls.length, 0);
    }
  }
  let result = run(['prod', 'website-build-push']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.map(call => call.args), [['build', '--push', 'public-site', 'edge']]);
  assert.equal(result.calls[0].caddyfile, 'Caddyfile');

  result = run(['prod', 'website-pull-deploy']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.filter(call => call.args[0] !== 'config').map(call => call.args), [
    ['pull', 'public-site', 'edge'],
    ['up', '-d', '--no-build', '--no-deps', '--wait', '--wait-timeout', '90', 'public-site'],
    ['up', '-d', '--no-build', '--no-deps', '--wait', '--wait-timeout', '90', 'edge'],
  ]);

  result = run(['prod', 'website-deploy'], { FAIL_SITE: '1' });
  assert.equal(result.status, 17);
  assert.equal(result.calls.filter(call => call.args[0] === 'up').length, 1, 'Edge must remain untouched if site startup fails');

  result = run(['prod', 'website-pull-deploy'], { FAIL_PULL: '1' });
  assert.equal(result.status, 18);
  assert.equal(result.calls.filter(call => call.args[0] === 'up').length, 0);

  result = run(['prod', 'website-build', 'worker-app']);
  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 0);

  result = run(['local', 'website-build'], { TARGET_PLATFORM: 'linux/arm64' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls[0].platform, 'linux/arm64');
  assert.equal(result.calls[0].defaultPlatform, 'linux/arm64');
  assert.equal(result.calls[0].caddyfile, 'Caddyfile.local');

  result = run(['prod', 'build', 'tenant-portal']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls[0].args, ['build', 'tenant-portal']);

  console.log('PASS: website build/push, isolated rollout, failure ordering, argument validation, working directory, platform, and existing service commands. Docker calls mocked.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
