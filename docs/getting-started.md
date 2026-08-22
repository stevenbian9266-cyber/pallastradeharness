---
layout: default
title: 快速开始
---
# 快速开始

## 1. 安装

```bash
npm i -D pallastrade-harness
# 或升级到最新版
npm i -D pallastrade-harness@latest
```

无需 npm 发布的接入方式（git 依赖）：

```bash
npm i -D github:stevenbian9266-cyber/pallastradeharness
```

## 2. 初始化

```bash
npx harness init
```

交互式向导生成 `harness.config.mjs` 骨架。也可以直接指定 preset / 档位：

```bash
npx harness init --preset nextjs --tier standard
npx harness init --preset rails --tier lite --ai
```

可用 preset：`single` / `nextjs` / `rails` / `monorepo`

## 3. 体检

```bash
npx harness doctor     # 项目缺什么
npx harness config:check   # 配置校验
```

## 4. 开始一次编码任务

任务前缀自动判定类型（feature/bugfix/style/docs/audit/research/refactor/security/test）。Gate 生命周期为 preparation → implementation → verification → finished；**每个新 Gate 必须绑定一个 Task**（INV-03），verification 只能由 typed evidence 关闭（不可手工 clear `verify-test`）。

```bash
# 1. 创建/恢复任务（持久化任务状态）
npx harness task start --title "新增：我的功能" --allow "src/**"
# 记录任务 ID：TASK-XXXXXXXXXXXX-xxxxxxxx

# 2. 构建上下文并评估风险
npx harness brain context --task <TASK-ID>
npx harness risk check --task <TASK-ID>

# 3. 打开 Gate（绑定任务）
npx harness gate --task "新增：我的功能" --task-id <TASK-ID>
# ... 清理 preparation checks ...
npx harness gate:clear --gate <GATE-ID> --clear <check-id>

# 4. 生成允许/禁止修改范围与适用规范
npx harness supervise plan --task "新增：我的功能" --allow "src/**" "test/**"

# 5. 实施中与实施后检查
npx harness supervise diff
npx harness standards coverage

# 6. 客观验证（受信验证器注册表，HTH-005）
npx harness verify unit --task <TASK-ID>          # 已注册 test 验证器
npx harness evidence record --task <TASK-ID> --type review --summary "..." --approve
npx harness evidence record --task <TASK-ID> --type knowledge --summary "..." --approve

# 7. 关闭 verification（只能通过证据，HTH-007）
npx harness evidence verify --task <TASK-ID> --gate <GATE-ID>

# 8. 完成任务（须在提交/HEAD 移动之前）
npx harness task finish --task <TASK-ID>
```

> ⚠️ 过时用法（已被移除/禁止）：
> - 不带 `--task-id` 的 `harness gate`（无活动任务时会被拒绝）
> - `harness gate:clear --gate <GATE-ID> --clear verify-test`（verification 只能由 `evidence verify` 关闭）
> - 任意命令冒充测试：`evidence run --type test -- <任意命令>` 现在标记为 `diagnostic`，不满足 Gate；请用 `harness verify <verifier-id>`

## 5. 接入 lefthook（物理强制）

```yaml
pre-commit:
  commands:
    harness-gate:
      run: npx harness gate:required
    harness-anti-patterns:
      glob: "**/*.{rb,ts,tsx,js,jsx,css}"
      exclude: "**/node_modules/**|**/dist/**|**/.next/**"
      run: npx harness-scan-anti-patterns scan --files {staged_files}
    harness-secrets:
      glob: "**/*.{rb,ts,tsx,js,jsx,yml,yaml,env,sh}"
      exclude: "**/node_modules/**|**/dist/**|**/.next/**"
      run: npx harness-scan-secrets scan --files {staged_files}
pre-push:
  commands:
    harness-doc-impact:
      run: npx harness doc-impact --base origin/main
```

## 6. 渐进式档位

| 档位 | 适用 | 特点 |
|---|---|---|
| Lite | 个人/原型 | 基础 gate + 扫描 |
| Standard | 团队 | + PRD 工作流 + doc-impact |
| Strict | 关键系统 | + 全量 check + 覆盖率门槛 |

`harness suggest` 会从使用历史里建议何时升级档位。
