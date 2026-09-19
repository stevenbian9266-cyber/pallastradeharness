/**
 * cloud-policy.mjs — Cloud 治理策略（Batch D / D13）
 *
 * 指令 TASK-D13：Cloud 恒为严格治理（`strictGovernance = true`），且**不得回退**到 Local
 * 的 legacy auto-transition 行为。
 *   - 本模块为纯逻辑（无 IO、无 fs），供装配层（fail-fast）与命令层（纵深防御）共用；
 *   - 配置键与 Local `bin/fact-gates.mjs#strictGovernanceEnabled` 保持一致
 *     （`strictGovernance` / `governance.strictGovernance`），但语义**相反地更严**：
 *     Local 缺省非严格，Cloud 缺省即严格；显式关闭在 Cloud 属非法配置。
 */

/** Cloud 恒为严格治理（冻结常量，单一来源）。 */
export const CLOUD_STRICT_GOVERNANCE = true;

/** Cloud 上尝试关闭 strict 的配置键位置（与 Local 对齐）。 */
export function strictFlagDisabled(config) {
  if (config?.strictGovernance === false) return true;
  return config?.governance?.strictGovernance === false;
}

/**
 * Cloud strict 策略（结论不随配置变化）。
 * @returns {{strictGovernance: true, disabledByConfig: boolean, enforcedBy: 'cloud'}}
 */
export function cloudStrictPolicy(config) {
  return { strictGovernance: CLOUD_STRICT_GOVERNANCE, disabledByConfig: strictFlagDisabled(config), enforcedBy: 'cloud' };
}

/**
 * 装配期守卫：显式关闭 strict 的配置直接拒绝启动（fail-fast，不产出半严格运行时）。
 * @throws {TypeError} 当配置显式关闭 strict 时
 */
export function assertCloudStrictGovernance(config) {
  const policy = cloudStrictPolicy(config);
  if (policy.disabledByConfig) {
    throw new TypeError(
      'cloud runtime enforces strict governance: remove strictGovernance=false '
      + '(strict governance cannot be disabled in the cloud runtime)',
    );
  }
  return policy;
}
