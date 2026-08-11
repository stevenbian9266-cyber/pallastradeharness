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

### trusted publishing（OIDC，推荐，已就绪）

`publish.yml` 已就绪（推送 `v*` tag 自动发布，**纯 OIDC 无需 token**，自动生成 provenance）。一次性配置：

1. **npm 网站** → 登录 → `Packages` → 选择 `pallastrade-harness` → **Settings** → 找到 **Trusted Publisher** 区块
2. **Select your publisher** → 选 **GitHub Actions**，填写：
   - Organization or user: `stevenbian9266-cyber`
   - Repository: `pallastradeharness`
   - Workflow filename: `publish.yml`
   - Allowed actions: 勾选 `npm publish`
3. 保存（npm 不验证配置，填错会在发布时报错——注意字段大小写必须精确一致）
4. **验证**：推送 `v*` tag，`publish.yml` 自动发布（npm CLI 自动用 OIDC 认证 + 自动 provenance，无需 `NPM_TOKEN`）

> 前提：GitHub Actions 使用 **GitHub-hosted runner**；workflow 需 `id-token: write`（已配置）。Node 需 22.14+/npm 11.5.1+（workflow 已用 Node 24）。
> 若未来配置了 `NPM_TOKEN` 也不冲突——npm CLI 优先使用 OIDC，token 仅作回退。
> 可选加固：Trusted Publisher 配置为 `npm stage publish`（staged publishing，需维护者 2FA 审批后公开）——见 [staged publishing](https://docs.npmjs.com/staged-publishing)。

## 行为准则

- 保持引擎**项目无关**：`grep -ri pallastrade bin/ presets/` 应仅命中注释/测试/预设示例
- 不引入新运行时依赖（引擎只依赖 `glob`）
- 破坏性变更需在 PR 描述标注，并同步 `docs/roadmap.md`
