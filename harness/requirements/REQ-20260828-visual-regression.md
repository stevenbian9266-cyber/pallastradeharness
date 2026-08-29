# 需求文档 REQ-20260828-visual-regression.md

> 对应 PRD：`docs/prd/other/PRD-20260828-other-视觉回归-visual-regression-捕获-基线-像素diff.md`
> Task: TASK-20260828163714-6b8258bb / Gate: GATE-2026-08-28T16-37-19
> 对应设计文档：`harness持续治理机制设计(1).md` §18.4

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | coverage-gate, verify, gate check, CLI | `bin/harness.mjs`（coverage CLI 接线 + gate）、`bin/evidence.mjs`（completeVerificationGate coverage-gate 自动满足范式）、`bin/config-loader.mjs`（getGateChecks + coverage verifier 范式）、`bin/coverage.mjs`（CLI run 范式） | ✅ 全部复用点已定位 |
| presets | `presets/` | — | 框架预设 | 不涉及 |
| templates | `templates/` | — | — | 不涉及 |
| rules | `rules/` | — | — | 不涉及 |
| docs | `docs/` | commands, getting-started | `docs/commands.md`、`docs/getting-started.md` | ⚠️ 需同步 |
| 根 | `package.json` | deps | `dependencies: glob, minimatch` | ✅ 已装 pngjs/pixelmatch |
| 根 | `harness.config.mjs` | visualRegression | 无该配置节 | ⚠️ 需新增 |

### 搜索结论

- `evidence.completeVerificationGate` 已有 coverage-gate 自动满足范式（fresh verifier 证据 → 置 done），visual-regression gate 复用同一模式。
- `config-loader.getGateChecks` 已有"配置阈值才加 coverage-gate"的条件模式 → visual-regression 同样按 `enabled` 条件追加。
- `coverage.mjs` 的 `run({rootDir,args,config})` + CLI 入口是可复制的模块范式。
- 视觉 diff 用 `pngjs`（解码）+ `pixelmatch`（差异比率）；capture 依赖 playwright（可选，缺失时提示并走 `--from` 文件流）。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 工作流：一句话 → PRD → 用户确认 → gate → 实施 → AC↔测试映射 → 知识同步 |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 代码变更后同步知识文档；更新后跑 `docs:check` |
| `skills/harness-skill-author/SKILL.md` | ✅ 已读（引擎仓无业务定制冲突） | 产出机器可读、可审计 |

---

## 需求标题

视觉回归：golden screenshot 基线 + 像素 diff（设计文档 §18.4）。

## 任务类型

功能优化（引擎仓 self-dogfood：补齐 UI 监督验收层二）。

## 需求描述

1. **`bin/visual-regression.mjs`**：`capture`（playwright 可选）、`baseline`（`--from <dir>` 建立基线）、`diff`（pixelmatch 像素 diff，超阈值 exit 1，无基线/无截图 exit 2 降级）。
2. **配置节** `config.visualRegression`：`enabled / url / viewports / baselineDir / maxDiffRatio`。
3. **CLI 接线**：`harness visual:baseline|diff`；gate 在 `enabled` 时追加 `visual-regression`（verification），由视觉 diff 证据自动满足（evidence.mjs）。
4. **依赖**：`pngjs` + `pixelmatch`（纯 JS，已装）；playwright 可选。
5. **测试**：`bin/visual-regression.test.mjs`（合成 PNG diff / 降级路径）；全量 `node --test`。
6. **知识同步**：commands / getting-started / README / CHANGELOG。

## 技术方案（初步）

- 模块结构：`captureScreenshots`（playwright 动态 import，缺失返回 null）→ `buildBaseline(from, baselineDir)` → `runDiff(baselineDir, from, maxDiffRatio)`。
- 文件命名：`<page>__<viewport>.png`；diff 输出 `max diff ratio`，`> maxDiffRatio` 即 fail。
- 降级：无基线 → exit 2 + `validation_unavailable`（对应设计文档 §16.7）。
