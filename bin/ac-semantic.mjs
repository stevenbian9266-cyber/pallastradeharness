/**
 * ac-semantic.mjs — AC↔测试语义校验（设计文档 §19.2）
 *
 * 从"有测试"升级为"测对了"：对 AC 对应的测试文件做静态断言评估，
 * 识别"空断言 / 过度 mock / 仅 happy path"三类假覆盖。
 *
 * 本模块只做纯文本静态评估（无 git 依赖），可独立单元测试；
 * 测试文件追溯（git grep）见 ./ac-trace.mjs。
 */

// 常见断言 API（node:assert / chai / vitest / jest）
export const ASSERTION_PATTERNS = Object.freeze([
  /\bassert(?:\.\w+)?\(/,
  /expect\s*\(/,
  /\.to(?:Be|Equal|Have|Contain|Throw|Match|Resolve|Reject|Satisfy|Include|BeNull|BeTrue|BeFalse)\b/,
  /\bstrictEqual|deepEqual|notEqual|notDeepEqual|deepStrictEqual|notStrictEqual\s*\(/,
  /\bok\s*\(/,
  /\bthrows\s*\(/,
  /\bassert\.(?:isTrue|isFalse|isNull|isNotNull|isUndefined|isDefined)\b/,
]);

// 过度 mock 信号（vitest / jest / sinon）
export const OVER_MOCK_PATTERNS = Object.freeze([
  /\bmock(?:All|Reset|Restore|Clear|Unmock)?\s*\(/,
  /\bvi\.mock\b/,
  /\bstub\s*\(/,
]);

// 边界/异常信号（用于 only_happy_path 提示，非阻断）
export const EDGE_CASE_PATTERNS = Object.freeze([
  /error|invalid|empty|reject|throws|throw|fail|forbidden|unauthorized|401|403|404|409|500/i,
  /边界|异常|失败|空|错误|无权限|非法|超时|回滚/i,
]);

function countMatches(text, patterns) {
  let n = 0;
  for (const re of patterns) {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    n += (String(text).match(global) || []).length;
  }
  return n;
}

export function countAssertions(source) {
  return countMatches(source, ASSERTION_PATTERNS);
}

export function countMockCalls(source) {
  return countMatches(source, OVER_MOCK_PATTERNS);
}

/**
 * 评估单个测试文件的 AC 语义质量。
 * @param {{ source: string }} input
 * @returns {{ assertions:number, mocks:number, emptyAssert:boolean, overMocked:boolean, onlyHappyPath:boolean }}
 */
export function assessAcTest({ source }) {
  const text = String(source || '');
  const assertions = countAssertions(text);
  const mocks = countMockCalls(text);
  const emptyAssert = assertions === 0;
  // 启发式：mock 调用数 ≥ 断言数，且断言数很少 → 判定过度 mock（被测逻辑可能被整体替身化）
  const overMocked = mocks > 0 && assertions <= mocks;
  // 仅 happy path 提示：有断言但完全不含边界/异常信号
  const onlyHappyPath = assertions > 0 && !EDGE_CASE_PATTERNS.some(re => re.test(text));
  return { assertions, mocks, emptyAssert, overMocked, onlyHappyPath };
}

/**
 * 语义判定：是否满足"测对了"。
 * @param {{ emptyAssert:boolean, overMocked:boolean }} assessment
 * @returns {{ pass:boolean, reason:string|null, advisory:string|null }}
 */
export function semanticVerdict(assessment) {
  if (assessment.emptyAssert) return { pass: false, reason: 'empty_assert', advisory: '测试文件没有断言，无法证明 AC 判定条件' };
  if (assessment.overMocked) return { pass: false, reason: 'over_mocked', advisory: 'mock 调用 ≥ 断言数，被测逻辑可能被整体替身化' };
  if (assessment.onlyHappyPath) return { pass: true, reason: null, advisory: '仅覆盖正常流（无边界/异常信号），若 AC 只定义正常流可忽略' };
  return { pass: true, reason: null, advisory: null };
}
