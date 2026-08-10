# pallastrade-harness

AI 时代的工程纪律机制（Engineering Harness）：前置门禁、反模式扫描、PRD 需求闭环、知识同步强制。**配置驱动、项目无关**——单层 Next.js 项目、Rails monorepo、任意语言栈都能接入。

> 源自 [PallasTrade Commerce](https://github.com/stevenbian9266-cyber/pallastrade) monorepo 的 `scripts/harness`，2026-08 完成引擎/配置解耦后独立维护。

---

## 它解决什么问题

| 痛点 | 机制 |
|---|---|
| AI 改代码不受控、绕过规范 | **前置 Gate**：改代码前必须规划并清空检查清单，pre-commit 物理拦截 |
| 反模式反复出现（内联样式/裸 fetch/硬编码色值） | **反模式扫描**：规则 JSON 驱动，CI + pre-commit 双卡 |
| 需求一句话 → 实施无依据 | **PRD 工作流**：一句话需求 → 结构化 PRD → AC→测试映射 → 验收 |
| 改了代码忘了同步文档 | **知识同步门（doc-impact）**：改了什么文件，强制同步对应知识文档 |
| 密钥/危险命令被提交 | **密钥 + 危险命令扫描**：agent 无关（Copilot/Codex/Claude/人 都拦截） |
| 规范第一天写不全 | **渐进式落地**：Lite → Standard → Strict 档位，`harness doctor` 提示下一步 |

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

# 开始一次编码任务（必须先开 gate）
npx harness gate --task "新增：我的功能"
# ... 清空所有 check ...
npx harness gate:clear --gate <GATE-ID> --clear <check-id>

# 提交前物理拦截（接入 lefthook）
```

### 发布信息

- 当前版本：`0.1.x`（npm registry，MIT）
- 发布源：`github.com/stevenbian9266-cyber/pallastradeharness`（main 分支）
- 更新：`npm i -D pallastrade-harness@latest` 后 `npx harness doctor` 自检
- 无需 npm 发布的接入方式：`npm i -D github:stevenbian9266-cyber/pallastradeharness`（git 依赖）

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
  name: 'my-project',
  // 层定义：gate 跨层搜索来源
  layers: [{ id: 'app', path: 'app' }, { id: 'web', path: 'src' }],
  // 门禁：追加项目特定 check
  gates: { checkDefs: { feature: [{ id: 'my-check', label: '...' }] } },
  // 知识同步规则（改了什么 → 必须同步什么文档）
  docImpact: { base: 'origin/main', rules: [{ codeGlob: /^src\/.*\.ts$/, docs: ['docs/README.md'], label: '...' }] },
  // 覆盖率
  coverage: { thresholds: {}, targets: [] },
  // 扫描器规则文件
  scanners: { antiPatterns: 'harness/policies/anti-patterns.json' },
  // 状态/产物路径
  paths: { gates: 'harness/gates', requirements: 'harness/requirements', prd: 'docs/prd' },
};
```

### 命令一览

| 命令 | 说明 |
|---|---|
| `harness init` | 生成 `harness.config.mjs` 骨架（向导版规划中） |
| `harness gate --task "..."` | 创建前置门禁（前缀自动判定类型：修复/优化/新增/文档/重构/安全/测试...） |
| `harness gate:status / gate:clear / gate:required / gate:clean` | 门禁状态管理；`gate:required` 供 lefthook/CI 硬卡 |
| `harness prd new/list/verify` | PRD 工作流（骨架创建 + 查重回写 + AC→测试校验） |
| `harness check --profile quick\|full` | 检查档案（变更感知：本地默认只扫 changed-files，`--full`/CI 全量） |
| `harness doc-impact` | 知识同步门 |
| `harness scan-anti-patterns / scan-secrets / scan-degraded-loop` | 扫描器（供 lefthook staged_files 调用，也可用 `harness-scan-*` bin） |
| `harness doctor` | 项目体检 |
| `harness config:check` | 配置校验 + 报告引擎默认值使用情况 |
| `harness plugins:list` | 列出已加载的插件（check / scanner / preset） |
| `harness eval-ai / eval-scenarios / eval-llm` | AI 行为评估（GS 场景库） |
| `harness sync-check` | 知识同步评估门 |
| `harness generated:check` | 生成文件漂移检查 |
| `harness cache:clean` | 清理缓存 |

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

通过统一接口扩展 harness，无需改引擎。两种加载方式：

1. **文件级**：项目 `harness/plugins/*.mjs`（推荐，随仓库分发）
2. **配置级**：`harness.config.mjs` → `plugins: { checks, scanners, presets }`

### Check 插件（进入 gate 检查清单 + `harness check` 执行）

```js
// harness/plugins/my-check.mjs
export default {
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

## 路线图

| Phase | 内容 | 状态 |
|---|---|---|
| 0 | 基线 + 耦合清单 | 规划 |
| 1 | 引擎/配置解耦 + 提效（变更感知增量扫描） | ✅ 完成 |
| 2 | 独立 npm 包（已发布 0.1.x）+ 冷启动（init 向导 / analyze / 渐进档位）+ 插件协议 | 🔄 插件协议已落地，npm 发布已打通 |
| 3 | 自学习（suggest）+ 生态（preset/规则库）+ 报告 | 规划 |

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
