import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze } from './suggest.mjs';

/**
 * 构造一个带 gate 履历的临时项目。
 * @param {object} opts
 * @param {boolean} opts.withPrdChecks 配置是否已启用 PRD 工作流 check
 * @param {number} opts.gateCount gate 总数
 * @param {number} opts.featureCount 其中 feature 类 gate 数
 */
function makeProject({ withPrdChecks = false, gateCount = 6, featureCount = 4 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'suggest-test-'));
  const gatesDir = join(root, 'harness', 'gates');
  mkdirSync(gatesDir, { recursive: true });
  for (let i = 0; i < gateCount; i++) {
    const taskType = i < featureCount ? 'feature' : 'bugfix';
    writeFileSync(join(gatesDir, `GATE-${i}.json`), JSON.stringify({
      id: `GATE-${i}`,
      taskType,
      createdAt: new Date().toISOString(),
      checks: [],
    }));
  }
  const config = withPrdChecks
    ? {
        gates: {
          checkDefs: {
            feature: [
              { id: 'read-skill-prd', label: 'x' },
              { id: 'create-prd-doc', label: 'x' },
              { id: 'create-req-doc', label: 'x' },
              { id: 'user-confirmed', label: 'x' },
            ],
          },
        },
      }
    : { gates: { checkDefs: { feature: [] } } };
  return { root, config };
}

test('suggest: PRD checks enabled → no tier-up suggestion (regression: PallasTrade false positive)', () => {
  const { root, config } = makeProject({ withPrdChecks: true });
  const { suggestions } = analyze(root, config);
  const tier = suggestions.find(s => s.kind === 'tier');
  assert.ok(!tier, '配置已含 PRD check 时不应再建议升级档位');
});

test('suggest: no PRD checks + enough feature gates → tier-up suggestion', () => {
  const { root, config } = makeProject({ withPrdChecks: false });
  const { suggestions } = analyze(root, config);
  const tier = suggestions.find(s => s.kind === 'tier');
  assert.ok(tier, '配置缺失 PRD 工作流时应建议启用 PRD');
  assert.match(tier.action, /PRD/, '建议动作应提及 PRD 工作流');
});

test('suggest: too few gates → no tier suggestion', () => {
  const { root, config } = makeProject({ gateCount: 2, featureCount: 2 });
  const { suggestions } = analyze(root, config);
  assert.ok(!suggestions.some(s => s.kind === 'tier'), 'gate 数不足 5 不应建议档位');
});
