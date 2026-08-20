---
name: {{SKILL_ID}}
description: Use when working on {{PROJECT_NAME}}'s {{SKILL_TITLE}} area — logging, monitoring, metrics, tracing, alerts, structured logs. Common phrasings include "日志", "监控", "指标", "告警", "追踪", "可观测", "log", "metrics", "trace". Provides observability conventions; defers to authoritative files below.
lastReviewedAt: {{TODAY}}
---

# {{PROJECT_NAME}} — {{SKILL_TITLE}}

> 由 `harness skill audit --generate` 自动创建（检测依据：{{DETECT_NOTE}}）。
> 这是通用基线模板，AI 协作时按本项目实际细化。

## 核心概念

- **结构化日志**：日志是机器可读的结构（key=value/JSON），可被检索聚合，禁止裸文本拼接
- **三支柱**：日志（事件）+ 指标（数值）+ 链路追踪（跨服务请求），相互关联（trace_id）
- **级别正确**：debug（细节）/info（关键流程）/warn（可恢复异常）/error（需人工处理）
- **可检索性**：日志带业务 ID（订单号/用户 ID），故障可按 ID 串起全链路
- **脱敏**：日志禁止记录敏感信息（密钥、身份证、完整手机号、支付密文）

## 常用操作

1. 关键业务操作：记录结构化日志（含业务 ID、结果、耗时）
2. 异常处理：catch 后记录 error（含上下文）再决定抛/吞；禁止空 catch
3. 指标：对关键路径埋点（请求量/错误率/延迟/队列积压）
4. 排查故障：先看 error 日志 → 按业务 ID 聚合链路 → 查指标确认影响面

## 常见问题与陷阱

- ❌ 日志记录密钥/敏感字段 → 泄漏；脱敏
- ❌ 日志不含业务 ID → 无法定位单笔；带上关联 ID
- ❌ `catch { }` 静默吞异常 → 故障不可见；至少记 warn/error
- ❌ 循环内高频打日志 → 日志爆炸；节流/采样
- ❌ 裸文本日志（不可 grep 结构化字段）→ 检索困难；结构化
- ❌ 错误日志不含堆栈/上下文 → 无法定位；带上下文与堆栈

## 本项目权威文件

{{AUTHORITY_FILES}}

## 项目化待办（AI 填充）

- （AI：列出本项目日志框架/格式、监控面板与告警规则、链路追踪入口）
- （AI：补全本项目日志脱敏清单与既有反例）
