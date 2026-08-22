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

## 2. 初始化（推荐 `setup`）

```bash
npx harness setup --dry-run          # 先看将创建/修改什么（永远可用）
npx harness setup --preset single --tier lite --name my-app   # 正式接入
```

`setup` 是唯一推荐入口；`init` / `onboard` 保留为兼容别名。交互式向导生成 `harness.config.mjs` 骨架。也可以直接指定 preset / 档位：

```bash
npx harness setup --preset nextjs --tier standard
npx harness setup --preset rails --tier lite
```

可用 preset：`single` / `nextjs` / `rails` / `monorepo`

## 3. 体检

```bash
npx harness doctor     # 项目缺什么
npx harness config:check   # 配置校验
```

## 4. 零认知路径（推荐新手，HTH-013）

不需要理解 Task ID / Gate ID / check ID——只需要两个命令：

```bash
npx harness next          # 永远告诉你下一步该做什么
npx harness do "优化：我的需求"   # 一句话开始（有活动任务时引导下一步）
```

`harness next --json` 返回稳定结构，供工具/脚本消费：

```json
{ "taskId": "...", "gateId": "...", "phase": "no-task|no-gate|preparation|verification|finish",
  "blockingReason": "...", "nextAction": "...", "commands": ["..."], "humanDecisionRequired": true }
```

### 交互式任务视图（HTH-016）

在终端直接运行 `npx harness tui`（无需参数）进入交互模式：

```
> TASK-...  implementing  evidence:3  优化：交互式 TUI
  TASK-...  planned       evidence:0  新增：支付网关
↑/↓ navigate · Enter detail · r refresh · q quit
```

- **↑/↓** 移动光标；**Enter** 查看任务详情（goals / acceptance criteria / blockers / evidence / nextAction）
- 详情页按 **Enter** 直接执行下一步 CLI 命令；**b** 返回列表；**q** 退出
- 非 TTY（管道/CI）自动回退静态输出；`--json` / `--watch` 等价物保持不变
- **所有交互动作均有 CLI/JSON 等价物**：查看详情 = `harness task status --task <id> --json`；执行动作 = nextAction 本身即 CLI 命令

### Brain 检索与离线评测（HTH-017）

检索已索引的项目知识资产（AGENTS / Skills / PRD / RFC / 需求文档等）：

```bash
npx harness brain index                         # 先建立知识索引
npx harness brain query --query "change snapshot 证据 freshness" --top 10
npx harness brain query --query "支付流程" --top 5 --json
```

离线评测检索质量（Recall@K 与必需资产遗漏率，确定性可复现）：

```bash
npx harness brain eval                          # 内置 50 查询评测集（presets/brain-eval/default.json）
npx harness brain eval --file my-queries.json   # 自定义评测集（[{query, requiredAssets:[...]}]
npx harness brain eval --top 5 --json           # 机器可读报告
```

## 5. 标准编码任务（完整生命周期）

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

## 6. 接入 lefthook（物理强制）

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

## 7. 渐进式档位

| 档位 | 适用 | 特点 |
|---|---|---|
| Lite | 个人/原型 | 基础 gate + 扫描 |
| Standard | 团队 | + PRD 工作流 + doc-impact |
| Strict | 关键系统 | + 全量 check + 覆盖率门槛 |

`harness suggest` 会从使用历史里建议何时升级档位。
