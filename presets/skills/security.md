---
name: {{SKILL_ID}}
description: Use when working on {{PROJECT_NAME}}'s {{SKILL_TITLE}} area — authentication, authorization, RBAC, tokens, secrets, encryption, signatures. Common phrasings include "登录", "权限", "token", "jwt", "角色", "密钥", "加密", "验签", "越权", "安全". Provides security conventions and secret handling rules; defers to authoritative files below.
lastReviewedAt: {{TODAY}}
---

# {{PROJECT_NAME}} — {{SKILL_TITLE}}

> 由 `harness skill audit --generate` 自动创建（检测依据：{{DETECT_NOTE}}）。
> 这是通用基线模板，AI 协作时按本项目实际细化。

## 核心概念

- **认证 vs 授权**：认证（你是谁）与授权（你能做什么）分离；所有受保护资源先认证后授权
- **纵深防御**：传输加密（TLS）→ 输入校验 → 认证 → 授权 → 审计，任何一层不可绕过
- **最小权限**：默认拒绝；角色/资源权限显式声明
- **密钥治理**：密钥/证书/密码只存安全存储（环境变量/密钥服务），禁止入库、入日志、入代码
- **审计**：敏感操作（登录、改密、支付、权限变更）必须留痕

## 常用操作

1. 新增受保护端点：先声明权限（角色 + 资源所有权）再实现逻辑
2. 校验输入：服务端必须再次校验（客户端校验可绕过）；白名单 > 黑名单
3. 存储敏感数据：密码哈希（bcrypt/argon2），禁止明文/可逆加密
4. 处理密钥：读取自环境变量/密钥服务，禁止硬编码与提交
5. 日志脱敏：身份证/手机号/支付密文/密钥一律脱敏（掩码或省略）

## 常见问题与陷阱

- ❌ 密钥/证书提交进仓库 → 立即轮换；禁止读取输出真实密钥
- ❌ 越权：只校验"已登录"不校验"资源归属" → 水平越权；必须校验所有权
- ❌ 明文存密码/可逆加密 → 用强哈希 + 盐
- ❌ 日志记录敏感字段 → 脱敏
- ❌ 回调/Webhook 不验签 → 伪造请求；必须验签
- ❌ 前端做权限判断后端不校验 → 后端是最后防线，必须后端校验
- ❌ SQL/命令拼接用户输入 → 参数化查询

## 本项目权威文件

{{AUTHORITY_FILES}}

## 项目化待办（AI 填充）

- （AI：列出本项目认证机制（会话/JWT/OAuth）、权限模型与角色表、密钥存放位置）
- （AI：补全本项目安全基线扫描入口与既有反例）
