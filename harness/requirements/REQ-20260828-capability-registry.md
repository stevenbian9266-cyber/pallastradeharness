# 需求文档 REQ-20260828-capability-registry.md

> 对应 PRD：`docs/prd/other/PRD-20260828-other-agent适配器能力登记与保护等级-17-3.md`
> Task: TASK-20260828164302-c78e61d0 / Gate: GATE-2026-08-28T16-43-07
> 对应设计文档：`harness持续治理机制设计(1).md` §17.3.1–17.3.2

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | adapter, capability, protection, state store | `bin/agent-adapters.mjs`（runAdapters list/generate + ADAPTER_TARGETS）、`bin/state-store.mjs`（atomicWriteJson/atomicWriteText/statePaths）、`bin/cli-utils.mjs`（EXIT_CODES/getArg/hasArg）、`bin/contracts.mjs` | ✅ 全部复用点已定位 |
| presets | `presets/` | — | 框架预设 | 不涉及 |
| templates | `templates/` | — | — | 不涉及 |
| rules | `rules/` | — | — | 不涉及 |
| docs | `docs/` | commands, getting-started | `docs/commands.md`、`docs/getting-started.md` | ⚠️ 需同步 |
| 根 | `harness.config.mjs` | adapters | 无 adapter 配置节（supervisor.mode 存在） | ✅ 无新增配置必须项 |
| 根 | `CHANGELOG.md` | Unreleased | 已有 §18/§19 记录 | ⚠️ 需追加 |

### 搜索结论

- `agent-adapters.mjs` 的 `runAdapters` 只支持 `list` / `generate`；增加 `register` / `registered` / `unregister` 子命令即可。
- `state-store.mjs` 提供 `atomicWriteJson` / `statePaths`，登记存储放 `.harness-state/adapters/`。
- `cli-utils.mjs` 提供 EXIT_CODES / getArg / hasArg 约定。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 工作流：一句话 → PRD → 用户确认 → gate → 实施 → AC↔测试映射 → 知识同步 |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 代码变更后同步知识文档；更新后跑 `docs:check` |
| `skills/harness-skill-author/SKILL.md` | ✅ 已读（引擎仓无业务定制冲突） | 产出机器可读、可审计 |

---

## 需求标题

Agent 适配器能力登记与保护等级（设计文档 §17.3.1–17.3.2）。

## 任务类型

功能优化（引擎仓 self-dogfood：落地 §17.3 能力登记与诚实保护报告）。

## 需求描述

1. **`bin/capability-registry.mjs`**：能力白名单（read_governance_context / propose_plan / propose_patch / run_registered_check / request_ai_help / block_write / block_command / block_commit / block_network / display_approval_ui / suspend_resume）；`validateCapabilityRegistration`（缺 id / 未知能力 / 未知 cannot_do → 错误）；`deriveProtectionLevel`（enforced/guarded/advisory）；`honestReport`（大白话）。
2. **存储**：`.harness-state/adapters/<id>.json`；register/list/remove。
3. **CLI**：`adapter register` / `adapter registered` / `adapter unregister`。
4. **测试**：`bin/capability-registry.test.mjs`（校验/派生/往返）；CLI 冒烟。
5. **知识同步**：commands / getting-started / README / CHANGELOG。

## 技术方案（初步）

- 纯函数模块 + 目录存储（复用 statePaths / atomicWriteJson）。
- 保护等级派生：`block_write && (block_command || block_commit)` → enforced；任一 `block_*` → guarded；否则 advisory。显式 `--protection-level` 优先。
