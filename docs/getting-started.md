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

可用 preset：`single` / `nextjs` / `rails` / `monorepo` / `pallastrade`

## 3. 体检

```bash
npx harness doctor     # 项目缺什么
npx harness config:check   # 配置校验
```

## 4. 开始一次编码任务

```bash
npx harness gate --task "新增：我的功能"
# ... 清空 preparation checks ...
npx harness gate:clear --gate <GATE-ID> --clear <check-id>

# 生成允许/禁止修改范围与适用规范
npx harness supervise plan --task "新增：我的功能" --allow "src/**" "test/**"

# 实施中和实施后检查 Diff
npx harness supervise diff
npx harness standards coverage

# 客观验证完成后关闭 verification；此时提交门才放行
npx harness gate:clear --gate <GATE-ID> --clear verify-test --note "tests passed"
```

任务前缀自动判定类型（feature/bugfix/style/docs/audit/research/refactor/security/test）。Gate 生命周期为 preparation → implementation → verification → finished；旧 Gate 可用 `npx harness gate:migrate` 转换。

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
