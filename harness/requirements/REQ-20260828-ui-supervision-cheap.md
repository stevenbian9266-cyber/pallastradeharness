# 需求文档 REQ-20260828-ui-supervision-cheap.md

> 对应 PRD：`docs/prd/other/PRD-20260828-other-ui监督便宜项-ui-approval证据类型-scan-ui-anti-patterns扫描器.md`
> Task: TASK-20260828151307-347fa260 / Gate: GATE-2026-08-28T15-13-14
> 对应设计文档：`harness持续治理机制设计(1).md` 第十八章（§18.1 / §18.5）

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | evidence types, anti-patterns scanner, CLI | `bin/contracts.mjs`（EVIDENCE_TYPES）、`bin/scan-anti-patterns.mjs`（扫描引擎范式 + 规则 JSON）、`bin/harness.mjs`（scan-anti-patterns CLI 接线）、`bin/evidence.mjs`（record 命令校验 EVIDENCE_TYPES） | ✅ 全部复用点已定位 |
| presets | `presets/` | — | 框架预设 | 不涉及（引擎仓） |
| templates | `templates/` | lefthook | `templates/lefthook.yml`（pre-commit 扫描器清单） | ⚠️ 可补 UI 扫描器 hook |
| rules | `rules/` | anti-patterns | `rules/` 通用规则基线 | 不直接涉及（UI 规则放 harness/policies） |
| docs | `docs/` | commands, getting-started | `docs/commands.md`、`docs/getting-started.md` | ⚠️ 需同步 |
| 根 | `package.json` | bin | `bin: harness-scan-anti-patterns / -secrets / -degraded-loop` | ✅ 需新增 `harness-scan-ui-anti-patterns` |
| 根 | `harness.config.mjs` | scanners | `scanners: { antiPatterns: 'harness/policies/anti-patterns.json' }` | ⚠️ 需补 `uiAntiPatterns` |

### 搜索结论

- `EVIDENCE_TYPES` 在 `bin/contracts.mjs`（command/test/build/screenshot/dom/log/database/review/approval/knowledge），`evidence record` 通过 TYPE_ALIASES + EVIDENCE_TYPES 校验 → 加 `ui-approval` 即可用。
- `scan-anti-patterns.mjs` 是可直接复用的扫描引擎（规则 JSON + `--files` 交集 + 行级正则 + guard），UI 扫描器做薄封装 + 内置默认规则即可。
- `harness.mjs` 有 `scan-anti-patterns` / `scan-degraded-loop` / `scan-secrets` CLI 接线范式；`package.json` 有独立 bin 范式。
- `templates/lefthook.yml` 的 pre-commit 清单可补 UI 扫描器（staged_files）。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 工作流：一句话 → PRD → 用户确认 → gate → 实施 → AC↔测试映射 → 知识同步 |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 代码变更后同步知识文档；更新后跑 `docs:check` |
| `skills/harness-skill-author/SKILL.md` | ✅ 已读（引擎仓无业务定制冲突） | 产出机器可读、可审计 |

---

## 需求标题

UI 监督便宜项：`ui-approval` 证据类型 + `scan-ui-anti-patterns` 扫描器（设计文档 §18）。

## 任务类型

功能优化（引擎仓 self-dogfood：落地 §18 两层 UI 监督能力）。

## 需求描述

1. **`ui-approval` 证据类型**（§18.5）：`contracts.mjs` EVIDENCE_TYPES 增加 `ui-approval`；`evidence record --type ui-approval` 可用（人工确认 UI 截图）。
2. **`scan-ui-anti-patterns` 扫描器**（§18.1）：新增 `bin/scan-ui-anti-patterns.mjs`（复用反模式扫描引擎 + 内置默认规则 + `harness/policies/ui-anti-patterns.json` 覆盖）；规则：UI-001 inline style、UI-002 硬编码十六进制色（排除 design-tokens）、UI-003 裸 fetch、UI-005 img 缺 alt。
3. **CLI 与 bin 接线**：`harness scan-ui-anti-patterns` 接入 harness.mjs；package.json 新增 `harness-scan-ui-anti-patterns` bin。
4. **配置与规则**：`harness.config.mjs` scanners 补 `uiAntiPatterns` 默认路径；本仓提供 `harness/policies/ui-anti-patterns.json`。
5. **测试**：`bin/scan-ui-anti-patterns.test.mjs`（spawnSync CLI 范式）；全量 `node --test`。
6. **知识同步**：`docs/commands.md`、`docs/getting-started.md`、`README.md`、`templates/lefthook.yml`（可选补 hook）。

## 技术方案（初步）

- `bin/scan-ui-anti-patterns.mjs`：复用 scan-anti-patterns 的行级正则引擎；`DEFAULT_UI_RULES` 内置兜底 + 文件规则覆盖。
- `contracts.mjs`：EVIDENCE_TYPES 追加 `ui-approval`（不破坏既有契约）。
- `harness.mjs` / `package.json` / `config-loader.mjs`：CLI / bin / scanners 默认接线。
