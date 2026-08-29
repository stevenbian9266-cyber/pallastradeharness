# PRD-20260823-other-README版本漂移修复与发布后自动同步

| 元数据 | 值 |
|---|---|
| 状态 | approved |
| 创建日期 | 2026-08-23 |
| 来源 | 用户一句话需求："Readme出现了内容版本漂移的情况，需要更新，最好是实现每次发布新版后自动更新" |
| 分类 | other |
| 需求类型 | 优化迭代 / 文档 |

## 1. 背景与目标

- **一句话需求原文**：Readme出现了内容版本漂移的情况，需要更新，最好是实现每次发布新版后自动更新
- **背景**：`README.md`「发布信息」仍写 `1.6.0`，但 `package.json` 已是 `1.7.0`（2026-08-22 已发布）；版本记录表缺 `v1.7.0` 行；`package-lock.json` 根版本同样停留在 `1.6.0`。根因是发布流程依赖人工同步 README，无任何校验/自动化，导致每次发版都可能漏同步。
- **目标**：
  1. 立即修复现存版本漂移（README / package-lock / roadmap / SECURITY）
  2. 新增确定性同步脚本 `bin/readme-sync.mjs`（`--check` / `--write`），从 `package.json` + `CHANGELOG.md` 自动校正 README 版本信息
  3. CI 门禁：版本变更 PR 合并前强制 `readme-sync --check` 通过，杜绝漂移入库
  4. 发布后自动更新：tag 发布 workflow 发布成功后自动同步并兜底 PR（main 受保护，不能直推）
- **成功指标**：发布一个新版本后，README 版本信息自动/强制保持与 package.json 一致；`readme-sync --check` 在 CI 常绿。

## 2. 用户故事 / 场景

- 作为发布维护者，我发布 vX.Y.Z 后希望 README 版本信息不再人工手工改，以便杜绝版本漂移。
- 作为贡献者，我在版本 PR 中改 package.json 但忘了同步 README，CI 应拦截并提示运行 `readme-sync --write`。
- 场景：正常流（发版 PR → 同步脚本 → 合并 → tag → 发布 → 自动同步/兜底）；边界（README.en.md 版本表为人工精选列表，不强制全量行）；异常（tag 直接推送绕过 PR → 发布后兜底 PR 修复）。

## 3. 功能需求（FR）

- FR-001：`bin/readme-sync.mjs` 提供 `--check`（漂移即 exit 1）与 `--write`（就地修复）两种模式。
- FR-002：`--write` 自动把 `README.md`「当前源码版本」行更新为 `package.json` 版本。
- FR-003：`--write` 自动为 `CHANGELOG.md` 中已发布但 README 版本表缺失的版本补齐表行（自动生成占位内容，标注待润色）。
- FR-004：`harness readme:sync` 命令接入 CLI 与 help。
- FR-005：CI（test.yml）新增 `readme-sync --check` 门禁 job。
- FR-006：publish.yml 发布成功后运行 `--write`；若有变更则创建修复 PR（main 保护，不直推）。

## 4. 非功能需求（NFR）

- 确定性：脚本零 LLM、纯文本解析，可重复执行、结果稳定。
- 兼容：不破坏现有手写「版本记录」富文本行；只补缺失行、只改版本号行。
- 可维护：新增单元测试 `bin/readme-sync.test.mjs`。

## 5. 验收标准（AC，与测试一一映射）

- AC-001 ← FR-001：`readme-sync --check` 在存在漂移时 exit 1，无漂移时 exit 0（单测覆盖）。
- AC-002 ← FR-002：`--write` 后 README.md 当前版本行与 package.json 一致（单测覆盖）。
- AC-003 ← FR-003：`--write` 后版本表包含全部已发布版本行（单测覆盖）。
- AC-004 ← FR-004：`harness readme:sync --check` 可执行且行为与直接跑脚本一致（CLI 接线单测/手动验证）。
- AC-005 ← FR-005：test.yml 含 readme-sync 检查步骤（workflow diff 可见）。
- AC-006 ← FR-006：publish.yml 含发布后同步 + 兜底 PR 步骤（workflow diff 可见）。

## 6. 技术影响

- 涉及组件/文件：`bin/readme-sync.mjs`（新增）、`bin/readme-sync.test.mjs`（新增）、`bin/harness.mjs`（接线 + help）、`README.md`、`README.en.md`、`package-lock.json`（npm 再生成）、`docs/commands.md`、`docs/getting-started.md`、`docs/roadmap.md`、`SECURITY.md`、`CHANGELOG.md`、`.github/workflows/test.yml`、`.github/workflows/publish.yml`、`docs/prd/README.md`（索引）。
- 影响面：无运行时行为变更；新增一个 CLI 子命令；CI 增加一个只读检查。

## 7. 测试计划

- 新增测试文件：`bin/readme-sync.test.mjs`（覆盖 AC-001/002/003/004）。
- 更新测试文件：无。
- 覆盖映射：AC-001/002/003 → `bin/readme-sync.test.mjs`；AC-005/006 → workflow 文件评审。

## 8. 文档同步清单（知识同步门）

- `README.md`（命令表 + 发布信息 + 版本记录）
- `docs/commands.md`（命令参考新增 `readme:sync`）
- `docs/getting-started.md`（如需提及）
- `CHANGELOG.md`（Unreleased 追加本批内容）
- `docs/roadmap.md`（1.6.0 状态行修正）
