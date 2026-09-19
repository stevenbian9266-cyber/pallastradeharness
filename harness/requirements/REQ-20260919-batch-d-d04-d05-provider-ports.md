# REQ — Batch D D04/D05：Context / GitSnapshot Provider 抽象

- **任务**：TASK-20260919101110-f33d9810（critical / feature）
- **PRD**：`docs/prd/other/PRD-20260919-other-batch-d-d04-d05-context-gitsnapshot-provider.md`
- **上游**：`docs/rfc/0006-runtime-boundary.md`、`docs/adr/ADR-0002-runtime-boundary.md`（ACCEPTED）

## Step 0 — 跨层检索（AGENTS.md §3）

| 层 | 检索词 | 命中 | 结论 |
|---|---|---|---|
| `bin/` | `ContextProvider` / `SnapshotProvider` | **0**（无任何端口/提供者抽象） | 净新增；不存在可复用实现 |
| `bin/` | `git-files` / `change-snapshot` | 13 个模块（`evidence` / `supervisor` / `mcp` / `doc-impact` / `docs-gen` / `domain-supervisors` / `knowledge-loop` / `recovery` / `standards` / `harness` …），共 59 处调用 | 已有具体实现，**本批只包装不替换** |
| `bin/` | `buildContextPack` / `brainStatus` / `searchKnowledge` / `recordDecision` / `buildProjectProfile` / `indexKnowledge` | 消费方 2 个（`mcp.mjs`、`command-registry.mjs`） | 同上：可包装 |
| `presets/` | `ContextProvider` / `SnapshotProvider` / `provider port` | 0 | 无 |
| `templates/` | `ContextProvider` / `SnapshotProvider` | 0 | 无 |
| `rules/` | `ContextProvider` / `SnapshotProvider` | 0 | 无 |
| `docs/` | `ContextProvider` / `GitSnapshotProvider` | 1（`docs/rfc/0006-runtime-boundary.md`） | 仅 RFC-0006 设计，无既有实现 |

**重复实现检查（AP-SEARCH-1/2/3）**：不存在第二份 provider/快照抽象；本批不新建引擎，仅新增端口 + 包装（ARCH-R1 合规）。

## Step 1 — Skill 咨询

| Skill | 关键结论 | 落地 |
|---|---|---|
| `harness-standards-audit` | 端口面需可机读校验（方法清单 + 校验器）；单文件决策点 ≤12 | 方法清单冻结 + `validateProviderImplementation`；`validateProviderImplementation` 单层循环，无深分支 |
| `harness-docs`（文档同步） | 引擎变更必须同步 README / CHANGELOG | 本任务 allow list 含 README/CHANGELOG，修改后 `docs:check` + `readme:sync --check` + `doc-impact` |
| `harness-skill-author`（模板/约定） | 契约测试要复用同一套断言驱动多实现 | `runProviderContractTests` 与 D02/D03 的 `runRepositoryContractTests` 同构（fixture 提供环境，runner 只断言） |

（本仓无 `<project>-customization` Skill，同 Batch A/B/C/D 判定；无 repository/runtime 领域 Skill。）

## Step 2 — 复用决策摘要

- **调用已有**：`buildProjectProfile`、`indexKnowledge`、`searchKnowledge`、`brainStatus`、`buildContextPack`、`recordDecision`、`getChangedFiles`、`getDiff`、`showFileAtRef`、`createSnapshot`、`writeSnapshot`、`readSnapshot`、`listSnapshots`。
- **扩展已有**：无（既有模块零改动）。
- **新封装公用**：`createLocalProviders`（把上述函数收敛到端口工厂，Cloud 可替换）。
- **新建局部**：`PROVIDER_PORT_KINDS` / `PROVIDER_PORT_METHODS` / `validateProviderImplementation` / `isProviderImplementation` / `runProviderContractTests`。

## Step 3 — 需求与验收

功能需求 FR-001~FR-007、验收标准 AC-001~AC-006 见 PRD §4/§6（本任务不新增独立条目，避免双维护）。

## Step 4 — 风险与缓解

| 风险 | 缓解 |
|---|---|
| 端口方法与 Cloud 提交式实现语义不符（D08 返工） | 方法面按「输入输出最小 + 缺失归一」设计；D08 只需实现同一清单 |
| 契约测试过度依赖 git 细节（CI 环境差异） | 临时仓库 fixture + `HEAD` 相对断言，不依赖 `origin/main`、不依赖网络 |
| 误把 Provider 当 Repository 端口 | 端口类别分离（`PROVIDER_PORT_KINDS`），校验器按类校验 |

## Step 5 — 验证计划

1. `node --test bin/provider-ports.test.mjs bin/local-providers.test.mjs`
2. `npm run test:core`（375 基线 + 新增）
3. `docs:check` / `readme:sync --check` / `doc-impact --base origin/main`
4. `reuse-adherence` 验证器 + `supervise diff`（已知 2 项 package-lock + 1 项 STD-API-001 误报）
