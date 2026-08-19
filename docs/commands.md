---
layout: default
title: 命令参考
---
# 命令参考

| 命令 | 说明 |
|---|---|
| `harness init` | 生成 `harness.config.mjs` 骨架（`--preset` / `--tier` / `--ai` / `--team`） |
| `harness gate --task "..."` | 创建分阶段门禁（前缀自动判定类型） |
| `harness gate:status` | 当前 preparation / implementation / finished 状态（有效/过期） |
| `harness gate:clear --gate <ID> --clear <check-id>` | 清除单个 check |
| `harness gate:migrate [--dry-run]` | 将旧 Gate 迁移为分阶段生命周期 |
| `harness gate:required` | 供 lefthook/CI 硬卡（未完成 verification → exit 1） |
| `harness gate:clean` | 清理过期 gate 文件 |
| `harness standards list [--category x] [--json]` | 列出机器可读规范 |
| `harness standards select [--base ref] [--files ...] [--json]` | 根据 Diff/文件选择适用规范 |
| `harness standards coverage [--json]` | 报告机器执行、Review、仅文档覆盖率 |
| `harness supervise plan --task <text> [--allow ...] [--deny ...]` | 输出 Risk + Change Plan + 必需规范/证据 |
| `harness supervise diff [--base ref] [--plan path] [--json]` | 执行范围、依赖、架构、循环和新代码质量监督 |
| `harness supervise review [--base ref] [--json]` | 执行 Database/API/Security/UI/Interaction/A11y/Knowledge 专项监督 |
| `harness task start/status/checkpoint/resume/handoff/finish/abandon` | 持久任务状态机、检查点和跨 Agent 交接 |
| `harness brain index/context/decision/status` | 项目画像、知识索引、最小上下文和决策记录 |
| `harness risk check` | Quick / Standard / Critical 风险复评；自动判断只允许升级 |
| `harness evidence run/record/list/verify/bundle/report` | 采集、验证与交付绑定代码状态的类型化证据 |
| `harness recovery create/status/verify` | Critical 任务的人工恢复预案与检查点 |
| `harness knowledge assess/status/verify` | 对受影响知识资产作显式闭环评估 |
| `harness adapter generate` | 为 Codex/Claude/Copilot/Cursor/generic 生成受控策略块（默认 dry-run） |
| `harness mcp` | 启动无任意 shell 能力的 stdio MCP 服务 |
| `harness tui [--json] [--watch]` | 展示任务、风险、Gate、证据和下一步动作 |
| `harness config:migrate / state:migrate` | dry-run 优先迁移至 1.0 schema；`--write` 后自动备份 |
| `harness ci github` | 生成确定性的 GitHub Actions 检查矩阵，不修改分支保护 |
| `harness skill catalog list\|add` | Auto-Skills：三层领域目录管理（内置基线 / 项目 `harness/catalog/*.json` / 订阅；`add --path <json>` 本地订阅） |
| `harness prd new/list/verify` | PRD 工作流（骨架创建 + 查重回写 + AC→测试校验） |
| `harness check --profile quick\|full` | 检查档案（变更感知：本地默认只扫 changed-files） |
| `harness doc-impact --base origin/main` | 知识同步门 |
| `harness docs:check [--json]` | 检查 Agent/README/文档站 Markdown 的本地链接目标；断链返回 exit 1 |
| `harness scan-anti-patterns / scan-secrets / scan-degraded-loop` | 扫描器（供 lefthook staged_files 调用） |
| `harness doctor` | 项目体检 |
| `harness config:check` | 配置校验 + 默认值使用报告 |
| `harness plugins:list` | 列出已加载插件（check / scanner / preset） |
| `harness suggest` | 自学习建议（`--format json` / `--since-days N`） |
| `harness report` | 工程机制报告（gate 通过率 / 扫描趋势 / 文档资产） |
| `harness eval-ai / eval-scenarios / eval-llm` | AI 行为评估（GS 场景库） |
| `harness sync-check [--id ID] [--base ref]` | 知识同步评估门；`--base` 可将评估限定到当前任务基线 |
| `harness generated:check` | 生成文件漂移检查 |
| `harness cache:clean` | 清理缓存 |
| `harness affected` | 变更影响分析 |
| `harness analyze` | 项目栈/层/差距分析（`--write` 生成配置草案；支持 Java/Maven/Gradle/Spring Boot 识别） |
| `harness onboard [--write] [--preset auto\|nextjs\|rails\|single\|monorepo] [--tier lite\|standard\|strict]` | 冷启动：从 0 / 存量项目一键接入（配置 + policies + 通用 skills + PRD 模板 + 规范骨架） |
| `harness standards gap` | Auto-Standards：领域代码 vs 规范覆盖缺口报告（含 Java/Maven 信号） |
| `harness standards validate` | Auto-Standards：规范文件 schema 校验 |
| `harness standards generate [--domains ...] [--write]` | Auto-Standards：生成规范起草包 + 安装 standards-audit skill（dry-run 优先） |
| `harness skill new --domain <x> [--title ...]` | Auto-Skills：创建领域 Skill 骨架 + 自动注册索引 |
| `harness skill check [--freshness]` | Auto-Skills：结构 + 索引一致性校验；`--freshness` 追加权威路径新鲜度 + gate 幽灵引用检测 |
| `harness skill list [--format json]` | Auto-Skills：领域清单 |
| `harness skill audit [--json\|--generate\|--check]` | Auto-Skills 自动治理（v1.3.0）：技术栈/架构/领域词能力指纹 → 三层目录匹配 → 应有 vs 现有对比 → MISSING/STALE/OK + 疑似新领域；`--generate` 自动创建缺失 Skill 并注册索引（新领域自动补项目级 catalog 条目）；`--check` CI 硬卡 must 级缺失 |
| `harness skill catalog list\|add` | Auto-Skills：三层领域目录管理（内置基线 / 项目 `harness/catalog/*.json` / 订阅；`add --path <json>` 本地订阅） |
| `harness scan [--fix] [--check] [--json] [--category <id>]` | 资产治理：扫描 skills/standards/agent/PRD/scenarios/索引 + 自愈（`--fix` 自动补齐 L0 确定性项；`--check` CI 硬卡 must 级缺口；MUST/SHOULD/NICE 分级） |
| `harness docs generate --asset <path> [--write]` | Auto-Docs：知识文档起草包（AI 起草 + 人确认） |
| `harness docs template --copy [--preset x]` | Auto-Docs：安装 PRD 模板到 `docs/prd/_TEMPLATE.md` |

