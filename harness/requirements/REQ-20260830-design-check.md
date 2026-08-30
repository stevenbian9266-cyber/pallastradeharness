# 需求文档 REQ-20260830-design-check.md

> 对应 PRD：`docs/prd/other/PRD-20260830-other-设计检查机器校验-design-check.md`
> Task: TASK-20260830144441-f92f27de / Gate: GATE-2026-08-30T14-44-47
> 对应设计文档：`harness持续治理机制设计(1).md` §十九·补 19A.4

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | gate:clear, parseReuseMatrix, 冒号子命令, POLICY_FAILURE | `bin/harness.mjs`（gate:clear 实现 + verify-test 拦截范式 + 冒号分发套路）、`bin/reuse-adherence.mjs`（parseReuseMatrix 导出）、`bin/cli-utils.mjs`（getArg/hasArg）、`bin/design-scan.mjs`（design: 分发） | ✅ 全部复用点已定位 |
| templates | `templates/designs/` | tech-design | `templates/designs/tech-design.md`（Part A/B 标题格式） | ✅ 校验规则以模板格式为准 |
| docs | `docs/` | commands, getting-started | `docs/commands.md`、`docs/getting-started.md` | ⚠️ 需同步 |
| 根 | `CHANGELOG.md` | Unreleased | 已有设计阶段记录 | ⚠️ 需追加 |

### 搜索结论

- `gate:clear` 在 harness.mjs 分支实现，verify-test 已有"证据控制"拦截范式（exit POLICY_FAILURE）——设计检查项拦截复制该范式。
- `parseReuseMatrix` 已从 reuse-adherence.mjs 导出，直接复用判断 Part B 有效行。
- `design:check` 用 `cmd === 'design' || cmd.startsWith('design:')` 套路（已存在 design 分支，增加子命令）。

---

## 需求标题

设计检查机器校验：`design:check` 校验 4 设计文档 + tech-design Part A/B，`gate:clear` 拦截 6 个设计检查项。

## 任务类型

功能优化（引擎仓 self-dogfood：让 §19A.4 的设计 gate 检查项真正机器可校验）。

## 需求描述

1. **`bin/design-check.mjs`**：`checkDesignArtifacts`（4 文档存在性 + Part A 四节 + Part B 矩阵）、`runDesignCheck`（CLI）。
2. **CLI**：`harness design:check [--task <id>] [--json]`，fail>0 exit 1。
3. **gate:clear 拦截**：6 个设计检查项必须通过机器校验才能 clear；design-confirmed 人工。

## 验收标准（AC，与 PRD 一致）

| AC | 描述 | 测试位置 |
|---|---|---|
| AC-001 | checkDesignArtifacts 6 项 pass/fail 判定 | design-check.test |
| AC-002 | CLI design:check 输出 + exit 1 | design-check.test |
| AC-003 | gate:clear 缺失设计产物拒绝 | design-check.test |
| AC-004 | design-confirmed 不受拦截 | design-check.test |
| AC-005 | 无 taskId 扫描全部 | design-check.test |

## 文档同步清单

- `docs/commands.md`、`docs/getting-started.md`、`README.md`、`CHANGELOG.md`。
