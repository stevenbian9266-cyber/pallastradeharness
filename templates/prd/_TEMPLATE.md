# PRD-{YYYYMMDD}-{category}-{slug}

| 元数据 | 值 |
|---|---|
| 状态 | draft / reviewing / approved / implementing / verifying / done / rejected |
| 创建日期 | YYYY-MM-DD |
| 来源 | 一句话需求原文 |
| 分类 | （自动判定，见 `harness/policies/prd-categories.json` 或 config.prd.categories） |
| 需求类型 | 新功能 / 优化迭代 / Bug 修复 / 接口变更 / 样式 / 文档 |

> 🔁 **查重回写**：`harness prd new` 自动查重（相似度 > 0.3 阻止新建）。
> 若本需求命中相似 PRD，用 `harness prd update --path <原PRD> --title "<需求>"` 回写原 PRD，
> 在原文档内完整更新（背景/FR/AC/变更记录），**不得新建重复 PRD**；确属全新需求才 `--force`。

## 1. 背景与目标

- **一句话需求原文**：<用户输入原文>
- **背景**：为什么做、解决什么问题
- **目标**：期望达成的结果
- **成功指标**：可量化指标

## 2. 用户故事 / 场景

- 作为 <角色>，我希望 <能力>，以便 <价值>
- 场景列表（正常流 + 边界 + 异常）

## 3. 功能需求（FR）

- FR-001：<可验收的功能描述>
- FR-002：...

## 4. 非功能需求（NFR）

- 性能 / 安全 / 兼容 / 可维护性

## 5. 验收标准（AC，与测试一一映射）

- AC-001 ← FR-001：<可验证的判定条件>
- AC-002 ← ...

## 6. 技术影响

- 涉及组件 / 文件 / 依赖 / 数据库 / 接口
- 影响面（`harness affected --base origin/main` 输出）

## 7. 测试计划

- 新增测试文件（路径清单）
- 更新测试文件（路径 + 变更点）
- 覆盖的 AC 映射（AC-xxx → 测试文件）

## 8. 文档同步清单（知识同步门）

- 需同步的知识文档 / API 文档 / README / Skill
