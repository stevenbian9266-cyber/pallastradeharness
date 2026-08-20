# pallastrade-harness

面向 AI Agent 的软件开发生命周期治理和证据编排层：分阶段门禁、机器可读规范、实际开发监督、PRD 闭环与知识同步。**本地优先、Git-native、配置驱动、项目无关**——单层应用、Rails monorepo、任意语言栈都能接入。

> 分层架构：引擎层（确定性、零 LLM）+ 通用资产层（presets / rules / skills / templates，可被项目覆盖）+ 项目定制层（harness.config.mjs / ai/skills / harness/standards）。配置驱动、项目无关。

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

- 当前源码版本：`1.5.0`；`v1.5.0` tag 由 GitHub OIDC workflow 发布并生成 provenance
- 发布源：`github.com/stevenbian9266-cyber/pallastradeharness`（main 分支）
- 更新：`npm i -D pallastrade-harness@latest` 后 `npx harness doctor` 自检
- 无需 npm 发布的接入方式：`npm i -D github:stevenbian9266-cyber/pallastradeharness`（git 依赖）

> ⚠️ **npm 政策预警（2027-01 起）**：npm 已移除 Authenticator app（TOTP）2FA 选项，仅支持 Security key（WebAuthn）；且 bypass-token 将禁止直接发布。
> 本仓库已经使用 **trusted publishing（OIDC）**，不使用长期 npm token。发布顺序固定为：PR checks → merge main → tag → workflow → registry/provenance 验证。

### 版本记录

