---
layout: default
title: 路线图
---
# 路线图

| 版本 | 内容 | 状态 |
|---|---|---|
| 0.1–0.2 | 引擎解耦、独立 npm 包、init/analyze、插件、suggest/report、文档生态 | ✅ 已发布 |
| 0.3 | 可靠性：跨平台参数、fail-closed、统一退出码/对象、分阶段 Gate | ✅ 已并入 0.4 源码 |
| 0.4 | Standards Registry、规范覆盖率、Change Plan、Architecture/Technology/Code Quality Supervisor MVP | ✅ 已完成 |
| 0.5 | Task Orchestrator、Project Brain、自动上下文包、多会话交接、Quick/Standard/Critical | ✅ 已完成 |
| 0.6 | Database、UI Style、Interaction、Accessibility、API/Security、Knowledge Supervisor | ✅ 已完成 |
| 0.7 | Typed Evidence、checkpoint、Recovery、自动交付报告、证据驱动 verify | ✅ 已完成 |
| 0.8 | Agent adapters、MCP、TUI、技术栈 presets、下一步动作 | ✅ 已完成 |
| 1.0 | 稳定插件协议、配置/状态迁移、monorepo/worktree、长期兼容 | ✅ 当前源码 |
| 1.2 | 资产治理（`harness scan` 扫描+自愈）、Java/Maven 信号、skill 新鲜度与幽灵引用 | ✅ 当前源码 |
| 1.2.1 | 修复 onboard 反模式规则缺 fileGlob 导致扫描器崩溃（pre-commit 必失败） | ✅ 当前源码 |
| 1.3.0 | Auto-Skills 自动治理：`harness skill audit`（能力指纹/三层目录/应有现有对比/L1-L4 升级检测/疑似新领域）、`--generate` 自动创建缺失 Skill+注册索引、新领域检测→项目级 catalog 沉淀、`skill catalog list/add` | ✅ 当前源码 |
| 1.4.0 | **PRD 工作流默认启用**：feature gate 内置 PRD 检查（read-skill-prd/create-prd-doc/create-req-doc/req-doc-has-skill-table/user-confirmed），所有项目安装即触发；getGateChecks 按 id 去重 | ✅ 当前源码 |
| 1.5.0 | **Auto-Content 自动内容生成**：新增 `presets/skills/` 11 个元领域内容模板，`skill new`/`skill audit --generate` 渲染有实质内容的 SKILL.md（注入项目名/检测依据/权威文件）；`onboard --write` 安装后自动批量生成领域 Skill；无模板回退旧骨架 | ✅ 当前源码 |
| 1.6.0 | **自动化触发补全**：`ci github` 多档位 CI（PR 门禁/nightly cron/release tag）；`onboard` 自动生成 `lefthook.yml` + `ai/hooks/` AI 安全钩子 + 配置深度补全（profiles/coverage/risk/brain/syncCheck/generatedCheck） | ✅ 当前源码 |
| 1.7.0 | **Trust Kernel（可信内核）**：ChangeSnapshot（Task/Gate/Evidence/提交绑定同一快照）、Verifier Registry（`harness verify`，任意命令降级 diagnostic）、Task 强绑定（Taskless Gate 隔离）、手工证据收紧（success:null + `--approve`）、Node 化安全 Hook（`harness hooks doctor`）、独立仓自治理 + GitHub Ruleset `main-protection`；P1 引导体验（do/next 零认知路径 + setup 统一接入） | ✅ 已发布（2026-08-22） |
| 1.8.0 | **Guided UX + External Validation**：交互式 TUI（HTH-016）、Brain 检索 adapter 与评测框架（HTH-017，recall@10 基线 69% 可复现）、本地指标（HTH-019）、插件合同测试（HTH-021）、Tier A fixtures（HTH-018）、小白试点包（HTH-020）、双语核心文档 + Go/No-Go 报告（HTH-022） | 🔨 实施中（2026-08-22） |
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
- [x] Phase 0.5 Project Brain / Task Orchestrator
- [x] Phase 0.6 领域 Supervisor
- [x] Phase 0.7 Evidence / Recovery / Knowledge Loop
- [x] Phase 0.8 Agent adapters / MCP / TUI
- [x] Phase 1.0 稳定协议与迁移
- [x] Phase 1.2 资产治理：`harness scan`（skills/standards/agent/PRD/scenarios/索引 五维检查 + MUST/SHOULD/NICE 分级 + `--fix` L0 自愈 + `--check` CI 硬卡）
- [x] Phase 1.2 技术栈识别与 gap 信号扩展：pom.xml/build.gradle → Java/Spring Boot；Controller/Mapper/Flyway/*Test.java 信号
- [x] Phase 1.2 skill check --freshness：权威路径存在性 + gate 幽灵引用（read-skill-* 缺失检测）
- [x] v1.2.1 修复：onboard 生成的 anti-patterns 规则补全 fileGlob/excludeGlob；扫描器对缺失 fileGlob 兜底（`**/*`），pre-commit 不再崩溃
- [x] v1.3.0 Auto-Skills 自动治理：skill audit（能力指纹/三层目录/应有现有对比/L1-L4 升级检测/疑似新领域）、--generate 自动创建+注册索引、新领域检测→项目级 catalog 沉淀、skill catalog list/add
- [x] v1.4.0 PRD 工作流默认启用：feature gate 内置 PRD 检查（read-skill-prd/create-prd-doc/create-req-doc/req-doc-has-skill-table/user-confirmed），所有项目安装即触发；getGateChecks 按 id 去重
- [x] v1.5.0 Auto-Content 自动内容生成：`presets/skills/` 11 个元领域内容模板（api/data-model/payment/security/deployment/testing/frontend-style/i18n/events/observability/performance）；`skill new`/`skill audit --generate` 模板渲染有实质内容 SKILL.md（注入项目名/检测依据/权威文件）；`onboard --write` 安装后自动批量生成领域 Skill；无模板回退旧骨架
- [x] v1.6.0 自动化触发补全：`ci github` 多档位 CI（`harness.yml` PR 分工门禁 + `harness-nightly.yml` cron 定时 + `harness-release.yml` tag 触发）；`onboard` 自动生成 `lefthook.yml` + `ai/hooks/`（PreToolUse 拦截破坏性命令/PostToolUse 警告密钥）+ 配置深度补全（profiles/coverage/risk/brain/syncCheck/generatedCheck/evidence.autoVerify/supervisor）
- [x] v1.7.0 Trust Kernel：ChangeSnapshot / Verifier Registry / Task 强绑定 / Node Hook / 独立仓自治理 + Ruleset；P1 do/next + setup
- [ ] v1.8.0 剩余：Brain eval 达标（Recall@10≥90%，BM25/中文/符号检索）、Tier A nightly 14 天、外部试点执行（HTH-020 ≥10 人）、2.0.0-beta.1 发布决策复核（Go/No-Go：`docs/rfc/0003-release-gate.md`）
- [ ] 2.0.0 正式版：八项条件全部达标后重新评估（见 `docs/rfc/0003-release-gate.md` §5）
