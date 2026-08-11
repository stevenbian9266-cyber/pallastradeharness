---
layout: default
title: 迁移到 1.0
---
# 迁移到 Harness 1.0

1.0 保留既有 Gate、scanner、PRD 和 supervisor 命令，同时增加持久 Task、Project Brain、风险、证据、恢复、知识闭环、Agent adapter 与 MCP。

## 推荐迁移顺序

```bash
npm i -D pallastrade-harness@^1.0.0
npx harness config:migrate
npx harness state:migrate
# 审阅 dry-run 后：
npx harness config:migrate --write
npx harness state:migrate --write
npx harness config:check
npx harness doctor
```

写入迁移前会在原文件旁创建 `.pre-harness-1.0.bak` 备份；重复执行是幂等的。高于当前支持版本的配置/状态会拒绝加载，不会静默降级。

## 需要提交的内容

- 提交 `harness.config.mjs`、规范、策略、Agent 指令和 CI 工作流。
- 不提交 `.harness-state/`、`.harness-cache/` 和临时 Gate。
- 需要审计或交付时，用 `evidence bundle` 导出到项目配置的证据目录，再决定是否纳入制品。

## 行为变化

- Task-bound Gate 的 `verify-test` 不能手工清除，只能由 `evidence verify` 在证据有效时完成。
- 证据会在 HEAD、worktree、工作区内容变化后变为 stale，必须重新采集。
- 风险引擎自动结果只升级；显式降级必须提供理由并留下决策记录。
- 插件应声明 `manifest.apiVersion: '1.0'`。旧 `0.x` 插件暂时兼容并产生警告。

## CI 可选生成

`npx harness ci github` 默认展示将生成的矩阵；确认后用 `--write` 写入工作流。生成器不会更改仓库设置或分支保护，这些仍需维护者在 GitHub 上显式配置。

