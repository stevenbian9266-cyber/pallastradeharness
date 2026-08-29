# PRD-20260828-other-发布前开发测试强化-ac语义校验-任务ac绑定-覆盖率验证器

| 元数据 | 值 |
|---|---|
| 状态 | approved |
| 创建日期 | 2026-08-28 |
| 来源 | 新增：发布前开发测试强化（AC语义校验/任务AC绑定/覆盖率验证器） |
| 分类 | other（引擎仓 self-dogfood 功能） |
| 需求类型 | 新功能（发布前开发与测试治理强化，设计文档 §19） |

> 对应设计文档：`harness持续治理机制设计(1).md` **第十九章 发布前开发与测试监督强化**。

## 1. 背景与目标

- **背景**：引擎（pallastradeharness v1.7.0）已有完整的任务/门禁/证据闭环，但"发布前开发+测试"存在三个确定性缺口：① `prd verify` 只查 AC 标签、查不出"测试是否真的测对"（空断言/全 mock 可过）；② 覆盖率门禁 `harness coverage` 已存在但未注册为受信验证器、未接进 gate；③ 任务与 AC 无双向绑定（`task start` 只有自由文本 `--accept`，无 PRD-AC 链接与完成校验）。
- **目标**：实现设计文档 §19 的 P0 三件套，全部为确定性机器检查。
- **成功指标**：`prd verify --semantic` 能拒绝空断言/全 mock；`task start --ac` 绑定后完成时校验 AC 覆盖；`verify coverage` 产出 typed 证据并自动满足 `coverage-gate`。

## 2. 用户故事 / 场景

- 作为 引擎使用者，我希望 `prd verify --semantic` 能识别"假覆盖"，以便 测试真的验证 AC 判定条件。
- 作为 引擎使用者，我希望 `task start --ac <PRD> AC-x` 绑定任务与 AC，以便 完成时校验"声明的 AC 都有通过测试、PRD 无未认领 AC"。
- 作为 引擎使用者，我希望 `harness verify coverage` 是受信验证器并自动满足 `coverage-gate`，以便 覆盖率门槛真正进 gate（项目声明阈值时）。
- 场景：正常（真实断言通过）、边界（测试无断言）、异常（全 mock、声明不存在的 AC、PRD 有未认领 AC）。

## 3. 功能需求（FR）

- FR-001：`harness prd verify --semantic --id <PRD>` 对每项 AC 的测试文件做断言有效性评估（空断言 / 过度 mock / 仅 happy path 提示），不满足则 exit 1。
- FR-002：`task start --ac <PRD-ID> AC-1,AC-2` 绑定任务；若 PRD 不存在或 AC 不在 PRD 中，阻止开始。
- FR-003：`task finish` 时对绑定了 PRD 的任务校验：声明的 AC 全部有对应测试文件；PRD 中无未认领 AC；不满足则阻止完成。
- FR-004：`coverage` 注册为默认受信验证器（`harness verify coverage` 产出 typed test 证据）。
- FR-005：项目声明 `coverage.thresholds` 非空时，gate 自动包含 `coverage-gate`（verification）；关闭 gate 时若有新鲜的 coverage 验证器证据则自动满足。

## 4. 非功能需求（NFR）

- 向后兼容：不带 `--semantic` 的 `prd verify`、不带 `--ac` 的 `task start` 行为不变；未配置覆盖率阈值的项目不新增 gate 检查。
- 确定性：语义校验只依赖静态文本规则（断言/ mock 关键词），可测试、可复现。
- 无新增运行时依赖（视觉回归等依赖浏览器的能力不在本批次）。

## 5. 验收标准（AC，与测试一一映射）

- AC-001 ← FR-001：`ac-semantic.mjs` 对"空断言测试"判定 `empty_assert` 并拒绝。
- AC-002 ← FR-001：`ac-semantic.mjs` 对"全 mock 测试"判定 `over_mocked` 并拒绝；对含真实断言的测试通过。
- AC-003 ← FR-001：`harness prd verify --semantic` 对含空断言的文件输出失败原因并 exit 1。
- AC-004 ← FR-002：`task start --ac <存在的PRD> AC-xxx` 写入 `linkedPrd` + `acceptanceCriteria`。
- AC-005 ← FR-002：`task start --ac <不存在的PRD>` 阻止并报错。
- AC-006 ← FR-003：`task finish` 对 AC 无测试覆盖的绑定任务阻止完成。
- AC-007 ← FR-004：`verify coverage` 执行 `node bin/harness.mjs coverage --enforce` 并产出 `verifierId: coverage` 的 test 证据。
- AC-008 ← FR-005：配置了覆盖率阈值的项目，`gate` 输出包含 `coverage-gate`；`evidence verify` 时若有 coverage 证据则自动满足。

## 6. 技术影响

- 新增模块：`bin/ac-semantic.mjs`（断言语义评估）、`bin/ac-trace.mjs`（AC 解析与测试追溯）。
- 修改：`bin/harness.mjs`（prd verify --semantic）、`bin/task-orchestrator.mjs`（--ac 绑定 + finish 校验）、`bin/config-loader.mjs`（coverage 验证器 + coverage-gate）、`bin/evidence.mjs`（coverage-gate 自动满足）。
- 新增测试：`bin/ac-semantic.test.mjs`、`bin/ac-trace.test.mjs`。
- 文档：`docs/commands.md`、`docs/getting-started.md`、`README.md` 命令表。
- 影响面：`harness affected --base origin/main` 输出。

## 7. 测试计划

- `test`：`node --test bin/ac-semantic.test.mjs bin/ac-trace.test.mjs` + 全量 `node --test bin/*.test.mjs`。
- AC 映射：AC-001~003 → `ac-semantic.test.mjs` / prd verify 集成；AC-004~006 → `task-orchestrator` 相关用例；AC-007~008 → config-loader / evidence 用例。
- 校验：`prd verify --semantic --id PRD-20260828-other-...` 对本 PRD 自身通过。

## 8. 文档同步清单（知识同步门）

- `docs/commands.md`：`prd verify --semantic`、`task start --ac`、`verify coverage`、`coverage-gate`。
- `docs/getting-started.md`：生命周期示例补 `--ac` 与语义校验。
- `README.md`：命令表同步。

