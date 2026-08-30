# PRD-20260830-other-编程环节设计产物治理-design-stage

| 元数据 | 值 |
|---|---|
| 状态 | approved |
| 创建日期 | 2026-08-30 |
| 来源 | 新增：编程环节设计产物治理（UI/交互/视觉/技术方案 + design scan + reuse-adherence） |
| 分类 | other（引擎仓 self-dogfood 功能） |
| 需求类型 | 新功能（设计文档 §19 发布前强化的深化：PRD 确认后 → 设计阶段 → 编程） |

> 对应设计文档：`harness持续治理机制设计(1).md` **§19 发布前开发与测试监督强化** 的深化——在 `user-confirmed`（PRD/需求确认）之后、写代码之前，强制产出 4 个设计产物（UI 文件 / 交互规范 / 视觉规范 / 技术方案），其中技术方案必须先做现状识别（业务系统、数据模型、字段、代码结构）并给出明确的复用决策矩阵（调用已有 / 扩展已有 / 新封装公用 / 新建局部）。

## 1. 背景与目标

- **背景**：当前 feature gate 到 `user-confirmed` 后直接进入编程。缺乏"设计阶段"约束导致三类质量失控：① 无 UI/交互/视觉设计 → 前端自由发挥、风格漂移；② 无技术方案 → 重复造轮子、忽略已有方法/组件/数据模型；③ 无现状识别 → 新增字段/表/方法与已有冲突、改错归属模块。
- **目标**：PRD 确认后强制产出 4 个设计文档（`docs/designs/<task-id>/`），技术方案强制现状识别 + 复用决策矩阵；提供 `design scan` 自动化现状识别与 `reuse-adherence` 复用落地校验；设计确认（design-confirmed）后才允许编程。
- **成功指标**：feature gate 含 7 个设计检查项；`harness design:scan` 输出业务/数据/代码现状 JSON；`reuse-adherence` 验证器对技术方案复用矩阵做静态可判校验；设计文档模板 4 份。

## 2. 用户故事 / 场景

- 作为 开发，我希望 PRD 确认后有明确的设计产物清单，避免"边写边想"。
- 作为 开发，我希望技术方案先扫描现状（有哪些业务模块/数据模型/字段/公共方法），以便"能复用就不新写"。
- 作为 评审者，我希望每个能力需求都有明确的复用决策（调用已有/扩展/新封装/新建），以便审查"是否重复造轮子"。
- 场景：正常（4 个设计文档齐全 + 技术方案含现状与复用矩阵 → 进入编程）、边界（设计缺失 → gate 阻断）、异常（声明"调用已有 X"但实现没调用 → reuse-adherence 阻断）。

## 3. 功能需求（FR）

- FR-001：设计文档模板 4 份（`templates/designs/ui.md`、`interaction.md`、`visual.md`、`tech-design.md`）；tech-design 模板内置 Part A 现状识别（业务系统/数据模型/字段/代码结构 4 节）+ Part B 复用决策矩阵表（决策列：调用已有/扩展已有/新封装公用/新建局部）+ Part C 实施落点。
- FR-002：feature gate 在 `user-confirmed` 后追加 7 个设计检查项（preparation）：`create-ui-doc` / `create-interaction-spec` / `create-visual-spec` / `create-tech-design` / `tech-design-has-baseline` / `tech-design-has-reuse-matrix` / `design-confirmed`（WAIT，用户确认设计）。
- FR-003：新增 `bin/design-scan.mjs`：`harness design:scan --scope business|data|code|all` 输出结构化现状 JSON——business（业务模块/服务清单）、data（数据模型/字段清单：migrations/prisma/sequelize/mongoose/entity/sql）、code（公共方法/组件/工具清单：lib/utils/components 等导出符号 + 文件位置）。
- FR-004：新增 `bin/reuse-adherence.mjs`：解析 `docs/designs/<task>/tech-design.md` 复用决策矩阵，对每行决策做静态可判校验——调用已有（实现中确实引用目标符号）/ 扩展已有（原位置文件仍存在）/ 新封装公用（新增文件导出目标且被 ≥1 处引用）/ 新建局部（目标符号仅一处定义）；不可判定 → warning 不阻断。
- FR-005：`reuse-adherence` 注册为受信验证器（`npx harness reuse-adherence --task <id>`），gate 在启用时自动加 `reuse-adherence-gate`（verification），由新鲜 reuse-adherence 验证器证据自动满足（复用 evidence.mjs baseline-gate 模式）。
- FR-006：`config.designStage`（enabled 默认 true / designsDir='docs/designs'）；关闭时设计检查项与 reuse-adherence-gate 不进 gate。

