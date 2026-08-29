# PRD-20260828-other-视觉回归-visual-regression-捕获-基线-像素diff

| 元数据 | 值 |
|---|---|
| 状态 | approved |
| 创建日期 | 2026-08-28 |
| 来源 | 新增：视觉回归（visual-regression 捕获/基线/像素diff） |
| 分类 | other（引擎仓 self-dogfood 功能） |
| 需求类型 | 新功能（设计文档 §18.4 视觉回归基线） |

> 对应设计文档：`harness持续治理机制设计(1).md` **§18.4 验收层二：视觉回归基线（golden screenshot）**。

## 1. 背景与目标

- **背景**：§18 的 UI 监督三件便宜项（ui-approval / UI 反模式扫描）已落地，缺**视觉回归**——"截图检查没有基线等于没有检查"。需要 golden screenshot 基线 + 像素级 diff + 阈值门禁。
- **目标**：实现 `bin/visual-regression.mjs`（capture / baseline / diff），像素差异超阈值即 blocking；无浏览器环境明确降级为 `validation_unavailable`。
- **成功指标**：`harness visual:baseline --from <dir>` 建立基线；`harness visual:diff --from <dir>` 像素 diff 超阈值 exit 1；无基线时明确降级。

## 2. 用户故事 / 场景

- 作为 引擎使用者，我希望建立页面 golden screenshot 基线，以便后续 UI 变更可对比。
- 作为 引擎使用者，我希望 `visual:diff` 检测像素级回归，以便"这次改动弄坏了别的页面"被自动拦截。
- 作为 引擎使用者，我希望无浏览器环境时得到明确"未验证"降级，而不是假的"通过"。
- 场景：正常（diff 在阈值内）、异常（diff 超阈值 exit 1）、降级（无基线/无截图 validation_unavailable）。

## 3. 功能需求（FR）

- FR-001：`bin/visual-regression.mjs` 提供 `capture`（playwright 截图，可选）、`baseline`（从 `--from` 目录或 capture 结果建立基线）、`diff`（对照基线像素 diff）三个子命令。
- FR-002：diff 使用 pixelmatch 计算差异比率，超 `visualRegression.maxDiffRatio`（默认 0.001）即 exit 1；输出按视口/页面分组的 max diff。
- FR-003：无基线或无截图时输出 `validation_unavailable` 并 exit 2（降级，不声称通过）。
- FR-004：`harness visual:baseline|diff` CLI 接入 harness.mjs；`config.visualRegression` 配置节（baselineDir / viewports / maxDiffRatio / url / enabled）。
- FR-005：`visual-regression` Gate check：项目声明 `visualRegression.enabled=true` 且配 url 时 gate 自动加（verification），由视觉 diff 证据自动满足。
- FR-006：`package.json` 依赖 `pngjs` + `pixelmatch`（纯 JS）；playwright 为可选（capture 时提示安装）。

## 4. 非功能需求（NFR）

- 无浏览器环境（CI 无 playwright）仍可走 `--from` 文件流（外部工具截图 → baseline/diff）。
- 向后兼容：不改变现有命令；未配置 visualRegression 的项目无新增 gate。
- 确定性：diff 由 pixelmatch 计算，可复现可测试（合成 PNG 测试）。

## 5. 验收标准（AC，与测试一一映射）

- AC-001 ← FR-001：`baseline --from <dir>` 将目录截图复制到基线目录。
- AC-002 ← FR-002：相同截图 diff 差异 ≤ 阈值，exit 0。
- AC-003 ← FR-002：不同截图 diff 超阈值，exit 1 且输出 max diff 比率。
- AC-004 ← FR-003：无基线时 `diff` 输出 `validation_unavailable` 并 exit 2。
- AC-005 ← FR-004：`harness visual:diff --from <dir>` CLI 可用。
- AC-006 ← FR-005：配置 `visualRegression.enabled=true` 时 gate 含 `visual-regression` 检查；关闭时不含。

## 6. 技术影响

- 新增：`bin/visual-regression.mjs`、`bin/visual-regression.test.mjs`。
- 修改：`bin/harness.mjs`（CLI）、`bin/config-loader.mjs`（visualRegression 默认节 + gate check）、`bin/evidence.mjs`（visual-regression gate 自动满足）、`package.json`（pngjs/pixelmatch）。
- 文档：`docs/commands.md`、`docs/getting-started.md`、`README.md`、`CHANGELOG.md`。
- 影响面：`harness affected --base origin/main` 输出。

## 7. 测试计划

- `test`：`node --test bin/visual-regression.test.mjs` + 全量 `node --test bin/*.test.mjs`。
- AC 映射：AC-001~004 → visual-regression.test.mjs（合成 PNG）；AC-005 → CLI 冒烟；AC-006 → config-loader 用例。
- 校验：`prd verify --semantic --id PRD-20260828-other-视觉回归-...` 对本 PRD 通过。

## 8. 文档同步清单（知识同步门）

- `docs/commands.md`：`visual:baseline|diff`。
- `docs/getting-started.md`：UI 监督小节。
- `README.md`：命令表 / 特性。
- `CHANGELOG.md`：Unreleased。

