---
name: {{SKILL_ID}}
description: Use when working on {{PROJECT_NAME}}'s {{SKILL_TITLE}} area — payments, refunds, reconciliation, payment callbacks, payout. Common phrasings include "支付", "微信支付", "退款", "回调", "对账", "payment", "refund", "prepay", "callback". Provides payment flow, state machine and callback security conventions; defers to authoritative files below.
lastReviewedAt: {{TODAY}}
---

# {{PROJECT_NAME}} — {{SKILL_TITLE}}

> 由 `harness skill audit --generate` 自动创建（检测依据：{{DETECT_NOTE}}）。
> 这是通用基线模板，AI 协作时按本项目实际细化。

## 核心概念

- **状态机**：支付单必须有显式状态机（`pending → paid → refunding → refunded` + 失败分支），状态变更只经命名领域方法，禁止裸 `setStatus`
- **金额**：一律最小货币单位整数（分），禁止浮点运算
- **幂等**：回调/退款/查单全部幂等——同事件重复到达不产生副作用
- **留痕**：所有支付操作（创建/回调/退款/关闭）写审计日志
- **三流对账**：本地订单 / 支付渠道账单 / 财务记录三方对账

## 常用操作

1. 发起支付：创建支付单 → 调渠道下单 → 保存渠道单号 → 返回前端支付参数
2. 回调处理：**验签 → 查单核验 → 幂等落库 → 触发业务完成事件**；回调必须幂等
3. 退款：幂等（按退款单号），先校验可退金额，成功后更新状态 + 留痕
4. 查单/关单：定时任务对账，超时未支付关单
5. 对账：渠道账单与本地支付单逐笔比对，差异人工处理

## 常见问题与陷阱

- ❌ 不验签就处理回调 → 伪造回调风险；回调必须验签 + 二次查单
- ❌ 金额用 `float/double/BigDecimal` → 精度错账；用分
- ❌ 回调处理不幂等 → 重复入账；按支付单号/回调报文号去重
- ❌ 退款不幂等 → 重复退款；按退款单号唯一约束
- ❌ 状态直接 setStatus → 状态漂移；走领域方法 + 状态机校验
- ❌ 日志记录支付密文/完整卡号 → 脱敏
- ❌ 忽略渠道超时/挂单 → 定时对账兜底

## 本项目权威文件

{{AUTHORITY_FILES}}

## 项目化待办（AI 填充）

- （AI：列出本项目支付渠道、支付单表结构、状态机全图、回调路由与验签实现）
- （AI：补全本项目退款/对账入口与既有反例）