## 4. 非功能需求（NFR）

- 向后兼容：`config.designStage.enabled` 可关闭；`design:scan` 无匹配目录时输出空清单（不报错）。
- 确定性：矩阵解析 + 符号引用检查为静态可判逻辑，可测试。
- 容错：reuse-adherence 对无法判定的行（信息不足）记 warning 不阻断——与 no_regression"历史失败不阻断"同思路。
- 模板可插拔：项目可在 `docs/designs/_TEMPLATE*` 覆盖内置模板（对齐 PRD 模板机制）。

## 5. 验收标准（AC，与测试一一映射）

- AC-001 ← FR-001：templates/designs/ 下 4 个模板文件存在且 tech-design 模板含 Part A/B/C 骨架。
- AC-002 ← FR-002：feature gate 含 7 个设计检查项且顺序在 user-confirmed 之后；`config.designStage.enabled=false` 时不包含。
- AC-003 ← FR-003：design:scan --scope code 对含 lib/utils/components 的临时项目输出导出符号清单（符号名 + 文件）。
- AC-004 ← FR-003：design:scan --scope data 对含 migrations/model 文件的临时项目输出模型/字段清单。
- AC-005 ← FR-004：reuse-adherence 对"调用已有"且实现引用了目标 → pass；"调用已有"但目标不存在 → fail；"新封装公用"未被引用 → fail；信息不足 → warning。
- AC-006 ← FR-005：config.designStage.enabled 时 gate 含 `reuse-adherence-gate`（verification）；关闭时不包含。
- AC-007 ← FR-006：reuse-adherence 由新鲜验证器证据自动满足（evidence 接线，同 baseline-gate 模式）。

## 6. 技术影响

- 新增：`templates/designs/`（4 模板）、`bin/design-scan.mjs`、`bin/design-scan.test.mjs`、`bin/reuse-adherence.mjs`、`bin/reuse-adherence.test.mjs`。
- 修改：`bin/config-loader.mjs`（designStage 默认 + feature 设计检查项 + reuse-adherence 验证器 + reuse-adherence-gate）、`bin/harness.mjs`（design:scan 分发 + reuse-adherence 分发）、`bin/evidence.mjs`（reuse-adherence-gate 自动满足）。
- 文档：`docs/commands.md`、`docs/getting-started.md`、`README.md`、`CHANGELOG.md`（设计文档章节因设计文档不在磁盘，暂以本 PRD + 模板承载）。

## 7. 测试计划

- `test`：`node --test bin/design-scan.test.mjs bin/reuse-adherence.test.mjs` + 全量 `node --test bin/*.test.mjs`。
- AC 映射：AC-001~007 → 两个新测试文件；AC-002/006 → config-loader 用例（getGateChecks）。
- 校验：`prd verify --semantic --id PRD-20260830-other-编程环节设计产物治理-design-stage` 对本 PRD 通过。

## 8. 文档同步清单（知识同步门）

- `docs/commands.md`：`design:scan`、`reuse-adherence`。
- `docs/getting-started.md`：设计阶段小节（PRD 确认后 → 4 设计产物 → design-confirmed）。
- `README.md`：命令表。
- `CHANGELOG.md`：Unreleased + 全量测试数更新。
