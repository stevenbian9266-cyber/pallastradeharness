# REQ — Batch D D08/D09：提交式上下文 Provider + Cloud 证据边界

- **任务**：TASK-20260919103331-1198e842（critical / feature）
- **PRD**：`docs/prd/other/PRD-20260919-other-batch-d-d08-d09-submitted-context-evidence-boundary.md`
- **上游**：指令文档 TASK-D08/D09、`docs/rfc/0006-runtime-boundary.md` §3.2/§5/§6、`docs/adr/ADR-0002-runtime-boundary.md`（ACCEPTED）

## Step 0 — 跨层检索（AGENTS.md §3）

| 层 | 检索词 | 命中 | 结论 |
|---|---|---|---|
| `bin/` | `Submission` / `trust_level` / `local_agent` / `cooperative` / `attestation` | **0** | 净新增（无任何提交契约或证据边界标记） |
| `bin/` | 既有证据类型 | `contracts.EVIDENCE_TYPES` = command/test/build/screenshot/dom/log/database/review/approval/ui-approval/knowledge —— **无 `source` / `trust_level` 概念** | 边界字段属新增维度，不替换既有类型 |
| `bin/` | `createSubmittedProviders` / `stripSourcePayload` | 0 | 净新增 |
| `presets/` · `templates/` · `rules/` | 同上关键词 | 0 | 无 |
| `docs/` | `Submission` / `trust_level` | 5 处（RFC-0006 §3.2/§6/§7、ADR-0002、指令文档） | 仅设计，无实现 |

**重复实现检查（AP-SEARCH-1/2/3）**：Cloud 侧 Provider 是 D04/D05 端口的**第二种实现**（Local 为第一种），复用同一契约套件；不存在第二套上下文/证据引擎。

## Step 1 — Skill 咨询

| Skill | 关键结论 | 落地 |
|---|---|---|
| `harness-standards-audit` | 决策点 ≤12；安全类规则敏感（字符串拼接/动态执行一律告警）；跨文件重复块会被抓 | 净化函数用显式键集合（无动态拼接）；`stripSourcePayload` 递归深度受限（≤3）避免复杂度；证据边界用显式分支表 |
| `harness-docs` | 引擎变更必须同步 README / CHANGELOG | 收尾跑 `docs:check` / `readme:sync --check` / `doc-impact`，同步 README 运行时边界小节 + CHANGELOG |
| `harness-skill-author`（约定） | 多实现共享测试套件：fixture 负责环境，套件只断言 | `submitted-providers.test.mjs` 直接复用 D04 `runProviderContractTests`（label='submitted'） |

（本仓无 `<project>-customization` Skill；无 runtime/storage 领域 Skill。）

## Step 2 — 复用决策摘要

- **调用已有**：`runProviderContractTests`（D04 契约套件）、`validateProviderImplementation`（端口校验）、`openHarnessDatabaseSync`（D06 建库）、`createSqliteRepositories`（D07，证据边界包装的委托对象）。
- **扩展已有**：`MIGRATIONS` / `SQLITE_TABLES` / `SQLITE_SCHEMA_VERSION`（D06 单点 schema 源，本批追加 v2 迁移）。
- **新封装公用**：`createSubmittedProviders`、`recordSubmission`、`stripSourcePayload`、`validateSubmission`、`summarizeSubmission`、`build*Submission`、`applyEvidenceBoundary`、`validateEvidenceBoundary`、`createBoundaryEvidenceRepository`、`SUBMISSION_KINDS`、`GIT_SNAPSHOT_FIELDS`、`SOURCE_PAYLOAD_KEYS`、`EVIDENCE_SOURCES`、`TRUST_LEVELS`、`EVIDENCE_BOUNDARY_DEFAULTS`。
- **新建局部**：`SUBMISSION_TABLES`（迁移 v2 内部语句，仅 `sqlite-store.mjs` 使用）。

## Step 3 — 需求与验收

FR-001~FR-012、AC-001~AC-013 见 PRD §4/§6（不在本 REQ 重复维护）。

## Step 4 — 风险与缓解

| 风险 | 缓解 |
|---|---|
| 提交被塞入源码/全量 diff | `stripSourcePayload` 强制净化 + `removed` 审计；测试断言表内无源码字段（AC-009） |
| 伪造 CI attestation | `ci_attested` 无 attestation → 抛 `TypeError`（AC-010）；`trust_level=verified` 只在有佐证时出现 |
| Provider 双轨漂移 | 同一契约套件双跑（local / submitted），任一侧漂移即红（AC-007） |
| schema v2 破坏旧库 | 迁移幂等（AC-012）；D06 核心 12 表断言保留；Local 不读 Cloud 库 |
| 边界标记被绕过（直接写 sqlite 证据仓储） | `createBoundaryEvidenceRepository` 为 D10 装配入口；测试覆盖「包装后记录必带标记」 |

## Step 5 — 验证计划

1. `node --test bin/submitted-context.test.mjs bin/submitted-providers.test.mjs bin/evidence-boundary.test.mjs`
2. `npm run test:core`（417 基线 + 新增；D04-D07 契约用例必须继续通过）
3. `docs:check` / `readme:sync --check` / `doc-impact --base origin/main`
4. `reuse-adherence` 验证器 + `supervise diff`（既定 package-lock 例外 + STD-API-001 误报）
