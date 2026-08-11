---
layout: default
title: 路线图
---
# 路线图

| Phase | 内容 | 状态 |
|---|---|---|
| 0 | 基线 + 耦合清单 | 规划 |
| 1 | 引擎/配置解耦 + 提效（变更感知增量扫描） | ✅ 完成 |
| 2 | 独立 npm 包 + 冷启动（init 向导 / analyze / 渐进档位）+ 插件协议 | ✅ 完成（0.1.x） |
| 3 | 自学习（suggest）+ 报告（report）+ 官方 preset（presets/） | ✅ 完成（0.2.x） |
| 4 | 生态（基础规则集 / 贡献指南 / 文档站 / trusted publishing） | 🚧 进行中（0.2.x） |

## 详细版本记录

版本演进与决策记录见 `docs/standards/harness-standalone-roadmap.md`（PallasTrade 仓库），或本仓库 git 历史提交信息。

## 已知待办

- [x] suggest 档位误报修复（配置含 PRD check 时不建议升级）
- [x] 基础规则集 `rules/base-anti-patterns.json`
- [x] 贡献指南
- [x] 文档站（本目录，GitHub Pages）
- [x] 规则/插件 PR 模板
- [ ] trusted publishing（OIDC）落地（依赖 npm org 配置，见 [贡献指南](contributing.md) → 发布）
