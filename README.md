# pallastrade-harness

面向 AI Agent 的软件开发生命周期治理和证据编排层：分阶段门禁、机器可读规范、实际开发监督、PRD 闭环与知识同步。**本地优先、Git-native、配置驱动、项目无关**——单层应用、Rails monorepo、任意语言栈都能接入。

> 源自 [PallasTrade Commerce](https://github.com/stevenbian9266-cyber/pallastrade) monorepo 的 `scripts/harness`，2026-08 完成引擎/配置解耦后独立维护。

---

## 它解决什么问题

| 痛点 | 机制 |
|---|---|
| AI 跨会话后丢失目标和上下文 | **Task Orchestrator + Project Brain**：状态、检查点、最小上下文和 Agent 交接包 |
| AI 改代码不受控、绕过规范 | **前置 Gate**：改代码前必须规划并清空检查清单，pre-commit 物理拦截 |
| 规范写了但无法知道是否执行 | **Standards Registry**：标准 ID、权威来源、scope、执行等级和覆盖率均可查询 |
| 实际编码偏离计划或产生复杂/重复代码 | **Development Supervisor**：范围漂移、依赖选型、架构边界、循环依赖和新代码基线检查 |
| 反模式反复出现（内联样式/裸 fetch/硬编码色值） | **反模式扫描**：规则 JSON 驱动，CI + pre-commit 双卡 |
| 需求一句话 → 实施无依据 | **PRD 工作流**：一句话需求 → 结构化 PRD → AC→测试映射 → 验收 |
| 改了代码忘了同步文档 | **知识同步门（doc-impact）**：改了什么文件，强制同步对应知识文档 |
| 密钥/危险命令被提交 | **密钥 + 危险命令扫描**：agent 无关（Copilot/Codex/Claude/人 都拦截） |
| 规范第一天写不全 | **渐进式落地**：Lite → Standard → Strict 档位，`harness doctor` 提示下一步 |
| “测试过了”无法复核 | **Typed Evidence + Recovery**：证据绑定 HEAD/worktree/hash，高风险任务必须有恢复计划 |

---

## 快速开始

```bash
# 安装（已发布至 npm registry）
npm i -D pallastrade-harness
# 或升级到最新版
npm i -D pallastrade-harness@latest

# 初始化项目配置（生成 harness.config.mjs 骨架）
npx harness init

# 体检：看项目缺什么
npx harness doctor

# 校验配置
npx harness config:check

# 建立持久任务、最小上下文和任务绑定 Gate
npx harness task start --title "新增：我的功能" --allow "src/**"
npx harness brain context --task <TASK-ID>
npx harness gate --task "新增：我的功能" --task-id <TASK-ID>
# ... 清空 preparation checks 后进入 implementation ...
npx harness gate:clear --gate <GATE-ID> --clear <check-id>

# 生成 Change Plan，并在实施中/实施后审查 diff
npx harness supervise plan --task "新增：我的功能" --allow "src/**"
npx harness supervise diff

# 运行并记录证据；知识评估和证据齐全后自动完成 verify-test
npx harness evidence run --task <TASK-ID> --type test -- npm test
npx harness knowledge assess --task <TASK-ID> --asset README.md \
  --status reviewed-no-change --reason "公共行为未变化"
npx harness knowledge verify --task <TASK-ID>
npx harness evidence verify --task <TASK-ID> --gate <GATE-ID>
npx harness task finish --task <TASK-ID>

# 查看适用规范与机器执行覆盖率
npx harness standards select --base origin/main
npx harness standards coverage
npx harness docs:check

# 提交前物理拦截（接入 lefthook）
```

### 发布信息

- 当前源码版本：`1.0.3`；`v1.0.3` tag 由 GitHub OIDC workflow 发布并生成 provenance
- 发布源：`github.com/stevenbian9266-cyber/pallastradeharness`（main 分支）
- 更新：`npm i -D pallastrade-harness@latest` 后 `npx harness doctor` 自检
- 无需 npm 发布的接入方式：`npm i -D github:stevenbian9266-cyber/pallastradeharness`（git 依赖）

> ⚠️ **npm 政策预警（2027-01 起）**：npm 已移除 Authenticator app（TOTP）2FA 选项，仅支持 Security key（WebAuthn）；且 bypass-token 将禁止直接发布。
> 本仓库已经使用 **trusted publishing（OIDC）**，不使用长期 npm token。发布顺序固定为：PR checks → merge main → tag → workflow → registry/provenance 验证。

### 接入 lefthook（物理强制）

`lefthook.yml`：

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

---

## 核心概念

### 配置（`harness.config.mjs`）

引擎通用，项目通过配置声明自身结构。所有字段可选（有引擎默认值）：

```js
export default {
  schemaVersion: '1.0',
  name: 'my-project',
  // 层定义：gate 跨层搜索来源
  layers: [{ id: 'app', path: 'app' }, { id: 'web', path: 'src' }],
  // 门禁：追加项目特定 check
  gates: { checkDefs: { feature: [{ id: 'my-check', label: '...' }] } },
  // 规范注册表：内置 starter + 项目规范文件
  standards: { includeBundled: true, sources: ['harness/standards/**/*.json'] },
  // 开发监督：模式、范围保护、依赖清单、复杂度与架构边界
  supervisor: {
    mode: 'guard',
    protectedFiles: ['**/db/schema.rb', '**/Gemfile.lock'],
    generatedFiles: ['src/types/generated/**'],
    complexity: { maxDecisionPoints: 12, duplicateBlockLines: 6 },
    boundaries: [{ id: 'ui-server', from: 'src/ui/**', denyImports: ['../server/**'] }],
  },
  // 知识同步规则（改了什么 → 必须同步什么文档）
  docImpact: { base: 'origin/main', rules: [{ codeGlob: /^src\/.*\.ts$/, docs: ['docs/README.md'], label: '...' }] },
  // 覆盖率
  coverage: { thresholds: {}, targets: [] },
  // 扫描器规则文件
  scanners: { antiPatterns: 'harness/policies/anti-patterns.json' },
  // 状态/产物路径
  paths: { gates: 'harness/gates', requirements: 'harness/requirements', prd: 'docs/prd', state: '.harness-state' },
};
```

### 命令一览

| 命令 | 说明 |
|---|---|
| `harness init` | 生成 `harness.config.mjs` 骨架（向导版规划中） |
| `harness gate --task "..."` | 创建分阶段门禁（preparation → implementation → verification → finished） |
| `harness gate:status / gate:clear / gate:migrate / gate:required / gate:clean` | 门禁状态与旧 Gate 迁移；只有绑定当前分支和 HEAD 的 finished Gate 能通过提交硬卡，提交后不可复用 |
| `harness standards list/select/coverage` | 查询、按 Diff 选择规范并报告 Standards Enforcement Coverage |
| `harness supervise plan/diff` | 生成 Change Plan；审查范围漂移、技术选型、架构和新代码质量 |
| `harness task start/status/checkpoint/resume/handoff/finish/abandon` | 可恢复的任务状态机与跨 Agent 交接 |
| `harness brain index/context/decision/status` | 项目画像、知识索引、最小上下文与决策记录 |
| `harness risk check` | Quick/Standard/Critical 风险复评；默认只能升级 |
| `harness supervise review` | Database/API/Security/UI/Interaction/A11y/Knowledge 专项审查 |
| `harness evidence run/record/list/verify/bundle/report` | 采集、验证和汇总与代码状态绑定的 typed evidence |
| `harness recovery create/status/verify` | Critical 任务的 manual-only 恢复检查点 |
| `harness knowledge assess/status/verify` | `updated / reviewed-no-change / not-applicable` 知识闭环 |
| `harness adapter generate / mcp / tui` | 多 Agent 策略适配、stdio MCP 与本地状态面板 |
| `harness config:migrate / state:migrate / ci github` | 1.0 迁移与可选 GitHub checks 生成 |
| `harness prd new/list/verify` | PRD 工作流（骨架创建 + 查重回写 + AC→测试校验） |
| `harness check --profile quick\|full` | 检查档案（变更感知：本地默认只扫 changed-files，`--full`/CI 全量） |
| `harness doc-impact` | 知识同步门 |
| `harness docs:check` | 检查 Agent/README/文档站 Markdown 的本地链接目标 |
| `harness scan-anti-patterns / scan-secrets / scan-degraded-loop` | 扫描器（供 lefthook staged_files 调用，也可用 `harness-scan-*` bin） |
| `harness doctor` | 项目体检 |
| `harness config:check` | 配置校验 + 报告引擎默认值使用情况 |
| `harness plugins:list` | 列出已加载的插件（check / scanner / preset） |
| `harness suggest` | 自学习：分析 gate/扫描历史，建议沉淀规则或升级档位 |
| `harness report` | 工程机制报告（gate 通过率 / 扫描趋势 / 文档资产，`--format json`） |
| `harness eval-ai / eval-scenarios / eval-llm` | AI 行为评估（GS 场景库） |
| `harness sync-check` | 知识同步评估门 |
| `harness generated:check` | 生成文件漂移检查 |
| `harness cache:clean` | 清理缓存 |

插件或 Agent 适配器可通过公开子路径 `pallastrade-harness/contracts`、`pallastrade-harness/standards`、`pallastrade-harness/supervisor` 与 `pallastrade-harness/gate-lifecycle` 复用版本化领域契约；未导出的 `bin/*` 仍视为内部实现。

### 任务类型与 check 清单

`harness gate` 根据前缀自动判定任务类型，不同任务类型有不同检查清单：

| 前缀 | 类型 | check 特点 |
|---|---|---|
| `修复：` / `fix:` | bugfix | 跨层搜索 + 读领域 skill + 验证 |
| `优化：` / `新增：` | feature | 跨层搜索 + skill + PRD + 需求文档 + 用户确认 |
| `文档：` / `docs:` | docs | 跨层搜索 + 验证 |
| `重构：` / `refactor:` | refactor | 跨层搜索 + 验证 |
| `安全：` / `security:` | security | 跨层搜索 + 安全 skill + 验证 |
| ... | ... | ... |

## 插件开发（§2.3 插件协议）

通过统一接口扩展 harness，无需改引擎。插件导入失败或契约无效会以配置错误退出，不会静默跳过。两种加载方式：

1. **文件级**：项目 `harness/plugins/*.mjs`（推荐，随仓库分发）
2. **配置级**：`harness.config.mjs` → `plugins: { checks, scanners, presets }`

### Check 插件（进入 gate 检查清单 + `harness check` 执行）

```js
// harness/plugins/my-check.mjs
export default {
  manifest: {
    name: 'my-checks',
    apiVersion: '1.0',
    capabilities: ['checks'],
  },
  checks: [
    {
      id: 'no-todos',                       // gate 中显示为 plugin-no-todos
      label: 'No TODO/FIXME comments',
      run: async ({ rootDir, config, files }) => {
        const hits = [];
        // ... 检查 (files) 变更文件 ...
        return hits.length
          ? { pass: false, evidence: hits.join(', ') }
          : { pass: true, evidence: 'clean' };
      },
    },
  ],
};
```

### Scanner 插件（`harness check` 执行，违规 → 失败）

```js
export default {
  scanners: [
    {
      id: 'no-console',
      glob: '**/*.{ts,js}',
      run: async ({ rootDir, files }) => {
        const violations = [];
        // ... 扫描变更文件，返回 ["path:line: msg", ...]
        return violations;
      },
    },
  ],
};
```

### Preset（可被 `harness init --preset <id>` 引用）

```js
export default {
  presets: [
    { id: 'my-stack', name: 'My stack', layers: [{ id: 'src', path: 'src' }] },
  ],
};
```

### 验证插件

```bash
npx harness plugins:list      # 看插件是否被加载
npx harness check --profile quick   # 插件 check/scanner 会被执行
```

> 完整示例见仓库 `harness/plugins/example.mjs`。

---

## 基础规则集（starter rules）

仓库自带两份**跨语言、项目无关**的 starter 规则集。`harness init` 会自动复制且不覆盖项目已有文件：

```bash
# 复制到项目作为 anti-patterns 起点，再按项目裁剪
cp node_modules/pallastrade-harness/rules/base-anti-patterns.json \
   harness/policies/anti-patterns.json
cp node_modules/pallastrade-harness/rules/base-standards.json \
   harness/standards/base-standards.json
```

反模式集内置 5 条通用规则（`STARTER-001~005`）；规范注册表覆盖 architecture、technology-selection、code-quality、database、API、安全、UI、交互、a11y、测试、文档、知识和部署 13 个类别。
规则使用 RegExp `pattern` + `fileGlob`/`excludeGlob`，见文件头部 schema 注释。
项目特定规则（如「必须用 SDK 禁止裸 fetch」「禁止绕过 store scope」）由项目自行维护在 `harness/policies/anti-patterns.json`。

---

## 贡献指南

详细贡献流程（规则/插件/preset/引擎/发布）见 **[`CONTRIBUTING.md`](CONTRIBUTING.md)**。
快速入口：

- 贡献规则 → `rules/base-anti-patterns.json`（通用规则，id `STARTER-00X`）
- 贡献插件/preset → 协议见下文「插件开发」
- 发布 → `CONTRIBUTING.md` → 发布（含 trusted publishing OIDC 配置步骤）

---

## 文档站

完整文档（快速开始 / 配置参考 / 命令参考 / 插件 / 规则 / 贡献 / 路线图）见 GitHub Pages：

- **https://stevenbian9266-cyber.github.io/pallastradeharness/**
- 源文件在仓库 `docs/` 目录（改 `docs/**` 自动部署）

---

## 路线图

| Phase | 内容 | 状态 |
|---|---|---|
| 0.3 | 可靠性基线：跨平台参数、fail-closed、退出码、分阶段 Gate、统一对象 | ✅ 0.4 源码已包含 |
| 0.4 | Standards Registry + Development Supervisor MVP | ✅ 当前源码 |
| 0.5 | Task Orchestrator + Project Brain + 多会话交接 | ✅ 1.0 源码已包含 |
| 0.6 | Database/UI/Interaction/API/Security/Knowledge 领域 Supervisor | ✅ 1.0 源码已包含 |
| 0.7 | Typed Evidence + Recovery + 自动交付报告 | ✅ 1.0 源码已包含 |
| 0.8 | Agent adapters + MCP/TUI + 技术栈 preset | ✅ 1.0 源码已包含 |
| 1.0 | 插件稳定协议、配置/状态迁移、monorepo/worktree、长期兼容 | ✅ 当前源码 |

详见 [docs/standards/harness-standalone-roadmap.md](https://github.com/stevenbian9266-cyber/pallastrade/blob/dev/docs/standards/harness-standalone-roadmap.md)（PallasTrade 仓库）。

---

## 开发

```bash
git clone https://github.com/stevenbian9266-cyber/pallastradeharness.git
cd pallastrade-harness
npm i
npm test          # node:test contract tests
```

## License

MIT
