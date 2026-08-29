# PRD-20260828-other-ui监督便宜项-ui-approval证据类型-scan-ui-anti-patterns扫描器

| 元数据 | 值 |
|---|---|
| 状态 | approved |
| 创建日期 | 2026-08-28 |
| 来源 | 新增：UI监督便宜项（ui-approval证据类型+scan-ui-anti-patterns扫描器） |
| 分类 | other（引擎仓 self-dogfood 功能） |
| 需求类型 | 新功能（设计文档 §18 UI/UX 监督——便宜项先行） |

> 对应设计文档：`harness持续治理机制设计(1).md` **第十八章**（§18.1 约束层 / §18.5 ui-approval 硬门禁）。视觉回归等依赖浏览器运行时的高成本项不在本批次。

## 1. 背景与目标

- **背景**：设计文档 §18 定义了 UI 监督三层（约束/生成/验收），其中两项**不依赖浏览器运行时**、可低成本落地：① `ui-approval` 证据类型（人工确认截图，作为 UI 任务的硬性完成条件）；② `scan-ui-anti-patterns` 机器扫描器（禁止 inline style / 硬编码色 / 裸网络调用 / 图片缺 alt）。
- **目标**：实现这两项便宜项，为后续视觉回归铺路。
- **成功指标**：`evidence record --type ui-approval` 可用；`harness scan-ui-anti-patterns` 能识别并阻止 UI 反模式。

## 2. 用户故事 / 场景

- 作为 引擎使用者，我希望记录 `ui-approval` 类型证据，以便 UI 任务的 verify-test 附带"人看过截图并批准"。
- 作为 引擎使用者，我希望 `harness scan-ui-anti-patterns` 拦截 UI 反模式，以便 inline style / 硬编码色 / 裸 fetch 进不了 pre-commit。
- 场景：正常（合规 UI 代码零违规）、边界（设计 token 文件中的十六进制色不算违规）、异常（inline style / 裸 fetch 应被拦截）。

## 3. 功能需求（FR）

- FR-001：`contracts.mjs` 的 `EVIDENCE_TYPES` 增加 `ui-approval`，`evidence record --type ui-approval` 可用。
- FR-002：新增 `bin/scan-ui-anti-patterns.mjs` 扫描器（复用反模式扫描引擎），规则来自 `harness/policies/ui-anti-patterns.json`（无文件时用内置默认规则）。
- FR-003：`harness scan-ui-anti-patterns` CLI 命令接入 `bin/harness.mjs`；`package.json` 增加 `harness-scan-ui-anti-patterns` bin。
- FR-004：`harness.config.mjs` 的 `scanners` 增加 `uiAntiPatterns` 路径默认值；本仓提供 `harness/policies/ui-anti-patterns.json` 规则集。
- FR-005：规则集覆盖 UI-001（inline style）、UI-002（硬编码十六进制色，排除 design token 文件）、UI-003（绕过服务层裸 fetch）、UI-005（img 缺 alt，a11y）。

## 4. 非功能需求（NFR）

- 向后兼容：不改变现有 `scan-anti-patterns` 行为；`EVIDENCE_TYPES` 增加类型不破坏既有契约校验。
- 确定性：扫描为纯文本规则匹配，可测试。
- 无新增运行时依赖。

## 5. 验收标准（AC，与测试一一映射）

- AC-001 ← FR-001：`EVIDENCE_TYPES` 包含 `ui-approval`；`evidence record --type ui-approval` 创建成功。
- AC-002 ← FR-002：扫描器对 `style={{ }}` 的 JSX 文件报 UI-001 违规。
- AC-003 ← FR-002：扫描器对硬编码 `#abc` 报 UI-002，但对 design-tokens 文件不报。
- AC-004 ← FR-002：扫描器对组件内裸 `fetch(` 报 UI-003。
- AC-005 ← FR-002：扫描器对 `<img>` 无 alt 报 UI-005；带 alt 不报。
- AC-006 ← FR-003：`harness scan-ui-anti-patterns --files <file>` 输出违规并 exit 1（有 error 级违规时）。
- AC-007 ← FR-004：`harness.config.mjs` 默认 `scanners.uiAntiPatterns` 指向 `harness/policies/ui-anti-patterns.json`；本仓规则文件存在。

## 6. 技术影响

- 新增：`bin/scan-ui-anti-patterns.mjs`、`bin/scan-ui-anti-patterns.test.mjs`、`harness/policies/ui-anti-patterns.json`。
- 修改：`bin/contracts.mjs`（EVIDENCE_TYPES）、`bin/config-loader.mjs`（scanners.uiAntiPatterns 默认）、`bin/harness.mjs`（CLI 命令）、`package.json`（bin 入口）。
- 文档：`docs/commands.md`、`docs/getting-started.md`、`README.md`。
- 影响面：`harness affected --base origin/main` 输出。

## 7. 测试计划

- `test`：`node --test bin/scan-ui-anti-patterns.test.mjs` + 全量 `node --test bin/*.test.mjs`。
- AC 映射：AC-001 → contracts/evidence 用例；AC-002~007 → scan-ui-anti-patterns.test.mjs。
- 校验：`prd verify --semantic --id PRD-20260828-other-ui监督便宜项-...` 对本 PRD 通过。

## 8. 文档同步清单（知识同步门）

- `docs/commands.md`：`scan-ui-anti-patterns`、`ui-approval` 证据。
- `docs/getting-started.md`：pre-commit 扫描器清单补 UI 扫描器。
- `README.md`：命令表 / 特性。

