---
layout: default
title: 路线图
---
# 路线图

| 版本 | 内容 | 状态 |
|---|---|---|
| 0.1–0.2 | 引擎解耦、独立 npm 包、init/analyze、插件、suggest/report、文档生态 | ✅ 已发布（最新 0.2.3） |
| 0.3 | 可靠性：跨平台参数、fail-closed、统一退出码/对象、分阶段 Gate | ✅ 已并入 0.4 源码 |
| 0.4 | Standards Registry、规范覆盖率、Change Plan、Architecture/Technology/Code Quality Supervisor MVP | ✅ 当前源码，待发布 |
| 0.5 | Task Orchestrator、Project Brain、自动上下文包、多会话交接、Quick/Standard/Critical | 规划 |
| 0.6 | Database、UI Style、Interaction、Accessibility、API/Security、Knowledge Supervisor | 规划 |
| 0.7 | Typed Evidence、checkpoint、Recovery、自动交付报告、证据驱动 verify | 规划 |
| 0.8 | Agent adapters、MCP、TUI、技术栈 presets、下一步动作 | 规划 |
| 1.0 | 稳定插件协议、配置迁移、大型 monorepo/worktree、长期兼容 | 规划 |

## 详细版本记录

版本演进与决策记录见 `docs/standards/harness-standalone-roadmap.md`（PallasTrade 仓库），或本仓库 git 历史提交信息。

## 已知待办

- [x] suggest 档位误报修复（配置含 PRD check 时不建议升级）
- [x] 基础规则集 `rules/base-anti-patterns.json`
- [x] 贡献指南
- [x] 文档站（本目录，GitHub Pages）
- [x] 规则/插件 PR 模板
- [x] trusted publishing（OIDC）落地
- [x] Phase 0.3 可靠性基线
- [x] Phase 0.4 Standards Registry / Supervisor MVP
- [ ] Phase 0.5 Project Brain / Task Orchestrator
