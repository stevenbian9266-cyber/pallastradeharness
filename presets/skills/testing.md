---
name: {{SKILL_ID}}
description: Use when working on {{PROJECT_NAME}}'s {{SKILL_TITLE}} area — unit tests, integration tests, e2e, fixtures, coverage, test conventions. Common phrasings include "写测试", "跑测试", "单测", "用例", "test", "spec", "coverage", "断言". Provides testing conventions and quality gates; defers to authoritative files below.
lastReviewedAt: {{TODAY}}
---

# {{PROJECT_NAME}} — {{SKILL_TITLE}}

> 由 `harness skill audit --generate` 自动创建（检测依据：{{DETECT_NOTE}}）。
> 这是通用基线模板，AI 协作时按本项目实际细化。

## 核心概念

- **测试金字塔**：大量单元测试 + 适量集成测试 + 少量端到端
- **行为优先**：测试描述行为与结果（`should ... when ...`），不依赖实现细节
- **覆盖三态**：正常路径 + 边界（空/极值/临界）+ 错误路径
- **测试即文档**：测试是需求的可执行规格；删除/弱化测试来通过检查 = 违规
- **可重复**：测试独立、可并行、不依赖执行顺序与外部真实网络

## 常用操作

1. 改代码必跑对应测试：`<项目测试命令>`；改完确认不破坏既有测试
2. 新增功能：先写失败测试（红）→ 实现（绿）→ 重构（保持绿）
3. 修 bug：先写复现测试，再修复，防止回归
4. 纯逻辑模块：覆盖正常/边界/错误；UI 组件：渲染 + 交互 + 样式
5. 覆盖率报告：新代码不允许降低关键路径覆盖率

## 常见问题与陷阱

- ❌ 只测正常路径不测错误 → 边界与异常是故障高发区
- ❌ 测试依赖真实服务（数据库/网络）→ 慢且不稳定；用测试替身
- ❌ 断言实现细节（内部调用次数/私有方法）→ 重构即碎；断言行为
- ❌ 为了通过删测试/弱化断言 → 违规；改为修正实现或修正错误测试
- ❌ 测试间共享可变状态 → 顺序依赖；每测试独立隔离
- ❌ 只给 lib 写测试漏组件 → 分层覆盖

## 本项目权威文件

{{AUTHORITY_FILES}}

## 项目化待办（AI 填充）

- （AI：列出本项目测试框架/命令、测试目录约定、fixture 与 mock 风格）
- （AI：补全本项目既有测试模式样例与覆盖基线）
