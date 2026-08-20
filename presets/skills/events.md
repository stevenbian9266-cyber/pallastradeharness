---
name: {{SKILL_ID}}
description: Use when working on {{PROJECT_NAME}}'s {{SKILL_TITLE}} area — events, subscribers, listeners, message queues, webhooks, event-driven flows. Common phrasings include "事件", "订阅", "消息", "MQ", "webhook", "回调", "异步", "event". Provides event-driven conventions; defers to authoritative files below.
lastReviewedAt: {{TODAY}}
---

# {{PROJECT_NAME}} — {{SKILL_TITLE}}

> 由 `harness skill audit --generate` 自动创建（检测依据：{{DETECT_NOTE}}）。
> 这是通用基线模板，AI 协作时按本项目实际细化。

## 核心概念

- **事件即契约**：事件名/载荷结构稳定；事件只描述"已发生的事实"（过去时），不描述命令意图
- **发布/订阅解耦**：发布方不感知订阅方；跨模块通过事件协作，禁止直接调用对方内部
- **至少一次 + 幂等**：消息可能重复投递，消费方必须幂等
- **可追踪**：事件带 `event_id` / 关联业务 ID，全链路可查
- **失败兜底**：消费失败重试 + 死信，禁止静默丢弃

## 常用操作

1. 发布事件：在领域状态变更成功后发布（非事务外提前发）
2. 订阅事件：消费方幂等（按事件 ID 去重）→ 处理 → 确认
3. Webhook 对外：验签（HMAC）+ 幂等 + 超时重试策略
4. 排查：按 `event_id`/业务 ID 追踪链路；查死信/重试队列

## 常见问题与陷阱

- ❌ 订阅方处理抛错不回滚/不重试 → 数据不一致；重试 + 死信
- ❌ 不幂等消费 → 重复副作用；按事件 ID 去重
- ❌ 发布方与订阅方强耦合（直接调用/共享表）→ 用事件解耦
- ❌ 事件载荷含敏感数据 → 脱敏
- ❌ Webhook 不验签 → 伪造；必须验签 + 校验来源
- ❌ 事件在事务内发、消费方看不到未提交数据 → 事务提交后发布

## 本项目权威文件

{{AUTHORITY_FILES}}

## 项目化待办（AI 填充）

- （AI：列出本项目事件总线/MQ、事件清单与订阅关系、webhook 验签实现）
- （AI：补全本项目事件命名约定与既有反例）
