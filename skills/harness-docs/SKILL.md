---
name: harness-docs
description: Use when the user runs "harness docs generate --asset <path>" and a knowledge doc drafting pack needs to be completed, or when asked to keep documentation in sync after code changes. Common phrasings include "docs generate", "同步文档", "更新文档", "docs-check".
---

# Harness Docs（Auto-Docs：知识文档起草方法论）

> 目标：**代码变更后，让受影响的知识文档保持同步**——AI 起草 → 人确认 → 写回。

## 1. 触发

- `npx harness docs generate --asset <path>` 生成了起草包（`artifacts/harness-docs-drafts/`）
- `npx harness doc-impact --base origin/main` 提示受影响知识资产

## 2. 起草流程

1. 读取起草包：目标资产、关联变更文件清单、现有内容开头
2. 结合变更 diff，确定需要更新的章节
3. 保持与现有文档风格一致；只写变更相关部分（不重写全篇）
4. 涉及 API/接口变更时，同步更新对应 API 文档章节

## 3. 规则

- **人确认后才写回**；草案文件保留在 `artifacts/harness-docs-drafts/` 直到合并
- 更新后运行 `npx harness docs:check`（断链校验）确认链接有效
- 更新 `ai/memories/` 记录关键决策（如适用）

## 4. 完成标准

- 目标文档已更新且通过 `docs:check`
- 知识同步门（`doc-impact`）放行
