---
name: {{SKILL_ID}}
description: Use when working on {{PROJECT_NAME}}'s {{SKILL_TITLE}} area — performance, caching, N+1 queries, indexes, connection pools, slow paths. Common phrasings include "性能", "缓存", "慢查询", "N+1", "索引", "优化", "超时", "performance", "cache". Provides performance conventions; defers to authoritative files below.
lastReviewedAt: {{TODAY}}
---

# {{PROJECT_NAME}} — {{SKILL_TITLE}}

> 由 `harness skill audit --generate` 自动创建（检测依据：{{DETECT_NOTE}}）。
> 这是通用基线模板，AI 协作时按本项目实际细化。

## 核心概念

- **先测量后优化**：优化前有基线数据（耗时/吞吐/QPS），优化后复测，禁止凭感觉
- **数据库是瓶颈源头**：N+1 查询、缺索引、全表扫描是大头
- **缓存分层**：热点只读数据才缓存；缓存必须有失效策略与一致性兜底
- **资源有界**：分页限制、连接池上限、超时、重试次数都要有界
- **慢路径追踪**：关键接口有耗时日志/指标，超标即告警

## 常用操作

1. 排查慢接口：先看是否有 N+1（循环查库）→ 批量/预加载 → 再查索引
2. 加缓存：评估热点与一致性 → 设 TTL/失效 → 双写/穿透兜底
3. 优化查询：EXPLAIN 看执行计划 → 加合适索引（最左匹配）→ 控制返回列
4. 调优配置：连接池/线程池/超时按实测调整，不盲目加大
5. 大列表：游标/分页 + 字段裁剪，禁止一次拉全量

## 常见问题与陷阱

- ❌ N+1：循环内逐条查库 → 合并为批量查询
- ❌ 缓存不一致（更新数据不失效缓存）→ 写后失效/双删
- ❌ 缓存穿透/雪崩 → 空值缓存 + 随机过期 + 限流兜底
- ❌ 无界查询/无界分页 → 内存打爆；限制 size 与深度
- ❌ 优化不看基线 → 无法验证收益；先测量
- ❌ 连接池耗尽/线程阻塞 → 排查慢查询与外部调用超时
- ❌ 索引冗余/失效 → 定期审查执行计划

## 本项目权威文件

{{AUTHORITY_FILES}}

## 项目化待办（AI 填充）

- （AI：列出本项目缓存组件与键约定、慢查询入口、性能基线与既有反例）
- （AI：补全本项目性能测试/压测入口）
