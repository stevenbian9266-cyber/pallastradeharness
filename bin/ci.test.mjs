import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GITHUB_CHECK_NAMES, githubWorkflow, githubNightlyWorkflow, githubReleaseWorkflow, githubWorkflows } from './ci.mjs';

test('GitHub workflow is deterministic and covers the supported OS/Node matrix', () => {
  const workflow = githubWorkflow({ base: 'dev' });
  assert.match(workflow, /branches: \[dev\]/);
  assert.match(workflow, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(workflow, /node: \[22, 24\]/);
  assert.match(workflow, /harness supervise review --base origin\/dev --json/);
  assert.equal(GITHUB_CHECK_NAMES.length, 6);
});

// ── v1.6.0：多档位 CI ──────────────────────────────────────
test('v1.6.0: githubWorkflows 返回三档位（main/nightly/release）', () => {
  const files = githubWorkflows({ base: 'dev' });
  assert.equal(files.length, 3);
  const names = files.map(f => f.name);
  assert.ok(names.includes('harness.yml'), '应含 harness.yml');
  assert.ok(names.includes('harness-nightly.yml'), '应含 harness-nightly.yml');
  assert.ok(names.includes('harness-release.yml'), '应含 harness-release.yml');
});

test('v1.6.0: harness.yml 含分工 job（anti-patterns/secrets/doc-impact/coverage-gate）', () => {
  const main = githubWorkflow({ base: 'dev' });
  assert.match(main, /scan-anti-patterns/, '应含反模式扫描 job');
  assert.match(main, /scan-secrets/, '应含密钥扫描 job');
  assert.match(main, /doc-impact --base origin\/dev/, '应含 doc-impact job');
  assert.match(main, /generated:check/, '应含生成物漂移 job');
  assert.match(main, /coverage --enforce/, '应含覆盖率门禁 job');
});

test('v1.6.0: nightly 含 cron 定时 + full 档 + coverage 门禁', () => {
  const nightly = githubNightlyWorkflow();
  assert.match(nightly, /schedule:/, '应含 schedule');
  assert.match(nightly, /cron: '0 0 \* \* \*'/, '应含每日 cron');
  assert.match(nightly, /workflow_dispatch:/, '应支持手动触发');
  assert.match(nightly, /check --profile full/, '应跑 full 档');
  assert.match(nightly, /coverage --enforce/, '应含覆盖率门禁');
  assert.match(nightly, /eval-ai --scenarios/, '应含场景评估');
});

test('v1.6.0: release 含 tag 触发 + 全档 + 发布清单占位', () => {
  const release = githubReleaseWorkflow();
  assert.match(release, /push:/, '应含 push 触发');
  assert.match(release, /tags:/, '应含 tags 触发');
  assert.match(release, /'v\*'/, '应匹配 v* tag');
  assert.match(release, /check --profile full/, '应跑 full 档');
  assert.match(release, /gh release create/, '应含发布清单创建');
});
