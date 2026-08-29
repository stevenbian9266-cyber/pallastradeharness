# PRD-20260829-other-存量项目质量基线与no_regression门禁-14-5

| 元数据 | 值 |
|---|---|
| 状态 | approved |
| 创建日期 | 2026-08-29 |
| 来源 | 新增：存量项目质量基线与no_regression门禁（§14.5） |
| 分类 | other（引擎仓 self-dogfood 功能） |
| 需求类型 | 新功能（设计文档 §13 / §14.5 基线可信度与增量门禁） |

> 对应设计文档：`harness持续治理机制设计(1).md` **§14.5 提高基线可信度** + **§13.4 存量项目的质量基线与增量门禁**（历史问题记录不阻断、新增问题必须修复、不新增问题 = no_regression）。

## 1. 背景与目标

- **背景**：存量项目接入时往往已有测试失败/lint 问题。当前机制没有"基线"概念，无法区分"历史已有"与"本次新增"——要么一刀切全阻断（接入即失败），要么全放行（无法防新增）。
- **目标**：实现质量基线（记录当前已知失败）+ no_regression 门禁（只阻断新增失败，历史失败仅记录）。
- **成功指标**：`harness baseline:create` 记录已知失败；`baseline:check` 区分新增/历史/已修复；新增失败 exit 1、历史失败 exit 0；`baseline-gate` 在启用时进 gate。

## 2. 用户故事 / 场景

- 作为 存量项目接入者，我希望先建立基线记录"当前已有哪些失败"，以便后续"不新增问题"。
- 作为 开发，我希望 `baseline:check` 告诉我"这次是不是引入了新失败"，而不是把历史失败也算我头上。
- 场景：正常（无新增失败 → 通过）、边界（历史失败仍存在 → 记录不阻断）、异常（新增失败 → 阻断 exit 1）。

## 3. 功能需求（FR）

- FR-001：新增 `bin/baseline.mjs`：`parseTapFailures`（解析 `node --test --test-reporter=tap` 的失败测试：name + location 文件）、`createBaseline`（运行测试命令 → 记录失败集合 + 仓库/worktree/head 指纹 → 存 `.harness-state/baseline/baseline.json`）、`checkBaseline`（重跑 → 对比出 新增/历史/已修复）、`runTestCommand`。
- FR-002：CLI `harness baseline:create|check|status`。
- FR-003：`config.qualityBaseline`（enabled / testCommand）；启用时 gate 自动加 `baseline-gate`（verification），由 `baseline` 验证器证据自动满足。
- FR-004：`baseline` 注册为受信验证器（`npx harness baseline:check`）。
- FR-005：check 语义：`new_failures`（阻断 exit 1）/ `existing_failures`（exit 0，记录）/ `passed` / `no_baseline`（exit 0 提示先 create）。

## 4. 非功能需求（NFR）

- 向后兼容：未配置 qualityBaseline 的项目无新增 gate；baseline:check 无基线时 exit 0。
- 确定性：TAP 解析 + 失败集合对比，可测试。
- 基线只记录失败测试（name@file 键），不记录耗时等易漂移数据。

## 5. 验收标准（AC，与测试一一映射）

- AC-001 ← FR-001：parseTapFailures 从 TAP 输出提取 `not ok` 测试的 name + location。
- AC-002 ← FR-001：createBaseline 运行测试并记录失败集合 + 指纹。
- AC-003 ← FR-001：checkBaseline 对"相同失败"判 existing_failures、对"新增失败"判 new_failures、对"已修复"记录 resolved。
- AC-004 ← FR-005：新增失败 check exit 1；历史失败 exit 0。
- AC-005 ← FR-002：CLI `baseline:create` + `baseline:check --json` 可用。
- AC-006 ← FR-003：enabled 时 gate 含 `baseline-gate`；关闭时不含。

## 6. 技术影响

- 新增：`bin/baseline.mjs`、`bin/baseline.test.mjs`。
- 修改：`bin/harness.mjs`（baseline CLI）、`bin/config-loader.mjs`（qualityBaseline 默认 + baseline 验证器 + baseline-gate）、`bin/evidence.mjs`（baseline-gate 自动满足）。
- 文档：`docs/commands.md`、`docs/getting-started.md`、`README.md`、`CHANGELOG.md`。
- 影响面：`harness affected --base origin/main` 输出。

## 7. 测试计划

- `test`：`node --test bin/baseline.test.mjs` + 全量 `node --test bin/*.test.mjs`。
- AC 映射：AC-001~005 → baseline.test.mjs（临时项目 + 真实 node --test TAP）；AC-006 → config-loader 用例。
- 校验：`prd verify --semantic --id PRD-20260829-other-存量项目质量基线与no_regression门禁-14-5` 对本 PRD 通过。

## 8. 文档同步清单（知识同步门）

- `docs/commands.md`：`baseline:create|check|status`。
- `docs/getting-started.md`：存量接入小节。
- `README.md`：命令表。
- `CHANGELOG.md`：Unreleased。

