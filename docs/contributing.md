---
layout: default
title: 贡献指南
---
# 贡献指南

欢迎贡献规则、插件、preset、文档与引擎代码。所有贡献走 GitHub PR（`main` 分支）。

## 开发环境

```bash
git clone https://github.com/stevenbian9266-cyber/pallastradeharness.git
cd pallastrade-harness
npm i && npm test          # node:test 合约测试必须全绿
node --check bin/*.mjs     # 语法自检
```

## 引擎代码规范

- `bin/config-loader.mjs` 是**唯一配置入口**（`loadConfig` 带进程内 memo）——新命令不要自行解析配置
- 命令注册在 `bin/harness.mjs`，新增命令同步更新 `docs/commands.md`
- 纯分析命令（suggest/report）不改文件；有副作用命令需有 `--dry-run` 或明确输出
- 合约测试放 `bin/*.test.mjs`（node:test），新模块至少覆盖正常/边界/错误三条路径

## 贡献规则

1. 确认规则**通用**（不绑定特定框架/业务）
2. 加入 `rules/base-anti-patterns.json`（id `STARTER-00X` 递增），遵循 [schema](rules.md)
3. 提供真实场景反例（PR 描述贴代码）
4. 更新 `docs/rules.md` 规则清单

## 贡献插件 / preset

1. 插件协议见 [插件开发](plugins.md)；通用插件做成示例放 `harness/plugins/`（参考 `example.mjs`）
2. preset 放 `presets/`，遵循 `{ id, name, layers, gates?, docImpact }` 导出格式
3. 提供 `plugins:list` / `init --preset <id>` 可用验证用例

## 发布（维护者）

### 手动发布（当前方式）

```bash
git tag v0.x.y && git push --tags
npm publish    # 浏览器 Security key (WebAuthn) 认证——需维护者本人操作
```

> ⚠️ **npm 政策（2027-01 起）**：npm 仅支持 Security key (WebAuthn) 2FA；bypass-token 将禁止直接发布。

### trusted publishing（OIDC，推荐，已就绪）

`publish.yml` 已就绪（推送 `v*` tag 自动发布，**纯 OIDC 无需 token**，自动 provenance）。一次性配置：

1. **npm 网站** → `Packages` → `pallastrade-harness` → **Settings** → **Trusted Publisher**
2. 选 **GitHub Actions**，填写：Organization/user `stevenbian9266-cyber` · Repository `pallastradeharness` · Workflow filename `publish.yml` · Allowed actions `npm publish`
3. 保存后推送 `v*` tag 即自动发布（npm CLI 自动 OIDC 认证 + 自动 provenance）

> 前提：GitHub-hosted runner；`id-token: write`（已配置）；Node 22.14+/npm 11.5.1+（workflow 用 Node 24）。字段大小写需与 npm 配置精确一致。

## 行为准则

- 保持引擎**项目无关**：包内不得保留任何具体项目的品牌/表名/密钥格式/路径耦合（presets 仅通用模板；规则库示例用通用措辞；代码路径解析由项目 config 驱动）。
- 不引入新运行时依赖（引擎只依赖 `glob`）
- 破坏性变更需在 PR 描述标注，并同步 `docs/roadmap.md`
