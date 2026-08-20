---
name: {{SKILL_ID}}
description: Use when working on {{PROJECT_NAME}}'s {{SKILL_TITLE}} area — API endpoints, routes, request/response contracts, serialization, versioning, error formats. Common phrasings include "add an endpoint", "API 接口", "接口文档", "改接口", "openapi", "swagger", "路由", "serializer". Provides API design conventions and change workflow; defers to authoritative files below.
lastReviewedAt: {{TODAY}}
---

# {{PROJECT_NAME}} — {{SKILL_TITLE}}

> 由 `harness skill audit --generate` 自动创建（检测依据：{{DETECT_NOTE}}）。
> 这是通用基线模板，AI 协作时按本项目实际细化（下方「项目化待办」）。

## 核心概念

- **契约优先**：对外 API 的请求/响应结构是契约；改契约 = 改文档 + 改调用方
- **分层**：`Controller/Route → Service/UseCase → Domain → Persistence`；Controller 只做参数校验与响应映射，禁止直接碰数据访问
- **错误格式统一**：所有端点使用同一错误结构（`code/message/fieldErrors`），错误码语义稳定、禁止裸 HTTP 状态码承载业务错误
- **版本化**：破坏性变更走版本路径（`/v1/...` 或 header 协商），禁止静默改字段
- **鉴权标注**：每个端点必须标明权限要求（登录 / 角色 / 资源所有权）

## 常用操作

1. 新增端点：定义请求/响应 → 校验 → 服务方法 → 测试 → **更新 docs/api/**（含权限标注与 curl 示例）
2. 查询接口：一律分页（`page/size`）+ 字段白名单，禁止返回不必要的大字段（`select *`）
3. 列表接口：支持排序/过滤需显式声明允许的字段与操作符，防注入
4. 写接口：幂等设计（`Idempotency-Key` 或业务唯一键），重复提交不产生脏数据
5. 破坏性变更：先弃用（deprecation）再移除；在 PR/文档中明确标注 Breaking Change

## 常见问题与陷阱

- ❌ 直接返回 ORM 实体（序列化泄漏内部字段/懒加载 N+1）→ 返回 DTO/View
- ❌ 错误信息含堆栈/内部路径 → 统一错误码 + 用户可读消息
- ❌ 端点不标权限 → 越权风险；必须显式声明
- ❌ 修改响应结构但不更新 API 文档 → 文档漂移；改接口必须同步 docs/api/
- ❌ 用 `1`/`true`/`success` 等无意义布尔表达业务状态 → 用稳定业务码
- ❌ 分页参数不校验上限 → 恶意大分页打爆内存；限制 `size` 最大值

## 本项目权威文件

{{AUTHORITY_FILES}}

## 项目化待办（AI 填充）

- （AI：列出本项目全部对外端点分组与路由前缀、序列化/错误码约定、鉴权机制）
- （AI：补全本项目特有的接口变更流程与回归测试入口）
