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
| `harness analyze` | 项目栈/层/差距分析（`--write` 生成配置草案） |

## 常用组合

```bash
# 一次任务全流程
npx harness gate --task "修复：xxx"
npx harness gate:clear --gate <ID> --clear search-app
npx harness supervise plan --task "修复：xxx" --allow "src/**"
# preparation 全部完成后 gate:status 返回 0，进入 implementation
npx harness supervise diff
npx harness check --profile quick
npx harness gate:clear --gate <ID> --clear verify-test --note "tests passed"
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
