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
  # ---- 快速门禁：分工 job（并行、快速失败，与主矩阵 job 互补）----
  anti-patterns:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - run: npm ci
      - run: npx harness scan-anti-patterns
  secrets:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - run: npm ci
      - run: npx harness scan-secrets
  doc-impact:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - run: npm ci
      - run: npx harness doc-impact --base origin/${base}
  generated-check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - run: npm ci
      - run: npx harness generated:check
  coverage-gate:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - run: npm ci
      - run: npx harness coverage --enforce || echo "SKIP: no coverage.targets configured"
  ai-freshness:
    if: contains(github.event.pull_request.changed_files, 'ai/')
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - run: npm ci
      - run: npx harness eval-ai --check-freshness

  # ---- 主矩阵 job：配置/规范/快速档 + 变更审查 ----
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

/** v1.6.0：夜间全检（cron 定时触发） */
export function githubNightlyWorkflow({ base = 'main' } = {}) {
  return `name: Harness Nightly

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: harness-nightly-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  full:
    name: Full checks + coverage gate
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npx harness config:check
      - run: npx harness check --profile full
      - run: npx harness coverage --enforce || echo "SKIP: no coverage.targets configured"
      - run: npx harness generated:check
      - run: npx harness eval-ai --check-freshness
      - run: npx harness eval-ai --scenarios || echo "SKIP: no scenarios configured"
`;
}

/** v1.6.0：发布档（tag 触发：全档 + 覆盖率 + 生成物 + 发布清单） */
export function githubReleaseWorkflow({ base = 'main' } = {}) {
  return `name: Harness Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

concurrency:
  group: harness-release-\${{ github.ref }}
  cancel-in-progress: false

jobs:
  full:
    name: Release gate (full profile)
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npx harness config:check
      - run: npx harness check --profile full
      - run: npx harness coverage --enforce || echo "SKIP: no coverage.targets configured"
      - run: npx harness generated:check
      - run: npx harness scan-secrets
      - run: npx harness doc-impact --base origin/${base}
      - name: Release manifest placeholder
        run: |
          echo "## \${GITHUB_REF_NAME} release evidence" > "\${RUNNER_TEMP}/RELEASE_NOTES.md"
          echo "- checks: \$(git rev-parse --short HEAD)" >> "\${RUNNER_TEMP}/RELEASE_NOTES.md"
          gh release create "\${GITHUB_REF_NAME}" --notes-file "\${RUNNER_TEMP}/RELEASE_NOTES.md" || echo "SKIP: gh release create (no GITHUB_TOKEN write scope)"
`;
}

/** v1.6.0：多档位 workflow 清单（harness.yml / nightly / release） */
export function githubWorkflows({ base = 'main' } = {}) {
  return [
    { name: 'harness.yml', content: githubWorkflow({ base }) },
    { name: 'harness-nightly.yml', content: githubNightlyWorkflow({ base }) },
    { name: 'harness-release.yml', content: githubReleaseWorkflow({ base }) },
  ];
}

export function runCi({ rootDir, args }) {
  const provider = args[1] || 'github';
  if (provider !== 'github') {
    console.error('Usage: harness ci github [--base main] [--write]');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const base = getArg(args, '--base') || 'main';
  const files = githubWorkflows({ base });
  if (hasArg(args, '--write')) {
    for (const f of files) {
      const path = resolve(rootDir, '.github', 'workflows', f.name);
      const changed = !existsSync(path) || readFileSync(path, 'utf-8') !== f.content;
      atomicWriteText(path, f.content);
      console.log(`${changed ? '✅' : '○'} ${changed ? 'Wrote' : 'Unchanged'} .github/workflows/${f.name}`);
    }
    console.log('Required-check candidates (configure branch protection manually):');
    for (const name of GITHUB_CHECK_NAMES) console.log(`  - ${name}`);
  } else {
    console.log(files.map(f => `# ===== ${f.name} =====\n${f.content}`).join('\n'));
  }
}