## 常用组合

```bash
# 一次可恢复、可审计的任务全流程
npx harness task start --title "修复：xxx" --allow "src/**"
npx harness brain context --task <TASK-ID>
npx harness risk check --task <TASK-ID>
npx harness gate --task "修复：xxx" --task-id <TASK-ID>
# 清空 Gate 输出中的 preparation checks 后进入 implementation
npx harness supervise plan --task "修复：xxx" --allow "src/**"
npx harness supervise diff
npx harness evidence run --task <TASK-ID> --type test -- npm test
npx harness knowledge assess --task <TASK-ID> --asset README.md \
  --status reviewed-no-change --reason "公共行为未变化"
npx harness knowledge verify --task <TASK-ID>
npx harness evidence verify --task <TASK-ID> --gate <GATE-ID>
npx harness task finish --task <TASK-ID>
npx harness gate:status
```

## 退出码

| 代码 | 含义 |
|---:|---|
| 0 | 命令成功；或 Gate 已允许当前生命周期动作 |
| 1 | 质量/策略失败，例如阻塞 Finding、未完成 preparation、测试证据不足 |
| 2 | 调用、配置、插件或 Git 上下文错误 |
| 3 | Harness 内部错误 |

`--json` 命令只在 stdout 输出 JSON；诊断信息进入 stderr。

## 扫描器独立 bin

- `harness-scan-anti-patterns` — 反模式扫描
- `harness-scan-degraded-loop` — AP-009 退化循环检测
- `harness-scan-secrets` — 密钥扫描
