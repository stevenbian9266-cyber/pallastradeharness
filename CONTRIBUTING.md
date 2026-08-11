# 贡献指南

欢迎贡献规则、插件、preset、文档与引擎代码。所有贡献走 GitHub PR（`main` 分支）。

## 开发环境

```bash
git clone https://github.com/stevenbian9266-cyber/pallastradeharness.git
cd pallastrade-harness
npm i
npm test          # node:test 合约测试必须全绿
node --check bin/*.mjs   # 语法自检
```

## 代码规范（引擎）

- `bin/config-loader.mjs` 是**唯一配置入口**（`loadConfig` 带进程内 memo）——新命令不要自行解析配置，一律 `import { loadConfig } from './config-loader.mjs'`
- 命令注册在 `bin/harness.mjs`，新增命令同时更新 `docs/commands.md` 与 README 命令表
- 纯分析命令（如 suggest/report）不改文件；有副作用的命令需有 `--dry-run` 或明确输出
- 合约测试放 `bin/*.test.mjs`（node:test），每个新模块至少覆盖正常/边界/错误三条路径

## 贡献规则（rules/）

1. 确认规则**通用**（不绑定特定框架/业务）——项目特定规则留在用户项目 `harness/policies/anti-patterns.json`
2. 加入 `rules/base-anti-patterns.json`（id 用 `STARTER-00X` 递增），遵循 schema（`id/severity/pattern/fileGlob/excludeGlob?/message/fix`）
3. 提供一条真实场景反例（PR 描述里贴代码）
4. 更新 `docs/rules.md` 规则清单

## 贡献插件 / preset

1. 插件协议见 `docs/plugins.md`；把通用插件做成**示例**放进 `harness/plugins/`（参考 `example.mjs`）
2. preset 放进 `presets/`，遵循 `{ id, name, layers, gates?, docImpact }` 导出格式
3. 至少提供一个 `plugins:list` / `init --preset <id>` 可用的验证用例

## 贡献文档

- 文档站：`docs/`（GitHub Pages + Jekyll，改 `docs/**` 自动部署）
- 同步更新：`README.md` 命令表 / 发布信息、`docs/commands.md` 等
- 版本记录：roadmap 变更追加到 `docs/roadmap.md`

## 发布（维护者）

### 手动发布（当前方式）

```bash
# 1. semver bump（feature/修复 → minor/patch；破坏性 → major）
# 2. 更新 README 发布信息 + docs/roadmap.md
git tag v0.x.y && git push --tags
npm publish    # 浏览器 Security key (WebAuthn) 认证——需维护者本人操作
```

> ⚠️ **npm 政策（2027-01 起）**：npm 已移除 Authenticator app (TOTP) 2FA 选项，仅支持 Security key (WebAuthn)；bypass-token 将禁止直接发布。

### trusted publishing（OIDC，推荐迁移）

`publish.yml` 已就绪（推送 `v*` tag 自动发布 + provenance）。一次性配置：

1. **npm 网站**：登录 → 你的组织/账号 → `Access Tokens` → **Add new token → Granular Access Token** → 选择本仓库 → 勾选 **Publish packages** 权限（`packages:write`）
2. **npm 授权**：在 token 创建流程中把 GitHub 仓库 `stevenbian9266-cyber/pallastradeharness` 加入授权（trusted publishing 绑定 repo → OIDC 自动认证）
3. **GitHub**：仓库 Settings → Secrets and variables → Actions → 添加 `NPM_TOKEN`（第二步生成的 token 值）
4. **验证**：推送一个 `v*` tag，`publish.yml` 应自动发布（`--provenance` 生成来源证明）

> 说明：`NPM_TOKEN` 目前仍用于兼容；trusted publishing 完全启用后，可移除 token 让 OIDC 直接认证。GitHub Pages 发布后请把仓库 Settings → Pages → Source 设为 **GitHub Actions**。

## 行为准则

- 保持引擎**项目无关**：`grep -ri pallastrade bin/ presets/` 应仅命中注释/测试/预设示例
- 不引入新运行时依赖（引擎只依赖 `glob`）
- 破坏性变更需在 PR 描述标注，并同步 `docs/roadmap.md`
