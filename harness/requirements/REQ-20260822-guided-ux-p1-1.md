# REQ-20260822-guided-ux-p1-1

- **任务**: 优化：实施 Harness 引导式体验（P1 第一批：do/next 单主路径 + 真 Lite）
- **Gate**: GATE-2026-08-22T15-28-52
- **Task**: TASK-20260822152847-f2b32ff9
- **日期**: 2026-08-22
- **类型**: 功能优化（引导式体验）
- **权威方案**: `harness优化升级实施方案-20260820.md` §6.2（do/next）+ §6.3（风险自适应/Lite）
- **承上**: P0 全部完成；用户已确认 PRD 并授权实施

## 需求描述

1. **HTH-013（`do`/`next` 单主路径）**：
   - `harness next`：分析当前任务与 Gate 状态，输出稳定的 `nextAction`（taskId/phase/blockingReason/nextAction/commands/humanDecisionRequired），用户无需理解 ID 与步骤。
   - `harness do "<需求>"`：发现/创建任务并返回第一个 nextAction。
2. **HTH-014（真 Lite）**：`harness gate --lite` 时跳过 feature 的 PRD 检查（read-skill-prd/create-prd-doc/create-req-doc/req-doc-has-skill-table/user-confirmed），让 Lite 档位名符其实（方案 F-07）。

## 变更范围

| 文件 | 变更 |
|---|---|
| `bin/guide.mjs` | 新增：`nextAction`（状态机）+ `doTask`（引导入口） |
| `bin/harness.mjs` | 新增 `do`/`next` 命令分支；`gate` 支持 `--lite` |
| `bin/guide.test.mjs` | 新增：状态机各阶段测试 |
| `bin/cli-e2e.test.mjs` | 追加：`next` 输出稳定 JSON；`gate --lite` 跳过 PRD checks |
| `docs/getting-started.md` | 追加 `do`/`next` 快速路径 |

## 跨层搜索结论

升级对象为引擎仓 `bin/` 层（guide/harness），无 PallasTrade 业务层。`state-store.listTasks` 为任务发现依赖。

## Skill 咨询（已读，承上批）

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `harness-prd/SKILL.md` | ✅ 已读 | PRD 工作流；Lite 档位不应强制 PRD（方案 F-07） |
| `harness-docs/SKILL.md` | ✅ 已读 | 文档同步；本批同步 getting-started |
| `pallastrade-customization/SKILL.md` | ✅ 已读 | 无冲突 |

## 技术方案（初步）

1. **guide.mjs**：`nextAction({ rootDir, config })` 状态机——no-task → no-gate → preparation → verification → finish；每个阶段返回 `{ phase, taskId, gateId, blockingReason, nextAction, commands[], humanDecisionRequired }`。
2. **doTask**：复用 `nextAction`；有活动 task 直接引导，无则提示 `task start` 命令（完整自动编排后续增强）。
3. **gate --lite**：`getGateChecks` 结果过滤掉 PRD 检查 id 集合。
4. 测试：各阶段 next 输出正确；--lite 的 gate 无 PRD checks；稳定 JSON 可机器解析。

## 风险点

- `next` 的 phase 判定依赖 gate 状态文件结构（taskId/checks/cleared）——保持与 gate-lifecycle 一致
- --lite 过滤不应影响 Standard/Critical 的 PRD 检查
- 全套回归必须全绿
