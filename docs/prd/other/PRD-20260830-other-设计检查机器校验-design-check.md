# PRD-20260830-other-设计检查机器校验-design-check

| 元数据 | 值 |
|---|---|
| 状态 | approved |
| 创建日期 | 2026-08-30 |
| 来源 | 新增：设计检查机器校验 design:check 与 gate:clear 拦截（§十九·补 19A.4） |
| 分类 | other（引擎仓 self-dogfood 功能） |
| 需求类型 | 新功能（设计文档 §十九·补 19A.4：设计产物的 Gate 约束机器化） |

> 对应设计文档：`harness持续治理机制设计(1).md` **§十九·补 19A.4 设计产物的 Gate 约束**——19A.4 承诺 7 个设计检查项是"机器可执行/可验证 + 确定性门禁"，但当前这些检查项只能人工 `gate:clear`，没有机器校验。本次把其中 6 个检查项机器化。

## 1. 背景与目标

- **背景**：§19A.4 定义 feature gate 在 `user-confirmed` 后追加 7 个设计检查项，但除 `design-confirmed`（人工 WAIT）外，其余 6 项（4 个 create-* + tech-design-has-baseline + tech-design-has-reuse-matrix）目前靠人工 `gate:clear`，无机器校验——"设计文档存在/Part A 四节齐全/Part B 矩阵存在"没有被实际检查，存在误 clear 或造假空间。
- **目标**：新增 `design:check` 机器校验（4 文档存在性 + tech-design Part A 四节 + Part B 矩阵），并在 `gate:clear` 时拦截 6 个设计检查项——必须通过机器校验才能 clear。
- **成功指标**：`design:check --task <id>` 输出 6 项 pass/fail；fail>0 exit 1；`gate:clear --clear create-ui-doc` 等在设计产物缺失时被拒绝（exit POLICY_FAILURE），补齐后通过。

## 2. 用户故事 / 场景

- 作为 开发，我希望设计检查项有机器校验，避免"声明有设计文档但实际没有"。
- 作为 评审者，我希望 tech-design 的 Part A/B 被实际解析校验（A1-A4 四节、复用矩阵有效行）。
- 场景：正常（4 文档齐全 + Part A/B 合规 → clear 通过）、边界（单文档缺失 → 对应项 fail）、异常（Part A 缺节 / Part B 空 → fail 拒绝 clear）。

## 3. 功能需求（FR）

- FR-001：新增 `bin/design-check.mjs`：`checkDesignArtifacts({ rootDir, designsDir, taskId, only })`——校验 `docs/designs/<taskId>/` 下 ui.md / interaction.md / visual.md / tech-design.md 存在；tech-design.md 含 Part A 四节（A1 业务系统盘点 / A2 数据模型识别 / A3 字段盘点 / A4 代码结构）；含 Part B 复用决策矩阵（复用 reuse-adherence 的 parseReuseMatrix，≥1 有效行）。
- FR-002：CLI `harness design:check [--task <id>] [--json]`——6 项 pass/fail 输出；fail>0 exit 1。
- FR-003：`gate:clear` 拦截——`--clear` 为 6 个机器可校验设计检查项（create-ui-doc / create-interaction-spec / create-visual-spec / create-tech-design / tech-design-has-baseline / tech-design-has-reuse-matrix）时，先跑对应机器校验，未通过则拒绝 clear（exit POLICY_FAILURE）；`design-confirmed` 保持人工 clear（WAIT，不拦截）。
- FR-004：无 taskId 时 `design:check` 扫描 designsDir 全部任务（全部通过才 exit 0）。

## 4. 非功能需求（NFR）

- 向后兼容：未配置 designStage 的项目（enabled=false）无设计检查项，拦截不生效。
- 确定性：文件存在性 + 标题/矩阵解析为纯函数，可测试。
- 拦截只影响 6 个设计检查项，不影响其他 gate:clear 行为。

## 5. 验收标准（AC，与测试一一映射）

- AC-001 ← FR-001：checkDesignArtifacts 对齐全设计产物返回 6 项 pass；缺文件/缺 Part A 节/缺 Part B → 对应项 fail。
- AC-002 ← FR-002：CLI `design:check --task <id>` 输出 6 项；有 fail 时 exit 1。
- AC-003 ← FR-003：gate:clear 对缺失设计产物拒绝（exit 1）；补齐后通过。
- AC-004 ← FR-003：design-confirmed 不受拦截（可人工 clear）。
- AC-005 ← FR-004：无 taskId 时扫描全部任务，任一 fail → exit 1。

## 6. 技术影响

- 新增：`bin/design-check.mjs`、`bin/design-check.test.mjs`。
- 修改：`bin/harness.mjs`（design:check 分发 + gate:clear 拦截）。
- 复用：`bin/reuse-adherence.mjs` 的 `parseReuseMatrix`；冒号子命令套路。
- 文档：`docs/commands.md`、`docs/getting-started.md`、`README.md`、`CHANGELOG.md`。

## 7. 测试计划

- `test`：`node --test bin/design-check.test.mjs` + 全量 `node --test bin/*.test.mjs`。
- AC 映射：AC-001~005 → design-check.test.mjs（临时项目真实文档 + spawnSync CLI + gate:clear 拦截）。
- 校验：`prd verify --semantic --id PRD-20260830-other-设计检查机器校验-design-check` 通过。

## 8. 文档同步清单（知识同步门）

- `docs/commands.md`：`design:check`。
- `docs/getting-started.md`：设计阶段小节补充 `design:check`。
- `README.md`、`CHANGELOG.md`。
