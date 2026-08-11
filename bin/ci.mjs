import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXIT_CODES, getArg, hasArg } from './cli-utils.mjs';
import { atomicWriteText } from './state-store.mjs';

export const GITHUB_CHECK_NAMES = Object.freeze([
  'harness (ubuntu-latest, 22)',
  'harness (ubuntu-latest, 24)',
  'harness (windows-latest, 22)',
  'harness (windows-latest, 24)',
  'harness (macos-latest, 22)',
  'harness (macos-latest, 24)',
]);

export function githubWorkflow({ base = 'main' } = {}) {
  return `name: Harness Governance

on:
  pull_request:
  push:
    branches: [${base}]

permissions:
  contents: read

concurrency:
  group: harness-\${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  harness:
    name: harness (\${{ matrix.os }}, \${{ matrix.node }})
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [22, 24]
    runs-on: \${{ matrix.os }}
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: \${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npx harness config:check
      - run: npx harness standards coverage --json
      - run: npx harness check --profile quick --full
      - run: npx harness supervise review --base origin/${base} --json
`;
}

export function runCi({ rootDir, args }) {
  const provider = args[1] || 'github';
  if (provider !== 'github') {
    console.error('Usage: harness ci github [--base main] [--write]');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const content = githubWorkflow({ base: getArg(args, '--base') || 'main' });
  const path = resolve(rootDir, '.github', 'workflows', 'harness.yml');
  if (hasArg(args, '--write')) {
    const changed = !existsSync(path) || readFileSync(path, 'utf-8') !== content;
    atomicWriteText(path, content);
    console.log(`${changed ? '✅' : '○'} ${changed ? 'Wrote' : 'Unchanged'} .github/workflows/harness.yml`);
    console.log('Required-check candidates (configure branch protection manually):');
    for (const name of GITHUB_CHECK_NAMES) console.log(`  - ${name}`);
  } else {
    console.log(content);
  }
}
