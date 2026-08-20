---
name: {{SKILL_ID}}
description: Use when working on {{PROJECT_NAME}}'s {{SKILL_TITLE}} area — Docker, CI/CD, deployment, environment configuration, infrastructure. Common phrasings include "部署", "Docker", "CI", "流水线", "镜像", "环境变量", "上线", "deploy". Provides deployment and pipeline conventions; defers to authoritative files below.
lastReviewedAt: {{TODAY}}
---

# {{PROJECT_NAME}} — {{SKILL_TITLE}}

> 由 `harness skill audit --generate` 自动创建（检测依据：{{DETECT_NOTE}}）。
> 这是通用基线模板，AI 协作时按本项目实际细化。

## 核心概念

- **可复现构建**：同一提交 → 同一产物；依赖锁定（lockfile）、构建不依赖环境隐式状态
- **不可变发布**：镜像/产物 tag 与 git 提交一一对应；禁止覆盖式热改生产
- **配置外置**：环境差异（URL/密钥/端口）走环境变量，禁止硬编码进代码/镜像
- **门禁**：CI 在合并前跑完 测试 + 静态检查 + 安全扫描；门禁不过禁止合入
- **可回滚**：任何发布可一键回退到上一可用版本

## 常用操作

1. 构建镜像：多阶段构建（构建层 → 运行层），运行时最小化，非 root 运行
2. 发布：tag 与提交对齐 → CI 构建 → 冒烟验证 → 记录版本
3. 环境变量：开发/测试/生产分离；密钥走 secret 机制，明文配置不入库
4. 排查部署问题：先看日志与健康检查，再查资源（磁盘/内存/端口）
5. 更新依赖：升级后跑全量测试 + 依赖漏洞扫描

## 常见问题与陷阱

- ❌ 镜像里硬编码密钥/地址 → 密钥泄漏；用环境变量/secret
- ❌ 依赖不锁定 → 构建漂移；提交 lockfile
- ❌ 容器以 root 运行 → 提权风险；非 root 用户
- ❌ 本地能跑、CI 挂了 → 环境差异；用与 CI 一致的命令（勿凭猜）
- ❌ 直接改生产数据/配置 → 走发布流程 + 变更记录
- ❌ 磁盘满导致部署挂起 → 部署前检查磁盘与清理旧镜像
- ❌ 忽略健康检查直接暴露端口 → 先探活再切流

## 本项目权威文件

{{AUTHORITY_FILES}}

## 项目化待办（AI 填充）

- （AI：列出本项目构建/部署命令（devctl 或等价）、CI 流水线文件、环境清单与端口）
- （AI：补全本项目发布/回滚流程与既有反例）