| 版本 | 亮点 |
|---|---|
| **v1.5.0** | **Auto-Content 自动内容生成**：领域 Skill 从“空骨架”变为“有实质内容”——新增 `presets/skills/` 11 个元领域内容模板（api/data-model/payment/security/deployment/testing/frontend-style/i18n/events/observability/performance），`skill new` / `skill audit --generate` 渲染模板并注入项目名/检测依据/权威文件 → 安装即得可直接使用的最佳实践基线（不再是占位符）；`harness onboard --write` 安装后自动检测技术栈并批量生成领域 Skill；无模板领域回退旧骨架（向后兼容）；`node --test` 132/132 通过 |
| **v1.4.0** | **PRD 工作流默认启用**：所有项目 feature 类 gate 内置 PRD 检查（read-skill-prd / create-prd-doc / create-req-doc / req-doc-has-skill-table / user-confirmed），一句话需求 → PRD 文档 → 用户确认 → 才实施；`getGateChecks` 按 id 去重（项目重复配置不重复）；`node --test` 114/114 通过 |
| **v1.3.0** | Auto-Skills 自动治理：新增 `harness skill audit`（技术栈/架构/领域词指纹 → 内置+项目+订阅三层目录匹配 → 应有 vs 现有对比 → MISSING/STALE/OK + 疑似新领域）；`--generate` 一键自动创建缺失 Skill（含权威文件素材）并注册索引；新领域增量检测（新增 `domain-*`/`modules/*`/`services/*` → 自动沉淀项目级 catalog 条目 → 自动建 Skill）；`skill catalog list/add`；L1-L4 升级检测（结构/权威路径/内容漂移 hash/元数据过期）；`node --test` 112/112 通过 |
| **v1.2.1** | 修复：onboard 生成的 `anti-patterns.json` 规则缺 `fileGlob` 导致扫描器 `globSync(undefined)` 崩溃、pre-commit 必失败；扫描器对缺失 `fileGlob` 防御性兜底（默认 `**/*`）；`node --test` 96/96 通过 |
| **v1.2.0** | 资产治理：新增 `harness scan`（skills/standards/agent/PRD/scenarios/索引 五维扫描 + MUST/SHOULD/NICE 分级 + `--fix` L0 自愈 + `--check` CI 硬卡）；Java/Maven 信号（pom.xml/build.gradle → Java/Spring Boot，Controller/Mapper/Flyway/*Test.java）；`skill check --freshness` 权威路径 + gate 幽灵引用；`node --test` 93/93 通过 |
| v1.1.3 | 依赖清理：glob ^11 → ^13（弃用/安全）；`node --test` 79/79 通过，`npm audit` 0 漏洞 |
| v1.1.2 | 新增 `harness review` 复盘驱动的规则自升级；通用化清理（去 PallasTrade 残留） |
| v1.1.1 | onboard 一键冷启动自动注册已装 skills；README 补齐 Auto-* 说明 |
| v1.1.0 | Auto-Standards / Auto-Skills / Auto-Docs 通用化内容供给 + onboard 冷启动 |

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

## Auto-Standards / Auto-Skills / Auto-Docs（通用化内容供给）

Harness 是"治理壳"，内容由 AI 生成、机制校验、人拍板。三个通用化命令让任意项目快速获得内容供给能力：

```bash
# Auto-Standards：读业务代码 → 规范缺口 → 起草包（AI 按 skill 补全 → validate → coverage）
npx harness standards gap                    # 哪些领域有代码但无规范
npx harness standards generate --write       # 生成规范骨架 + GENERATE-NOTES + 安装 standards-audit skill
npx harness standards validate               # schema 校验

# Auto-Skills：领域 Skill 自动生成 + 注册
npx harness skill new --domain catalog       # 创建 ai/skills/catalog/SKILL.md + 注册 AGENTS.md/ai README
npx harness skill check --freshness          # 结构/索引校验 + 权威路径新鲜度 + gate 幽灵引用

# Auto-Skills 自动治理（v1.3.0）：缺的自动补、有的自动查升级、新增领域自动发现
npx harness skill audit                      # 能力指纹 → 应有/现有对比 → MISSING/STALE/OK + 疑似新领域
npx harness skill audit --generate           # 一键自动创建缺失 Skill（含权威文件素材）+ 注册索引；新领域自动补项目级 catalog 条目
npx harness skill audit --check              # CI 硬卡：must 级缺失 → exit 1
npx harness skill catalog list|add           # 三层领域目录管理（内置/项目/订阅）

# Asset Governance：安装后扫描项目资产 + 自愈
npx harness scan                             # 扫描 skills/standards/agent/PRD/scenarios/索引 缺口
npx harness scan --fix                       # 自动补齐 L0 确定性项（ai/skills、ai/README、scenarios.json 等）
npx harness scan --check                     # CI 硬卡：must 级缺口 → exit 1

# Auto-Docs：知识文档起草（AI 起草 → 人确认 → 写回）
npx harness docs generate --asset README.md --write
npx harness docs template --copy             # 安装 PRD 模板
```

> 随包分发 4 个通用方法论 skill（`skills/`）：`harness-standards-audit`、`harness-skill-author`、`harness-prd`、`harness-docs`；
> 以及可插拔 PRD 模板（`templates/prd/`）。onboard/standards generate 会自动安装到项目 `ai/skills/`。

---

## 复盘驱动的规则自升级（harness review）

一次任务 / 事故 / 评审后沉淀通用规则：AI 写复盘文档 → 对比规则库 → 输出提案 → 写回通用规则库，把经验固化为可执行规则。

```bash
npx harness review new                      # 生成复盘骨架（harness/reviews/REVIEW-YYYYMMDD.md）
# 在文档 "## 可沉淀规则" 段按机器可解析格式填写 H1..Hn（kind / target / priority / pattern / fix / rule ...）
npx harness review propose --path <md>      # 解析复盘 → 对比规则库 → 提案（新增 / 更新 / 跳过）
npx harness review apply   --path <md>      # 写回 rules/base-*.json（--only H1,H2 过滤 / --dry-run 预览）
npx harness review status                   # 列出已有复盘文档
```

> `engine` / `docs` 类提案不自动改包，输出"待人工/发版"清单，由维护者处理。

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
| `harness scan [--fix] [--check] [--json] [--category <id>]` | 资产治理：扫描 skills/standards/agent/PRD/scenarios/索引 + 自愈（MUST/SHOULD/NICE 分级；`--fix` 自动补齐 L0 确定性项；`--check` CI 硬卡） |
| `harness doctor` | 项目体检 |
| `harness config:check` | 配置校验 + 报告引擎默认值使用情况 |
| `harness plugins:list` | 列出已加载的插件（check / scanner / preset） |
| `harness suggest` | 自学习：分析 gate/扫描历史，建议沉淀规则或升级档位 |
| `harness review new/propose/apply/status` | 复盘驱动的规则自升级：复盘文档 → 规则提案 → 写回通用规则库 |
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
