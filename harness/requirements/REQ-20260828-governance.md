# 需求文档 REQ-20260828-governance.md

> 对应 PRD：`docs/prd/other/PRD-20260828-other-治理版本与项目画像-15-总前置条件.md`
> Task: TASK-20260828164812-481aae30 / Gate: GATE-2026-08-28T16-48-19
> 对应设计文档：`harness持续治理机制设计(1).md` §15 / §15.9 / §15.10

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | task start, config, state store, CLI | `bin/harness.mjs`（CLI 分发范式）、`bin/config-loader.mjs`（DEFAULT_CONFIG 范式）、`bin/task-orchestrator.mjs`（startTask，可加 governanceVersion）、`bin/state-store.mjs`（atomicWriteJson） | ✅ 全部复用点已定位 |
| presets | `presets/` | — | 框架预设 | 不涉及 |
| templates | `templates/` | — | — | 不涉及 |
| rules | `rules/` | — | — | 不涉及 |
| docs | `docs/` | commands, getting-started | `docs/commands.md`、`docs/getting-started.md` | ⚠️ 需同步 |
| 根 | `harness.config.mjs` | governance | 无 governance 配置节 | ⚠️ 用 DEFAULT_CONFIG 默认即可 |
| 根 | `CHANGELOG.md` | Unreleased | 已有 §18/§19/§17 记录 | ⚠️ 需追加 |

### 搜索结论

- 无任何 project.yaml / governance version 概念（此前 file_search 确认）。
- `startTask` 在 task-orchestrator.mjs，可读 profile 后附加 `governanceVersion`（只读，无 profile 则 null）。
- `config-loader.mjs` DEFAULT_CONFIG 是添加默认配置节的正确位置。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 工作流：一句话 → PRD → 用户确认 → gate → 实施 → AC↔测试映射 → 知识同步 |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 代码变更后同步知识文档；更新后跑 `docs:check` |
| `skills/harness-skill-author/SKILL.md` | ✅ 已读（引擎仓无业务定制冲突） | 产出机器可读、可审计 |

---

## 需求标题

治理版本与项目画像（设计文档 §15 总前置条件）。

## 任务类型

功能优化（引擎仓 self-dogfood：落地 §15 项目画像 + 治理版本锁定）。

## 需求描述

1. **`bin/governance.mjs`**：`validateProfile` / `governanceReady` / `readProfile` / `writeProfile`（`harness/project.yaml`）/ `lockVersion`（`harness/governance/versions/<v>.json` + 回写）/ `listVersions`。
2. **CLI**：`harness governance:init|status|version`（大白话输出）。
3. **任务绑定**：`task start` 在 ready 时写入 `governanceVersion`（§15.9）。
4. **配置**：`config.governance`（profileFile / versionsDir）。
5. **测试**：`bin/governance.test.mjs`（校验/就绪/往返/锁定）；CLI + task 冒烟。
6. **知识同步**：commands / getting-started / README / CHANGELOG。

## 技术方案（初步）

- 纯函数 + JSON 文件存储；profile 在 `harness/project.yaml`，版本快照在 `harness/governance/versions/`。
- 状态机只前进：`lockVersion` 对已存在版本拒绝覆盖。
- `task start` 通过 `readProfile` + `governanceReady` 决定是否附加 `governanceVersion`。
