# 需求文档 REQ-20260828-pre-release-hardening.md

> 对应 PRD：`docs/prd/other/PRD-20260828-other-发布前开发测试强化-ac语义校验-任务ac绑定-覆盖率验证器.md`
> Task: TASK-20260828143754-f1907210 / Gate: GATE-2026-08-28T14-37-58
> 对应设计文档：`harness持续治理机制设计(1).md` 第十九章（§19.2 / §19.3 / §19.4）

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | prd verify, task start, coverage, verifier, gate check | `bin/harness.mjs`（prd verify / coverage / task 分发）、`bin/task-orchestrator.mjs`（startTask/finishCommand）、`bin/config-loader.mjs`（verifiers/getGateChecks）、`bin/evidence.mjs`（completeVerificationGate）、`bin/coverage.mjs`（coverage gate 命令） | ✅ 全部复用点已定位 |
| presets | `presets/` | — | `presets/`（框架预设） | 不涉及（引擎仓） |
| templates | `templates/` | prd | `templates/prd/_TEMPLATE.md` | ✅ PRD 模板已按 §19 扩充 |
| rules | `rules/` | — | `rules/` 通用规则基线 | 不涉及 |
| docs | `docs/` | commands, getting-started | `docs/commands.md`、`docs/getting-started.md` | ⚠️ 需同步新命令 |
| 根 | `README.md` | 命令表 | README 命令/功能表 | ⚠️ 需同步 |
| 根 | `harness.config.mjs` | coverage | `coverage: { thresholds: {}, targets: [] }` | ⚠️ 本仓阈值为空 → coverage-gate 不启用（dogfood 不受影响） |

### 搜索结论

- `prd verify` 现有逻辑在 `bin/harness.mjs`（AC 解析 + git grep 测试追溯）；`--semantic` 需读取测试文件做断言评估。
- `startTask` 已支持 `acceptanceCriteria`（`--accept` 自由文本），缺 PRD 链接与存在性校验。
- `finishCommand` 走 `verificationProvider`（evidence verifyTaskEvidence），可在其通过后再做 AC 追溯校验。
- `config-loader` 默认 verifiers 只有 `unit`/`docs`；`getGateChecks` 组装 checks（BASE_VERIFY_CHECK 为 verification 阶段）。
- `evidence.completeVerificationGate` 只把 `verify-test` 置 done；需扩展为可自动满足 `coverage-gate`。
- `coverage.mjs` 在无 targets 时 exit 0（`components=[]`）→ 空阈值项目 `verify coverage` 安全通过。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 工作流：一句话需求 → PRD → 用户确认 → gate → 实施 → 验收（AC↔测试映射，`prd verify`）→ 知识同步 |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 代码变更后同步知识文档；更新后跑 `docs:check` |
| `skills/harness-skill-author/SKILL.md` | ✅ 已读（引擎仓无业务定制冲突） | 产出机器可读、可审计 |

---

## 需求标题

发布前开发与测试监督强化（P0）：AC 语义校验 / 任务↔AC 绑定 / 覆盖率验证器接线。

## 任务类型

功能优化（引擎仓 self-dogfood：补齐设计文档 §19 三个确定性缺口）。

## 需求描述

1. **`prd verify --semantic`**（§19.2）：新增 `bin/ac-semantic.mjs` 纯函数模块（断言/过度 mock/happy path 静态评估）；`prd verify` 增加 `--semantic` 模式，对每项 AC 的测试文件评估，空断言或过度 mock 判定不满足并 exit 1。
2. **`task start --ac` + 完成校验**（§19.4）：新增 `bin/ac-trace.mjs`（PRD AC 解析、测试文件追溯、未认领 AC 检查）；`task start --ac <PRD> AC-1,AC-2` 校验 PRD 存在性与 AC 合法性后写入 `linkedPrd`/`acceptanceCriteria`；`task finish` 对绑定任务校验 AC 覆盖与未认领 AC。
3. **覆盖率验证器与 coverage-gate**（§19.3）：`config-loader` 默认注册 `coverage` 验证器（`node bin/harness.mjs coverage --enforce`）；`getGateChecks` 在项目声明阈值时追加 `coverage-gate`（verification）；`evidence.completeVerificationGate` 在有新鲜 coverage 验证器证据时自动满足 `coverage-gate`。
4. **测试**：`bin/ac-semantic.test.mjs`、`bin/ac-trace.test.mjs`；全量 `node --test`。
5. **知识同步**：`docs/commands.md`、`docs/getting-started.md`、`README.md` 命令表。

## 技术方案（初步）

- 新模块 `bin/ac-semantic.mjs` / `bin/ac-trace.mjs`：纯 Node fs / git 调用，无第三方依赖；复用 `cli-utils.mjs` EXIT_CODES、`contracts.mjs` 契约。
- `task-orchestrator.mjs`：`startTask` 增加 `linkedPrd` 校验；`finishCommand` 增加 AC 追溯门禁（policy failure 阻止）。
- `config-loader.mjs`：verifiers 增加 `coverage`；`getGateChecks` 条件追加 `coverage-gate`。
- `evidence.mjs`：`completeVerificationGate` 自动满足 coverage-gate。
