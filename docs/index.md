---
layout: default
title: pallastrade-harness
---
# pallastrade-harness

面向 AI Agent 的软件开发生命周期治理和证据编排层：分阶段门禁、机器可读规范、实际开发监督、PRD 闭环与知识同步。**本地优先、Git-native、配置驱动、项目无关**。

> 源自 [PallasTrade Commerce](https://github.com/stevenbian9266-cyber/pallastrade) monorepo 的 `scripts/harness`，2026-08 完成引擎/配置解耦后独立维护并开源。

## 它解决什么问题

| 痛点 | 机制 |
|---|---|
| AI 改代码不受控、绕过规范 | **前置 Gate**：改代码前必须规划并清空检查清单，pre-commit 物理拦截 |
| 规范存在但没有执行覆盖 | **Standards Registry**：规范 ID、scope、权威来源、执行等级和覆盖率 |
| 编码偏离计划、引入重复和架构债务 | **Development Supervisor**：Change Plan + Diff Finding，按新增代码基线监督 |
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
- [规范与开发监督](standards-supervisor.md) — Standard Schema、覆盖率、Change Plan 和 Diff Review
- [贡献指南](contributing.md) — 规则/插件/文档贡献
- [路线图](roadmap.md) — 0.4→1.0 治理路线

## 快速开始

```bash
npm i -D pallastrade-harness   # 或 npx harness init 引导
npx harness init               # 生成 harness.config.mjs 骨架
npx harness doctor             # 项目体检
npx harness gate --task "新增：我的功能"   # 开始一次编码任务
npx harness standards coverage          # 查看规范执行覆盖率
npx harness supervise plan --task "新增：我的功能" --allow "src/**"
```

详见 [快速开始](getting-started.md)。

## License

MIT
