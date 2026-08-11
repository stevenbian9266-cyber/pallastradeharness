---
layout: default
title: 命令参考
---
# 命令参考

| 命令 | 说明 |
|---|---|
| `harness init` | 生成 `harness.config.mjs` 骨架（`--preset` / `--tier` / `--ai` / `--team`） |
| `harness gate --task "..."` | 创建前置门禁（前缀自动判定类型） |
| `harness gate:status` | 当前 gate 状态（有效/过期） |
| `harness gate:clear --gate <ID> --clear <check-id>` | 清除单个 check |
| `harness gate:required` | 供 lefthook/CI 硬卡（无有效 gate → exit 1） |
| `harness gate:clean` | 清理过期 gate 文件 |
| `harness prd new/list/verify` | PRD 工作流（骨架创建 + 查重回写 + AC→测试校验） |
| `harness check --profile quick\|full` | 检查档案（变更感知：本地默认只扫 changed-files） |
| `harness doc-impact --base origin/main` | 知识同步门 |
| `harness scan-anti-patterns / scan-secrets / scan-degraded-loop` | 扫描器（供 lefthook staged_files 调用） |
| `harness doctor` | 项目体检 |
| `harness config:check` | 配置校验 + 默认值使用报告 |
| `harness plugins:list` | 列出已加载插件（check / scanner / preset） |
| `harness suggest` | 自学习建议（`--format json` / `--since-days N`） |
| `harness report` | 工程机制报告（gate 通过率 / 扫描趋势 / 文档资产） |
| `harness eval-ai / eval-scenarios / eval-llm` | AI 行为评估（GS 场景库） |
| `harness sync-check` | 知识同步评估门 |
| `harness generated:check` | 生成文件漂移检查 |
| `harness cache:clean` | 清理缓存 |
| `harness affected` | 变更影响分析 |
| `harness analyze` | 项目栈/层/差距分析（`--write` 生成配置草案） |

## 常用组合

```bash
# 一次任务全流程
npx harness gate --task "修复：xxx"
npx harness gate:clear --gate <ID> --clear cross-layer-search
npx harness check --profile quick
npx harness gate:status
```

## 扫描器独立 bin

- `harness-scan-anti-patterns` — 反模式扫描
- `harness-scan-degraded-loop` — AP-009 退化循环检测
- `harness-scan-secrets` — 密钥扫描
