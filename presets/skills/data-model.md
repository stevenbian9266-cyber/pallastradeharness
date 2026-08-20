---
name: {{SKILL_ID}}
description: Use when working on {{PROJECT_NAME}}'s {{SKILL_TITLE}} area — entities, tables, migrations, repositories, schema changes, seed data. Common phrasings include "加一张表", "改字段", "migration", "数据模型", "实体", "schema", "索引", "外键". Provides data modeling conventions and schema change workflow; defers to authoritative files below.
lastReviewedAt: {{TODAY}}
---

# {{PROJECT_NAME}} — {{SKILL_TITLE}}

> 由 `harness skill audit --generate` 自动创建（检测依据：{{DETECT_NOTE}}）。
> 这是通用基线模板，AI 协作时按本项目实际细化。

## 核心概念

- **单一事实来源**：数据库 schema 是最终事实；应用层模型/文档都必须与 schema 对齐
- **迁移即历史**：所有 schema 变更走迁移文件（向前演进），禁止直接改库；迁移不可变（发布后禁止修改已执行迁移）
- **主键/外键策略**：主键稳定；外键命名清晰（`<entity>_id`）；跨模块禁止直接访问对方表
- **金额/时间精度**：金额用最小货币单位整数（分），禁止浮点；时间统一 UTC/ISO，禁止本地时区字符串
- **软删除/审计**：关键业务表保留审计字段（created_by/updated_at 等）；软删除需显式约定

## 常用操作

1. 新增迁移：`<devctl>/<框架> migration create <name>` → 编写 up/down → 测试 → 提交
2. 字段变更：先迁移再改实体/DTO/文档；涉及对外 API 同步更新 docs/api/
3. 加索引：先看查询模式（WHERE/JOIN/ORDER BY 列）→ 复合索引顺序最左匹配
4. 数据修复：只通过脚本/迁移，禁止手改生产库；破坏性操作先备份

## 常见问题与陷阱

- ❌ 浮点存金额 → 精度丢失；一律最小货币单位整数
- ❌ `datetime` 存本地时间 → 时区混乱；统一 UTC
- ❌ 迁移与实体不同步 → 运行时报错；改字段三步走：迁移 → 实体 → 测试
- ❌ 大表加索引/加列锁表 → 评估数据量，必要时分批/在线 DDL
- ❌ 跨模块直接写对方表 → 违反分层；走对方领域服务/事件
- ❌ 删除列不清残留代码引用 → 全仓搜索该字段引用后再删

## 本项目权威文件

{{AUTHORITY_FILES}}

## 项目化待办（AI 填充）

- （AI：列出本项目核心表清单与关系图、迁移目录、种子数据入口）
- （AI：补全本项目金额/时间/ID 的具体约定与既有反例）
