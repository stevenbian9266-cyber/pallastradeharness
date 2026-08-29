# 需求文档 REQ-20260823-readme-sync-1.md

> 对应 PRD：`docs/prd/other/PRD-20260823-other-README版本漂移修复与发布后自动同步.md`
> Task: TASK-20260823070407-f8407ac7 / Gate: GATE-2026-08-23T07-04-32

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | docs-check, readme, version, changelog | `bin/docs-check.mjs`（docs 防漂移范式）、`bin/harness.mjs`（命令分发 + help）、`bin/cli-utils.mjs`（EXIT_CODES） | ✅ 可复用命令/退出码约定 |
| presets | `presets/` | release, ci, github | `presets/`（含 CI 生成 preset） | ⚠️ 不直接涉及；CI 门禁改 `.github/workflows/test.yml` |
| templates | `templates/` | lefthook, hooks | `templates/lefthook.yml`、`templates/ai-hooks/` | ✅ 不涉及（版本号注释为历史标记，非漂移） |
| rules | `rules/` | — | `rules/` 通用规则基线 | 不涉及 |
| docs | `docs/` | roadmap, commands, getting-started | `docs/roadmap.md`（1.6.0 行状态过期）、`docs/commands.md`（命令参考）、`docs/getting-started.md` | ⚠️ roadmap 需修正；commands 需新增命令 |
| 根 | `README.md` / `README.en.md` | 1.6.0, 1.7.0, 当前源码版本 | README.md:72 发布信息 `1.6.0`；版本表缺 v1.7.0；README.en.md 版本表已有 v1.7.0 | ⚠️ 主漂移点 |
| 根 | `package.json` / `package-lock.json` | version | package.json `1.7.0`；lock 根版本 `1.6.0` | ⚠️ lock 漂移（受保护文件，npm 再生成） |
| 根 | `CHANGELOG.md` | 1.7.0, Unreleased | 1.7.0 已记录；Unreleased 1.8.0 实施中 | ✅ 作为版本同步的数据源 |
| 根 | `.github/workflows/` | publish, test | `publish.yml`（tag 触发 OIDC）、`test.yml`（矩阵契约测试） | ✅ 挂载点已确认 |
| 根 | `SECURITY.md` | latest stable | `≥ 1.6.0` | ⚠️ 可顺带升 1.7.0 |

### 搜索结论

- 仓库已有 `docs:check` 防漂移范式（过时命令检查），新增 `readme-sync` 采用相同 `--check`/`--write`、EXIT_CODES 约定。
- 发布流程为 tag 触发 `publish.yml`，版本号人工维护在 `package.json`；README 无自动同步，此为漂移根因。
- `package-lock.json` 受 `harness.config.mjs` supervisor `protectedFiles` 保护 → 只能 `npm install --package-lock-only` 再生成，不手改。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 代码变更后同步知识文档；更新后跑 `docs:check`；只写变更相关部分 |
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 工作流：一句话需求 → PRD → 用户确认 → gate → 实施 → 验收 → 文档同步；REQ 需含 skill 咨询表 |
| `skills/harness-skill-author/SKILL.md`（域 skill） | ✅ 已读（本任务为引擎仓自治理，无业务定制冲突） | 产出机器可读、可审计 |

---

## 需求标题

README 版本漂移修复与发布后自动同步（`bin/readme-sync.mjs` + CI 门禁 + 发布兜底）。

## 任务类型

功能优化（引擎仓 self-dogfood：修复文档漂移 + 新增防漂移工具）

## 需求描述

1. **修复现存漂移**：README.md 发布信息 `1.6.0` → `1.7.0` + 版本表补 `v1.7.0` 行；`package-lock.json` 根版本经 `npm install --package-lock-only` 再生成；`docs/roadmap.md` 1.6.0 行状态改为已发布；`SECURITY.md` 最新稳定版升 `1.7.0`。
2. **新增 `bin/readme-sync.mjs`**：读 `package.json`（当前版本）+ `CHANGELOG.md`（已发布版本列表），`--check` 校验漂移（exit 1）、`--write` 就地修复（更新当前版本行 + 补齐缺失版本表行，自动生成占位内容并标注待润色，不覆盖手写富文本）。
3. **CLI 接线**：`harness readme:sync [--check|--write]` 接入 `bin/harness.mjs` + help + `docs/commands.md`。
4. **CI 门禁**：`.github/workflows/test.yml` 新增独立 job 跑 `node bin/readme-sync.mjs --check`，版本变更 PR 必须同步 README 才能合并。
5. **发布后自动更新**：`.github/workflows/publish.yml` 发布成功后运行 `--write`；有变更则用 `gh` 创建修复 PR（main 受 Ruleset 保护，禁止直推，故用 PR 兜底）。
6. **知识同步**：CHANGELOG Unreleased 追加；README 命令表新增 `readme:sync`；docs/commands.md 同步。

## 技术方案（初步）

- 新模块 `bin/readme-sync.mjs`：纯 Node fs 文本解析，无第三方依赖；复用 `cli-utils.mjs` EXIT_CODES。
  - 解析：`package.json.version`；`CHANGELOG.md` 中 `/^## \[(\d+\.\d+\.\d+)\]/` 已发布段；`README.md` 当前版本行 `当前源码版本：\`X.Y.Z\``；版本记录表 `| **vX.Y.Z** |` 行集合。
  - `--write`：替换当前版本行；对缺失版本在表头后插入自动生成行 `| **vX.Y.Z** | ⚠️ 待润色：<CHANGELOG 首个 bullet> |`。
  - `README.en.md`：仅保证最新已发布版本有行（en 表为人工精选，不强推全量）。
- 单测 `bin/readme-sync.test.mjs`：临时目录构造 fixture，覆盖 AC-001/002/003/004。
- CI：test.yml 加 `readme-sync` job（ubuntu，单次执行）。
- publish.yml：publish 步骤后加 sync + PR 兜底（`gh pr create`，GITHUB_TOKEN 需 `contents: write` + `pull-requests: write`）。

## 风险点

- main 受 Ruleset 保护 → 发布后自动同步不能直推，只能开 PR；PR 需人工/CI 放行，存在轻微延迟（可接受，属兜底路径；正常路径由 CI 门禁保证无漂移）。
- README 版本表亮点为手写富文本 → 自动生成行仅作占位，标注「待润色」，避免机器覆盖人工文案。
- `package-lock.json` 受保护 → 用 `npm install --package-lock-only` 正规再生成，不手改。

## 验收标准（对齐 PRD AC）

- [ ] AC-001：`--check` 漂移 exit 1 / 无漂移 exit 0（单测）
- [ ] AC-002：`--write` 更新当前版本行（单测）
- [ ] AC-003：`--write` 补齐缺失版本行（单测）
- [ ] AC-004：`harness readme:sync` 接线可用（CLI 验证）
- [ ] AC-005：test.yml 含检查 job（评审）
- [ ] AC-006：publish.yml 含发布后同步 + 兜底 PR（评审）
- [ ] 现存漂移已修复（README/roadmap/SECURITY/lock 再生成）
- [ ] 文档同步：README 命令表 / docs/commands.md / CHANGELOG
