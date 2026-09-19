# Technology Stack

> Project Constitution 模板（Batch B / B05，human-readable）。机读契约见同目录 `tech-stack.schema.json`。
> **只填写实际适用项**；未使用的类别写 `N/A`，不要删除章节（保持结构可比）。
> 任何 `Restricted / Deprecated` 判定都必须在本文档与 `Related Decisions` 中给出原因。

## Runtime

- 运行时与版本约束（例如 Node `>=22`）：

## Language

- 语言 / 版本 / 模块体系（ESM/CJS 等）：

## Package Manager

- 包管理器与锁文件政策：

## Frontend

- 框架 / 组件库 / 状态管理（无则 `N/A`）：

## Backend

- 服务端框架 / 进程模型：

## Database

- 数据库类型与版本：

## ORM

- ORM / 数据访问层：

## Cache

- 缓存方案与失效策略：

## Queue

- 队列 / 事件总线：

## Search

- 检索方案：

## Object Storage

- 对象存储 / 文件存储：

## Testing

- 测试框架与运行命令（与 `testing-standard.md` 一致）：

## Browser / E2E

- 浏览器自动化 / E2E 工具：

## Build

- 构建工具与产物形态：

## Lint / Format

- 静态检查与格式化工具：

## Deployment

- 部署形态（包 / 容器 / 平台）与发布方式：

## Observability

- 日志 / 指标 / 追踪：

## Approved Libraries

| 库 | 用途 | 约束（版本 / 使用范围） |
|---|---|---|
| | | |

## Restricted Technologies

| 技术 | 限制原因 | 替代方案 | 例外条件 |
|---|---|---|---|
| | | | |

## Deprecated Technologies

| 技术 | 弃用时间 | 迁移去向 |
|---|---|---|
| | | |

## Version Policy

- 版本升级策略（major/minor/patch 的语义与审批要求）：
- 供应链约束（pin / 审计 / provenance）：
- 重大技术变更流程：`DEPENDENCY_CHANGE`（普通依赖）→ `TECH_STACK_CHANGE`（框架/ORM/数据库/队列/缓存/UI 框架/认证架构）→ Decision / ADR → 本文件更新。

## Related Decisions

| 决策 / ADR | 主题 | 状态 |
|---|---|---|
| | | |
