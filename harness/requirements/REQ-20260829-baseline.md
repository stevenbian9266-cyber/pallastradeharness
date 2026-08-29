# 需求文档 REQ-20260829-baseline.md

> 对应 PRD：`docs/prd/other/PRD-20260829-other-存量项目质量基线与no_regression门禁-14-5.md`
> Task: TASK-20260829003913-64d99808 / Gate: GATE-2026-08-29T00-39-19
> 对应设计文档：`harness持续治理机制设计(1).md` §13.4 / §14.5

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | coverage-gate, verifier, gate check | `bin/harness.mjs`（coverage/visual/governance CLI 接线 + 冒号子命令套路）、`bin/config-loader.mjs`（verifiers + getGateChecks 条件检查范式）、`bin/evidence.mjs`（completeVerificationGate coverage/visual 自动满足范式）、`bin/state-store.mjs`（statePaths/repositoryIdentity） | ✅ 全部复用点已定位 |
| presets | `presets/` | — | 框架预设 | 不涉及 |
| templates | `templates/` | — | — | 不涉及 |
| rules | `rules/` | — | — | 不涉及 |
| docs | `docs/` | commands, getting-started | `docs/commands.md`、`docs/getting-started.md` | ⚠️ 需同步 |
| 根 | `CHANGELOG.md` | Unreleased | 已有 §15/§17/§18/§19 记录 | ⚠️ 需追加 |

### 搜索结论

- Node v24 无内置 `json` test reporter（会 ERR_MODULE_NOT_FOUND）→ 用 **TAP** reporter（`node --test --test-reporter=tap`），解析 `not ok` + `location:` 字段。
- `coverage-gate`/`visual-regression` 的"配置启用→gate 加检查→验证器证据自动满足"范式可直接复用于 `baseline-gate`。
- 基线存 `.harness-state/baseline/baseline.json`（复用 statePaths）。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 工作流：一句话 → PRD → 用户确认 → gate → 实施 → AC↔测试映射 → 知识同步 |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 代码变更后同步知识文档；更新后跑 `docs:check` |
| `skills/harness-skill-author/SKILL.md` | ✅ 已读（引擎仓无业务定制冲突） | 产出机器可读、可审计 |

---

## 需求标题

存量项目质量基线 + no_regression 门禁（设计文档 §13.4 / §14.5）。

## 任务类型

功能优化（引擎仓 self-dogfood：补齐最后一块——存量项目"不新增问题"策略）。

## 需求描述

1. **`bin/baseline.mjs`**：`parseTapFailures`（TAP 失败测试解析）；`createBaseline`（运行测试记录失败 + 指纹）；`checkBaseline`（新增/历史/已修复 三态对比）；`runTestCommand`（TAP reporter）。
2. **CLI**：`harness baseline:create|check|status`。
3. **配置与门禁**：`config.qualityBaseline`（enabled/testCommand）；`baseline` 验证器（`npx harness baseline:check`）；enabled 时 gate 加 `baseline-gate`（verification），由 baseline 验证器证据自动满足。
4. **测试**：`bin/baseline.test.mjs`（TAP 解析/create/check 三态/CLI）；全量 `node --test`。
5. **知识同步**：commands / getting-started / README / CHANGELOG。

## 技术方案（初步）

- 失败测试键：`name@location-file`；基线存 `.harness-state/baseline/baseline.json`。
- check 语义：新增失败 → exit 1（no_regression 阻断）；历史失败仍存在 → exit 0（记录）；无基线 → exit 0 提示。
- Node v24 用 `--test-reporter=tap`（无 json 内置 reporter）。
