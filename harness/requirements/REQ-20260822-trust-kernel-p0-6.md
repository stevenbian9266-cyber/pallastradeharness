# REQ-20260822-trust-kernel-p0-6

- **任务**: 优化：实施 Harness 可信化升级（P0 第六批：可执行文档修复）
- **Gate**: GATE-2026-08-22T15-11-12
- **Task**: TASK-20260822151104-bbe1b324
- **日期**: 2026-08-22
- **类型**: 功能优化（文档一致性）
- **权威方案**: `harness优化升级实施方案-20260820.md` §5.6（P0-6 可执行文档与版本一致性）
- **承上**: REQ-20260822-trust-kernel-p0-1~5 完成；用户已确认 PRD 并授权 P0 分批实施

## 需求描述

HTH-011（F-06）：修复过时文档示例并建立自动化防漂移检查：

1. **getting-started.md**：快速开始改为 task-bound 生命周期（`task start` → `brain context` → `risk check` → `gate --task-id` → `verify` → `evidence verify` → `task finish`）；删除手工清理 task-bound `verify-test` 的示例（已被 HTH-007 禁止）。
2. **roadmap.md**：修复 1.5.0 与 1.6.0 行拼接错误；追加 1.7.0 可信内核计划行。
3. **docs:check 增强**：扫描 docs/**/*.md 中的过时命令模式（`gate:clear ... verify-test` 手工清理、无 task 的 `gate --task`），命中即报错，防止文档再次漂移。

## 变更范围

| 文件 | 变更 |
|---|---|
| `docs/getting-started.md` | 重写第 4 节为 task-bound 生命周期 |
| `docs/roadmap.md` | 修复版本表拼接；追加 1.7.0 行 |
| `bin/docs-check.mjs` | 增加过时命令模式检查 |
| `bin/docs-check.test.mjs` | 新增：过时模式检测测试 |

## 跨层搜索结论

升级对象为独立仓 `docs/` 与 `bin/docs-check.mjs`，无 PallasTrade 业务层。

## Skill 咨询（已读，承上批）

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `harness-docs/SKILL.md` | ✅ 已读 | 文档同步方法论：更新后 `docs:check` 校验；本批修复 + 防漂移 |
| `harness-prd/SKILL.md` | ✅ 已读 | 已确认 PRD 的 FR-006 延续 |
| `pallastrade-customization/SKILL.md` | ✅ 已读 | 引擎自身修改无冲突 |

## 技术方案（初步）

1. **getting-started.md**：用 HTH-003~007 落地的真实生命周期替换过时示例。
2. **roadmap.md**：拆分拼接行；追加 `1.7.0 | Trust Kernel：ChangeSnapshot/Verifier Registry/Task 强绑定/Node Hook | 🔨 实施中`。
3. **docs-check.mjs**：加 `OUTDATED_PATTERNS`（`gate:clear[^\n]*verify-test`、`gate --task "[^"]*"` 无 task-id 的快速开始上下文），对 docs/**/*.md 扫描，命中返回错误。

## 风险点

- 误报：`gate --task` 合法用法（带 --task-id）不应触发 → 只匹配明确过时模式
- docs:check 现有测试需保持通过
