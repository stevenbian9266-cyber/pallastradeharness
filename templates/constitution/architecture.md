# System Architecture

> Project Constitution 模板（Batch B / B06，human-readable）。机读契约见同目录 `architecture.schema.json`。
> 定位：**Architecture Artifact = Source of Truth**；现有 Supervisor = Enforcement Engine（本批次不改造 Supervisor，Batch C 才做消费）。
> 填写原则：模块与路径必须真实存在；未知项写 `UNKNOWN`，不臆造。

## Architecture Summary

- 一段话说明系统形态与核心设计取舍：

## System Context

- 系统边界、外部参与者、上下游依赖：

## Architecture Style

- 风格声明（modular / layered / hexagonal / event-driven …）与选择理由：

## Modules

| 模块 id | 名称 | 路径（真实） | 层 |
|---|---|---|---|
| | | | |

## Module Responsibilities

- `<module>`：职责（做什么 / 不做什么）：

## Layers

- 层定义与依赖方向（例如：CLI → 领域模块 → 存储；禁止反向依赖）：

## Dependency Direction

- 允许的依赖方向：
- 禁止的依赖（循环、跨层直连、绕过边界）：

## Data Ownership

| 数据 | 拥有模块 | 只读方 | 说明 |
|---|---|---|---|
| | | | |

## API Boundaries

- 对外 / 对内接口边界与契约位置：

## Shared Infrastructure

- 共享基础设施（存储 / 快照 / 锁 / 工具库）与使用约束：

## Core Data Flows

| 流程 | 入口 | 路径（模块链路） | 产物 |
|---|---|---|---|
| | | | |

## Auth Boundary

- 认证 / 授权发生在哪一层；哪些模块不得感知凭据：

## External Integration Boundary

- 外部集成点、失败隔离、降级策略：

## Error Handling

- 错误分类 / 传播 / 用户可见信息边界：

## Transaction Boundary

- 事务边界与一致性策略（哪些操作必须原子）：

## Performance Constraints

- 关键性能约束与预算：

## Security Constraints

- 必须遵守的安全约束（注入 / 密钥 / 权限 / 审计）：

## Forbidden Patterns

- 禁止的架构反模式（新代码不得引入）：

## Known Architecture Debt

| 债务 | 影响 | 计划（修复 / 接受） |
|---|---|---|
| | | |

## Related ADR

| ADR | 主题 | 状态 |
|---|---|---|
| | | |
