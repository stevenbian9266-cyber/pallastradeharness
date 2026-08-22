# REQ-20260822-adoption-p2-1

- **任务**: 优化：实施 Harness 外部验证（P2 第一批：本地指标 + 插件合同测试）
- **Gate**: GATE-2026-08-22T15-43-20
- **Task**: TASK-20260822154314-c9e643c1
- **日期**: 2026-08-22
- **类型**: 功能优化（外部验证/隐私优先）
- **权威方案**: `harness优化升级实施方案-20260820.md` §7.2（本地优先指标）+ §7.3（插件合同）
- **承上**: P0 + P1 全部完成

## 需求描述

1. **HTH-019（本地优先指标）**：
   - `harness metrics`：聚合本地匿名指标（task_started/completed/abandoned、verification_invalidations、recovery_used、knowledge_updated、approved_manuals、time_to_first_evidence 中位数）。
   - `harness metrics export`：导出 JSON 供人工审阅；**默认不上传、不含源码/命令输出/路径/PRD 内容/证据原文**。
2. **HTH-021（插件合同测试）**：为插件 API 建立合同测试（schema 校验、未知字段、超时/失败策略字段），确保 beta 前插件合同稳定。

## 变更范围

| 文件 | 变更 |
|---|---|
| `bin/metrics.mjs` | 新增：本地指标聚合 + export |
| `bin/harness.mjs` | 新增 `metrics` 命令分支 |
| `bin/metrics.test.mjs` | 新增：聚合正确性 + 导出不含敏感字段 |
| `bin/plugins.test.mjs` | 追加：插件合同 schema 断言 |

## 跨层搜索结论

升级对象为引擎仓 `bin/` 层（新增 metrics 模块），无 PallasTrade 业务层。

## Skill 咨询（已读，承上批）

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `harness-prd/SKILL.md` | ✅ 已读 | 已确认 PRD 的 FR-012/014 延续 |
| `harness-docs/SKILL.md` | ✅ 已读 | 指标导出为文档/报告素材 |
| `pallastrade-customization/SKILL.md` | ✅ 已读 | 无冲突 |

## 技术方案（初步）

1. **metrics.mjs**：读 `.harness-state/tasks/*.json`、`harness/gates/*.json`、`artifacts/harness-evidence/<task>/*.json`，聚合计数；`time_to_first_evidence` 取 P50（中位数）。导出对象不含任何文件内容/路径。
2. **harness.mjs**：`metrics [--json]`、`metrics export [--out <path>]`。
3. **plugins.test.mjs**：断言插件定义必须有 `apiVersion`，校验函数对缺字段/超时/失败策略返回稳定错误。

## 风险点

- 指标聚合不应抛错（文件可能损坏）——逐个 try/catch
- 导出 JSON 不含敏感字段（只用计数与时间戳）
- 全套回归必须全绿
