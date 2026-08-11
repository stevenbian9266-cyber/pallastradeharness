---
layout: default
title: pallastrade-harness
---
# pallastrade-harness

AI 时代的工程纪律机制（Engineering Harness）：前置门禁、反模式扫描、PRD 需求闭环、知识同步强制。**配置驱动、项目无关**——单层 Next.js 项目、Rails monorepo、任意语言栈都能接入。

> 源自 [PallasTrade Commerce](https://github.com/stevenbian9266-cyber/pallastrade) monorepo 的 `scripts/harness`，2026-08 完成引擎/配置解耦后独立维护并开源。

## 它解决什么问题

| 痛点 | 机制 |
|---|---|
| AI 改代码不受控、绕过规范 | **前置 Gate**：改代码前必须规划并清空检查清单，pre-commit 物理拦截 |
| 反模式反复出现（内联样式/裸 fetch/硬编码色值） | **反模式扫描**：规则 JSON 驱动，CI + pre-commit 双卡 |
| 需求一句话 → 实施无依据 | **PRD 工作流**：一句话需求 → 结构化 PRD → AC→测试映射 → 验收 |
| 改了代码忘了同步文档 | **知识同步门（doc-impact）**：改了什么文件，强制同步对应知识文档 |
| 密钥/危险命令被提交 | **密钥 + 危险命令扫描**：agent 无关（Copilot/Codex/Claude/人 都拦截） |
| 规范第一天写不全 | **渐进式落地**：Lite → Standard → Strict 档位，`harness doctor` 提示下一步 |

## 快速导航

- [快速开始](getting-started.md) — 5 分钟接入
- [配置参考](configuration.md) — `harness.config.mjs` 全字段
- [命令参考](commands.md) — 全部命令一览
- [插件开发](plugins.md) — 无需改引擎的扩展协议
- [规则集](rules.md) — starter 反模式规则库
- [贡献指南](contributing.md) — 规则/插件/文档贡献
- [路线图](roadmap.md) — Phase 0→4 进度

## 快速开始

```bash
npm i -D pallastrade-harness   # 或 npx harness init 引导
npx harness init               # 生成 harness.config.mjs 骨架
npx harness doctor             # 项目体检
npx harness gate --task "新增：我的功能"   # 开始一次编码任务
```

详见 [快速开始](getting-started.md)。

## License

MIT
