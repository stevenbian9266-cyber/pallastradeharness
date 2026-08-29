import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessAcTest, semanticVerdict, countAssertions, countMockCalls } from './ac-semantic.mjs';

// AC-001: 空断言测试 → empty_assert 拒绝
test('AC-001: 空断言测试判定 empty_assert', () => {
  const src = `
    import { test } from 'node:test';
    test('AC-1: todo 不能直接跳转 done', () => {
      // 没有任何断言
    });
  `;
  const assessment = assessAcTest({ source: src });
  assert.equal(assessment.assertions, 0);
  assert.equal(assessment.emptyAssert, true);
  const verdict = semanticVerdict(assessment);
  assert.equal(verdict.pass, false);
  assert.equal(verdict.reason, 'empty_assert');
});

// AC-001: 含真实断言的测试通过
test('AC-001: 含真实断言的测试通过', () => {
  const src = `
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { canTransition } from '../../src/domain/task-state.js';
    test('AC-003: todo 不能直接跳转 done', () => {
      assert.equal(canTransition('todo', 'done'), false);
    });
    test('todo → in_progress 允许', () => {
      assert.equal(canTransition('todo', 'in_progress'), true);
    });
  `;
  const assessment = assessAcTest({ source: src });
  assert.equal(assessment.assertions >= 2, true);
  assert.equal(assessment.emptyAssert, false);
  const verdict = semanticVerdict(assessment);
  assert.equal(verdict.pass, true);
});

// AC-002: 全 mock → over_mocked 拒绝
test('AC-002: 全 mock 判定 over_mocked', () => {
  const src = `
    import { vi } from 'vitest';
    const svc = vi.fn();
    vi.mock('../../src/services/task-service.js', () => ({ updateTaskStatus: vi.fn() }));
    test('AC-4: 越权返回 403', () => {
      const result = svc();
      expect(result).toBe(undefined);
    });
  `;
  const assessment = assessAcTest({ source: src });
  assert.equal(assessment.mocks >= 2, true);
  assert.equal(assessment.overMocked, true);
  const verdict = semanticVerdict(assessment);
  assert.equal(verdict.pass, false);
  assert.equal(verdict.reason, 'over_mocked');
});

// AC-002: 有断言且 mock 少于断言 → 通过
test('AC-002: mock 少于断言不判定过度', () => {
  const src = `
    import { vi } from 'vitest';
    const repo = vi.fn();
    repo.mockResolvedValue({ id: 't1', status: 'todo' });
    test('状态流转', async () => {
      const task = await repo();
      expect(task.id).toBe('t1');
      expect(task.status).toBe('todo');
    });
  `;
  const assessment = assessAcTest({ source: src });
  assert.equal(assessment.overMocked, false);
  assert.equal(semanticVerdict(assessment).pass, true);
});

// only_happy_path 仅提示不阻断
test('仅 happy path 返回 advisory 不阻断', () => {
  const src = `
    test('正常流', () => {
      assert.equal(add(1, 2), 3);
    });
  `;
  const assessment = assessAcTest({ source: src });
  assert.equal(assessment.onlyHappyPath, true);
  const verdict = semanticVerdict(assessment);
  assert.equal(verdict.pass, true);
  assert.notEqual(verdict.advisory, null);
});

// 计数函数
test('countAssertions / countMockCalls 统计', () => {
  const src = `assert.equal(a, b); expect(c).toBe(1); vi.mock('x'); mockReset();`;
  // assert.equal( → 1；expect( → 1；.toBe( → 1 = 3 个断言信号
  assert.equal(countAssertions(src), 3);
  // vi.mock( 命中 \bmock...\( 与 \bvi\.mock\b 两条；mockReset( 再 +1 = 3
  assert.equal(countMockCalls(src), 3);
});
