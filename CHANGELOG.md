# Changelog

All notable changes to **pallastrade-harness** are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [SemVer](https://semver.org/)

## [Unreleased]

### 严格治理 self-dogfood（Batch E / E01：本仓 `strictGovernance: true`）

- `harness.config.mjs` 声明 `governance: { strictGovernance: true }`：本仓所有变更必须通过引擎自己的严格收尾（事实门 12 项）；缺项 → `REQUIRED_ACTIONS`（每项带可执行命令）+ 退出码非 0 + **任务状态不变**，引擎不得补造事实
- `bin/cli-e2e.test.mjs` 新增 3 个端到端用例（复用既有 `run`/`git` 脚手架，不新建重复助手）：
  - 阻断→放行闭环：strict 临时项目缺 Context/Impact/证据 → `task finish` 被阻断（断言 `Strict finish blocked` + `REQUIRED_ACTIONS` 含 `context_audit`/`architecture_impact`/`tech_stack_impact`/`review`/`knowledge`，且不要求 `requirement_approval`）→ 补齐事实后 `completed`
  - 影响评估：`ARCHITECTURE_CHANGE` 缺 Decision 被拒；`LOCAL`/`NONE` 记录成功
  - 兼容路径：未声明 strict 的项目**无** strict 阻断（行为零变化）
  - self-dogfood 守卫：仓库配置必须声明 strict 且 `AGENTS.md` 生命周期含 `task impact`（防静默回退）
- `AGENTS.md` §2 生命周期新增 `task impact` 强制步骤 + 新增 §2.1 严格治理说明；`README.md` / `docs/getting-started.md` 新增 strict 操作小节；`docs/current-governance-baseline.md` 标注本仓已启用；`docs/roadmap.md` 批次状态新增 Batch E
- **修复（E02）**：strict 收尾事实门原先用「任务声明证据的满足集」（`satisfied ⊆ requiredTypes(task)`）判定 `review`/`test`/`knowledge`，导致 `quick` 风险任务在 strict 下**永远无法收尾**（死锁：引擎强制要求 review/knowledge，而任务未声明它们 → 永不在 satisfied 集合内）。现改为按**新鲜有效证据记录**判定（`verifyTaskEvidence` 新增 `validTypes`，`evaluateStrictFinish` 优先使用；无 `validTypes` 时回退 `satisfied` 保持兼容）——**门槛不降**：无记录仍报缺项，补齐后即可收尾。回归覆盖：`bin/fact-gates.test.mjs` 2 例（quick 补齐后缺项消失 / 无记录仍报缺项）+ `bin/cli-e2e.test.mjs` 1 例（quick 任务端到端收尾）

### Cloud 门禁能力（gate_create / gate_clear + GateRepository 可写端口）

- 新增 `bin/cloud-gate.mjs`（纯逻辑，无本机 IO）：`buildCloudGate`（检查项取既有 `getGateChecks`、任务类型取 `detectTaskType`、状态由 `recomputeGateState` 派生）· `clearCloudGateCheck`（守卫：`gate_not_found` / `unknown_check` / `check_machine_verified` / `human_approval_required` / `check_already_cleared`）· `isMachineVerifiedCheck`（`verify-test` 与 `*-gate`）
- `bin/cloud-commands.mjs`：接线 `gate_create`（同任务未清门 → `gate_already_active`；git 指纹取最新 `GitSnapshotSubmission`）与 `gate_clear`（human-WAIT 需存在非 STALE 审批，拒绝态不落库）；`get_next_action` 随之推进（建门 → 清门 → 证据 → 完工）
- `bin/runtime-ports.mjs`：`GateRepository` 由只读扩展为 `loadLatest` / `statusSnapshot` / `save`
- `bin/file-repositories.mjs` / `bin/sqlite-repositories.mjs`：新增 `gates.save`（File 原子写 + mkdir；Sqlite 按 id 覆盖 upsert），Sqlite 读取端补 `migrateGateState` 归一（与 File 同构）
- `bin/repository-contract.mjs`：新增 Gate `save → loadLatest` 覆盖式往返用例（File / Sqlite 双跑，防适配器漂移）
- 政策定稿（`docs/rfc/0006-runtime-boundary.md` §4.1）：门禁=流程指引、完工=证据判定；机器校验项不可工具化；人工门不可绕过；清完门禁 ≠ 完工
- 单测：`bin/cloud-gate.test.mjs`（6）+ `bin/cloud-runtime.test.mjs` 扩展 3 条集成（建门落库/重复建门、逐项清理 + 下一步推进、人工门审批流）

### 真实 MCP 客户端端到端测试（Batch D / D14）

- 新增 `bin/mcp-real-client.test.mjs`：用官方 `@modelcontextprotocol/sdk@1.30.0`（`Client` + `StreamableHTTPClientTransport`）经**真实端口**驱动 Cloud 运行时，覆盖 `tools/list`（与 `MCP_TOOLS` 严格一致）· `project_init` · `start_task` · `list_tasks`/`get_task`（task status）· `finish_task`（先拒）· `record_evidence`×3（带边界标记）· `finish_task`（completed）· **无凭据客户端被拒且不产生任务**
- SDK **隔离安装在仓库外**（`%TEMP%\harness-mcp-client`）：仓库保持零依赖；测试按 `HARNESS_MCP_SDK_DIR` → 默认临时目录解析，缺失时整体 skip 并打印安装命令
- 新增「仓库依赖面零改动」静态断言（SDK 不进 `package.json`）

### Cloud Strict Governance 强制（Batch D / D13）

- 新增 `bin/cloud-policy.mjs`（纯逻辑，无本机 IO）：`CLOUD_STRICT_GOVERNANCE`（恒 true）· `strictFlagDisabled(config)`（与 Local `fact-gates` 同键名）· `cloudStrictPolicy(config)`（结论不随配置变化）· `assertCloudStrictGovernance(config)`（显式关闭 → 抛错）
- **双层守卫**：`createCloudApplication` 装配期 fail-fast（拒绝启动半严格运行时）；`finish_task` 运行期复查（命令层被直连时返回 `strict_governance_required`，任务状态不变）
- 语义对齐：Local 缺省非严格，Cloud **缺省即严格**（不继承 legacy 默认）；显式关闭在 Cloud 属非法配置
- 可观测：`createCloudRuntime` 暴露 `strictGovernance: true`；`createHttpHandler({ info })` → `GET /health` 返回 `{ ok, runtime, strictGovernance }`
- 单测：`bin/cloud-policy.test.mjs`（5）+ `bin/cloud-runtime.test.mjs` 扩展 4 条（装配守卫 / 运行守卫 / health 暴露 / **无 legacy 回退全工具扫描**）

### MCP 工具面兼容 + Project 能力（Batch D / D12）

- 新增 `bin/cloud-commands.mjs`：Cloud 命令层 12 个 handler——`start_task`（风险/必需证据由 `assessRisk` 推导 + Change Plan 落 `task_checkpoints`）、`gate_status`、`record_approval`（类型经 `APPROVAL_TYPES` 校验）、`project_init`、`project_status`、`get_template`（随包模板注册表）、`get_next_action`（端口状态推导）、`risk_check`（提交式快照 + 纯引擎，必要时升级风险等级）、`finish_task`（**严格**：DEFAULT ∪ requiredEvidence 的证据 + critical 需非 STALE 审批，缺一即拒）、`record_evidence`（D09 边界）、`review_diff`（显式 `cloud_context_insufficient`）
- `bin/cloud-application.mjs`：改为装配 `createCloudCommands` + 分发表，新增 `listImplementedTools()`；不再内联工具实现
- `bin/contracts.mjs`：新增 `APPROVAL_TYPES`（单一来源）；`bin/approvals.mjs` 改为复用（行为不变，仍导出同名常量）
- 工具名不变（`tools/list` 与 Local `MCP_TOOLS` 严格一致）；未接线工具仍 `cloud_not_implemented`
- 单测：`bin/cloud-runtime.test.mjs` 扩展 10 条 D12 用例（含严格完工正/反例、无 legacy 自动流转、常量单点化、命令层无本机 IO 断言）

### HTTP MCP 运行时 + 静态 Key（Batch D / D10-D11）

- 新增 `bin/static-key-auth.mjs`：`HARNESS_API_KEY` + `Authorization: Bearer`（`timingSafeEqual` 常数时间比较；空白 key 视为未配置；未配置 → 503、缺凭据/方案错/key 错 → 401；**不做** User/Tenant/Trial/Expiry/密钥库/设备）
- 新增 `bin/mcp-jsonrpc.mjs`：MCP JSON-RPC 适配层（`initialize` / `ping` / `notifications/initialized` / `tools/list` / `tools/call`），复用 Local 的 `MCP_PROTOCOL_VERSION` / `MCP_TOOLS` / 结果信封，**不判定业务结果**（ARCH-R2）
- 新增 `bin/cloud-application.mjs`：应用/命令层（Cloud 唯一接触存储的层）；`list_tasks` / `get_task` / `record_evidence`（经 D09 边界包装）；其余冻结工具返回 `cloud_not_implemented`（不伪造 PASS、不代填审批/证据）
- 新增 `bin/http-transport.mjs`：`handleHttpRequest` 纯函数 + `startHttpServer`（`node:http`）；`POST /mcp` 鉴权优先且**鉴权失败不进入应用层**；`GET /health` 免鉴权；坏报文 400（-32700/-32600）、未知方法 -32601、通知 202
- 新增 `bin/cloud-runtime.mjs`：组装根（`createCloudRuntime` / `startCloudRuntime`）串联全部分层
- `bin/mcp.mjs`：导出 `content` / `toolError`（Cloud 与 Local 共用同一结果信封，行为不变）
- `bin/sqlite-repositories.mjs`：证据记录保留调用方字段（新增 `{...input}` 透传 + 去除 `task` 对象），使 D09 边界标记能落库（契约用例保持通过）
- 单测：`bin/static-key-auth.test.mjs`（5）+ `bin/cloud-runtime.test.mjs`（10，含真实端口 e2e、分层静态断言、无假 PASS 断言）

### 提交式上下文 + Cloud 证据边界（Batch D / D08-D09）

- 新增 `bin/submitted-context.mjs`：3 类提交契约（`SUBMISSION_KINDS`）+ git 快照字段（`GIT_SNAPSHOT_FIELDS`）+ `stripSourcePayload`（递归剥离源码/全量 diff，返回 `removed` 审计）+ `validateSubmission` / `summarizeSubmission`（≤240 字符）/ `build*Submission`（非法输入抛 TypeError）
- 新增 `bin/submitted-providers.mjs`：`createSubmittedProviders({ db, config })` 用提交内容实现 D04 的 3 个 Provider 端口；`recordSubmission` 按 kind 路由落库（同 id 幂等）；`gitSnapshot.diff()` **恒返回空 diff + `diff_hash`**（Cloud 不持有全量 diff，指令 D08）、`showAtRef()` 返回 `content:null`
- 新增 `bin/evidence-boundary.mjs`：默认 `source=local_agent` / `trust_level=cooperative`；`ci_attested` 无 attestation → 抛错（不伪装）；`createBoundaryEvidenceRepository` 自动打边界标记
- `bin/sqlite-store.mjs` schema **v2**：`context_submissions` + `git_snapshots`（含量与索引列）；`SQLITE_SCHEMA_VERSION=2`，旧库可原位升级（迁移幂等）
- 契约一致性：`runProviderContractTests` 同一套 12 用例双跑（`label=local` / `label=submitted`）
- 单测：`bin/submitted-context.test.mjs`（5）+ `bin/submitted-providers.test.mjs`（15）+ `bin/evidence-boundary.test.mjs`（4）；`bin/sqlite-store.test.mjs` 适配 v2（保留 D06 核心 12 表断言）

### Cloud SQLite 存储 + Sqlite Repositories（Batch D / D06-D07）

- 新增 `bin/sqlite-store.mjs`：Cloud SQLite 底座——12 张表（projects / project_artifacts / constitution_versions / tasks / task_checkpoints / task_events / gates / approvals / findings / evidences / decisions / knowledge_assessments）+ `schema_migrations`；`migrateDatabase`（幂等、事务内应用）、`withTransaction`（`BEGIN IMMEDIATE`/`ROLLBACK` 重抛）、`openHarnessDatabase(Sync)`（WAL / `foreign_keys=ON` / `busy_timeout`）、`isSqliteAvailable`（Node ≥ 22.5）
- 新增 `bin/sqlite-repositories.mjs`：`createSqliteRepositories({ db, config })` 实现 D02 冻结的 7 个端口方法面（与 File 适配器同形同语义：`get` 未知 → null、`list` 空库 → `[]`、gate 空态 → `{ ok:false, code:'NO_ACTIVE_GATES' }`）；不做业务判定，无本机 IO 依赖
- `node:sqlite` 懒加载：engines `>=22.0.0` 下不可用时抛含版本要求的错误，Sqlite 测试整体跳过（Local 路径不受影响）
- **双适配器契约**：`runRepositoryContractTests` 同一套 17 条用例同时驱动 File（D03）与 Sqlite（本批）；任一侧行为漂移即 `test:core` 变红
- 单测：`bin/sqlite-store.test.mjs`（6，含 pragma / 迁移幂等 / 事务回滚 / FK 强制）+ `bin/sqlite-repositories.test.mjs`（21，含 17 条契约 + 覆盖度/非空路径/无本机 IO 断言）

### Context / GitSnapshot Provider 抽象（Batch D / D04-D05）

- 新增 `bin/provider-ports.mjs`：3 个 Provider 端口契约（ProjectContextProvider / TaskContextProvider / GitSnapshotProvider）+ `PROVIDER_PORT_METHODS` 冻结方法面 + `validateProviderImplementation` / `isProviderImplementation`（纯逻辑，不 import fs/child_process）
- 新增 `bin/local-providers.mjs`：`createLocalProviders({ rootDir, config })` 包装 `project-brain`（画像/索引/检索/状态/上下文包/决策）、`git-files`（信封语义 `{files,errors}` / `{diff,errors}`）、`change-snapshot`（快照生成/落盘/读回/列举）——**既有调用点零改动**
- 新增 `bin/provider-contract.mjs`：可复用 Provider 契约测试套件（`runProviderContractTests`）；Git 端口用例要求 fixture 提供可用 git 仓库（临时目录 + `git init` + 初始提交）
- 单测：`bin/provider-ports.test.mjs`（3）+ `bin/local-providers.test.mjs`（3 Provider × 契约用例，共 12）

### Runtime Ports + File 适配器（Batch D / D02-D03）

- 新增 `bin/runtime-ports.mjs`：7 个存储端口契约（Project/Artifact/Task/Gate/Approval/Evidence/Event）+ `RUNTIME_PORT_METHODS` 冻结方法面 + `validatePortImplementation`/`isPortImplementation` + `CLOUD_FORBIDDEN_IMPORTS`（node:fs / node:child_process，D08/D10 白名单测试复用）
- 新增 `bin/file-repositories.mjs`：`createFileRepositories` 包装既有 Local 存储（state-store / gate-commands / evidence / approvals / project-artifacts / constitution / governance），**行为零变化**；缺失归一（get → null）；Event 端口用本地 JSONL（`<state>/events/<taskId>.ndjson`）
- 新增 `bin/repository-contract.mjs`：可复用契约测试套件（`runRepositoryContractTests`）——同一套行为断言驱动 File（本批）与 Sqlite（D07）适配器；套件不依赖任何具体实现（AC-003）
- 单测：`bin/runtime-ports.test.mjs`（3）+ `bin/file-repositories.test.mjs`（7 适配器 × 契约用例，共 19）；ADR-0002 状态 → ACCEPTED（附三项附注决策）

### Batch D 决策提案（D01 分析，未编码）

- 新增 `docs/rfc/0006-runtime-boundary.md`：Cloud 提取审计（78 模块 / fs 68 / child_process 13 / git 16 / 纯逻辑 8，实测）与四象限矩阵（KEEP CORE / LOCAL ONLY / NEEDS PORT / CLOUD NEW）+ 端口清单与 D02-D14 实施序
- 新增 `docs/adr/ADR-0002-runtime-boundary.md`：Runtime Boundary 与 Cloud Runtime 抽取决策提案（PROPOSED；node:sqlite 内置 / Streamable HTTP v0 / 静态 Key 最小范围 / Cloud strict 恒强制 / 提交式上下文边界）

### Project Constitution 集成（Batch C）

- 契约层：新增 `ProjectArtifact` / `ConstitutionVersion` 契约与 `ARCHITECTURE_IMPACTS` / `TECH_STACK_IMPACTS` 枚举
- 新增 6 个模块：`bin/project-artifacts.mjs`（制品清单/哈希/drift）· `bin/constitution.mjs`（版本计算/锁定/current/diff + Task 冻结快照 + Context 选择）· `bin/constitution-change.mjs`（Change Flow + Skill Impact/处置）· `bin/approvals.mjs`（Approval 绑定 `artifact_hash`，变化即 STALE）· `bin/fact-gates.mjs`（4 个事实门 + strict finish REQUIRED_ACTIONS）· `bin/constitution-compliance.mjs`（架构/技术栈合规 → Supervisor finding）
- 接线：`task start` 冻结 Constitution（version + tech_stack/architecture/engineering/testing/skills hash）；`task impact|facts` 子命令；`gate:clear` 清理 human-WAIT 时自动记录 Approval 绑定；`buildContextPack` 按相关性引入 Constitution；`domain-supervisors` 追加 architecture/tech-stack 合规域；`governance.validateProfile` 兼容 Constitution Manifest 字段
- CLI：`harness constitution:status|register|lock|diff|change|apply|skills|approvals`
- dogfooding：为 pallastradeharness 建立真实 Constitution（7 个制品 + skills 计算制品；`product` 槽位记 `not_applicable`，待人工决策）并锁定首版 `constitution-3868e8d717ea`
- 单测：6 个新文件（project-artifacts / constitution / constitution-change / approvals / fact-gates / constitution-compliance）
- `strictGovernance=true` 时 `task finish` 不补造流程事实：缺失项输出 `REQUIRED_ACTIONS`（含可执行命令）；Local 兼容路径不变

### Template Registry + Project Constitution（Batch B）

- 新增 `bin/template-registry.mjs`：模板体系单一事实源读取层（`listTemplates` / `getTemplate` / `getLatestTemplate` / `findTemplates` / `validateTemplateRegistry`）+ 枚举常量；数据源 `templates/registry.json`（27 条定义）；不扫盘发现、不依赖数据库、暂不通过 MCP 暴露
- `bin/contracts.mjs` 新增 `Template` 契约类型（11 必填字段 + 可选 `contract_path`；semver 与非空数组校验）
- 注册现有模板（B03）：PRD、tech-design、interaction、ui、visual、11 个领域 Skill 内容模板、ai-hooks、lefthook，逐条含 owner_role / consumed_by / stale_when
- 新增 8 个 Constitution 模板（B04-B11）：project-overview / tech-stack / architecture / adr / engineering-standard / testing-standard / acceptance-standard / agent-rules；tech-stack 与 architecture 附机读契约（JSON：current_technologies / restrictions / change_policy；modules / dependency_rules / rules / severity）
- Skill 模板升级（B12）：新增 `templates/skill/SKILL.md`（14 段治理结构）与 `templates/skill/governance-sections.md`（共享治理段落）；11 个领域模板注入 `{{GOVERNANCE_SECTIONS}}`；`harness skill new` 回退链 = 领域内容模板 → canonical 模板 → 内联骨架（Skill Engine 其余逻辑不变）
- 单测：template-registry（12）+ contracts（+1）+ skill-template（+3）；治理基线文档同步

### Core Stabilization（Batch A）

- 测试边界：`npm test` 收敛为 `test:core`（`node --test "bin/*.test.mjs"`，不再包含示例项目）；新增 `test:mcp` / `test:e2e` / `test:examples`；`examples/node-ts` 测试改由自身 `package.json#scripts.test` 承载（Node 22.6–22.17 补 `--experimental-strip-types`）
- 依赖审计：移除包自身作为 devDependency 的 `pallastrade-harness@^1.6.0`（全仓无执行路径使用，属自举期历史残留），重新生成 `package-lock.json`；新增守卫测试（禁止再次声明自身为依赖）
- 版本单一事实源：新增 `bin/version.mjs`（`package.json#version` 为唯一来源）；MCP `serverInfo.name/version` 与 `mcp:config` 默认 spec 改为运行时推导（修正 `serverInfo.version` 硬编码 `1.0.0` 漂移）；新增 `bin/version.test.mjs`（4 例）
- 治理基线冻结：新增 `docs/current-governance-baseline.md`（Task 状态机 / Gate 阶段 / MCP 20 工具 / 11 证据类型 / 3 风险等级 / 28 条规范 / 模板与 Skill 清单，全部从源码提取）

## [1.10.0] — 2026-09-18

### MCP 全量机制接入（RFC-0004）— Phase 0（内核）

- 新增 `bin/command-registry.mjs`：命令注册表单一事实源（30 条生命周期核心命令 + 四档写/暴露政策 + 契约校验器 + 36 个冻结 MCP 工具名清单）
- 新增 `bin/gate-commands.mjs`：`gate` / `gate:status` / `gate:clear` 内联逻辑提炼为数据函数（CLI/MCP 共用；输出与退出码零变化）
- 修复既有循环依赖：提取 `bin/skill-index.mjs`（`skill.mjs` ⇄ `skill-audit.mjs`）
- 单测：command-registry（8）+ gate-commands（5）

### MCP 全量机制接入（RFC-0004）— Phase 1（零安装接入）

- 新增独立入口 `harness-mcp`（`bin/mcp-server.mjs`）：`npx -y -p pallastrade-harness harness-mcp [--root <dir>]` 即启，无需安装
- root 定位链：`--root` > `HARNESS_ROOT` > MCP `roots/list` 协商 > cwd 向上查找；非法 root 报错退出（exit 2）
- L1 工具面 13 → 20：新增 `gate_create` / `gate_status` / `gate_clear` / `run_verifier` / `get_next_action` / `get_task` / `list_tasks`
- 业务失败统一错误信封（`isError:true` + `{code,message,hint?,nextAction?}`，RFC-0004 §6.1）；human-WAIT 检查项（`user-confirmed`/`design-confirmed`）MCP 禁裸清（决策 D5）
- `run_verifier` 仅执行注册表验证器（白名单，无任意命令面）；复用 `bin/verifier.mjs` 既有 `runVerifier`
- 工具面 ↔ 注册表冻结清单一致性契约测试；真 stdio 端到端测试（`--root` 优先 / roots 协商 / 任务+门禁闭环）
- 单测：mcp（+3）+ mcp-server（3）；全量 303/303 通过

### MCP 全量机制接入（RFC-0004）— Phase 1 收尾（接入配置与文档）

- `harness mcp:config --target <vscode|cursor|claude-code|claude-desktop|codex|all> [--write] [--json] [--spec]`：5 客户端接入配置生成（默认 pin `@1.10`；项目内 JSON 文件可写盘且幂等，用户级目标打印片段）
- 接入文档批次：新增 `docs/mcp.md`（接入/工具面/安全模型/排查）；`docs/commands.md`、`docs/index.md`、`docs/getting-started.md`、README 同步
- 单测：mcp-config（6）；全量 309/309 通过

## [1.9.0] — 2026-08-31

### Token 优化（RESEARCH-20260831-harness-token-optimization.md §6，约束零变化）

- `gate --quiet`：只输出 check 计数 + 必读提示（默认全量保留）；`config.output.gateListVerbose=false` 等价降档
- `gate:status --short`：单行输出状态（退出码语义不变）
- `gate:clear` 回显精简：变更项 + 计数 + 剩余 id，不重复输出 check 描述
- `task list`：默认只显示最近 20 条（`config.output.taskListDefaultLimit`，0=全量），`--all` 全量，`--status <status>` 过滤；`--json` 输出不受裁剪影响
- `config.gates.disableChecks.<taskType>`：按任务类型禁用内置 check（默认空 = 约束零变化；`verify-test` 证据门与 `search-*` 跨层搜索不可禁用）
- `config.designStage.enabled='auto'`：仅任务描述命中 `uiKeywords`（ui/页面/组件/交互/视觉/样式/storefront/dashboard，可配置）才插入 4 设计文档检查与 `reuse-adherence-gate`；`true`（默认）行为不变
- `config.output.requireSkillRead`：false 时移除 `read-skill-*` 检查项（默认 true 保约束）
- `harness metrics`：新增产物文档统计（PRD/REQ/designs 计数 + 字节 + token 估算 ≈ bytes/4）与每任务 designs 明细（`perTaskDesigns`），供优化效果量化回归
- 内置 PRD 模板随包精简（`templates/prd/_TEMPLATE.md` + `docs-gen.mjs` BUILTIN）：删除 ⚠️ 示例/说明块，保留结构骨架
- 单测：新增 token 优化用例（config-loader 4 / design-scan 1 / metrics 1 / task-orchestrator 1 / cli-e2e 2），全量 283/283 通过

### 其他

- 移除仓库内两个设计文档（`harness持续治理机制设计(1).md` / `从零开始项目完整路径演示.md`）：改为本地编辑、不入库（`.gitignore` 防再提交）——chore，不影响引擎功能

## [1.8.0] — 2026-08-30

### 设计阶段治理与发布前强化（P0–P5，设计文档 §15/§17/§18/§19/§19A）

- `prd verify --semantic`：AC 语义校验，拒绝空断言 / 过度 mock 的"假覆盖"（新增 `bin/ac-semantic.mjs`）
- `task start --ac <PRD> AC-x`：任务↔AC 双向绑定；PRD 不存在或 AC 未声明即阻止开始；`task finish` 校验声明的 AC 全有测试 + PRD 无未认领 AC（新增 `bin/ac-trace.mjs`）
- `verify coverage`：coverage 注册为受信验证器；项目声明 `coverage.thresholds` 时 gate 自动追加 `coverage-gate`，由 coverage 验证器证据自动满足（evidence.mjs）
- `ui-approval` 证据类型：`EVIDENCE_TYPES` 新增，UI 人工确认作为 UI 任务的硬性完成条件（设计文档 §18.5）
- `scan-ui-anti-patterns`：UI 反模式扫描器（UI-001 inline style / UI-002 硬编码十六进制色（排除 design-tokens）/ UI-003 裸 fetch / UI-005 img 缺 alt），内置默认规则 + `harness/policies/ui-anti-patterns.json`，接入 lefthook 模板
- `visual:baseline / visual:diff`：视觉回归（§18.4）——golden screenshot 基线 + 像素 diff（pngjs+pixelmatch），超阈值 exit 1，无基线/无截图 → `validation_unavailable`（exit 2）；`config.visualRegression`（enabled/url/viewports/baselineDir/maxDiffRatio），enabled 时 gate 自动追加 `visual-regression`，由截图/ui-approval 证据自动满足
- `adapter register / registered / unregister`：Agent 能力登记与诚实保护报告（§17.3.2）——新增 `bin/capability-registry.mjs`（能力白名单 + validate + 保护等级派生 enforced/guarded/advisory + 大白话描述），登记存 `.harness-state/adapters/`
- `governance:init / status / version`：治理版本与项目画像（§15 总前置条件）——新增 `bin/governance.mjs`（project.yaml 画像 + `governanceReady` + 版本快照锁定 `governance-0.1.0` + 状态机只前进）；`task start` 在 ready 项目上记录 `governanceVersion`（§15.9）
- `wizard init / step / status / from / finish / reset`：从零项目 10 步向导（§17.7 旗舰功能）——新增 `bin/wizard.mjs`（10 步定义 + 答案落盘可恢复 + 答案→画像映射 + `derivePrdCategory` + finish 复用 governance 锁定）；引导式问答产出 `harness/project.yaml` 并锁定治理版本
- `baseline:create / check / status`：存量项目质量基线 / no_regression（§14.5）——新增 `bin/baseline.mjs`（TAP 解析 + 基线落盘 `.harness-state/baseline/` + 三态：新增失败阻断 / 历史失败仅记录 / 已修复改善）；`config.qualityBaseline`（enabled/testCommand），enabled 时 gate 自动追加 `baseline-gate`，由 baseline 验证器证据自动满足；修复测试命令子进程继承 `NODE_TEST_CONTEXT=child-v8` 导致 stdout 被抑制的坑
- 设计阶段治理（PRD 确认后 → 设计产物 → design-confirmed → 编程）：`templates/designs/` 4 模板（ui/interaction/visual/tech-design，tech-design 内置 Part A 现状识别 + Part B 复用决策矩阵 + Part C 落点）；feature gate 在 `user-confirmed` 后追加 7 个设计检查项（`create-ui-doc`/`create-interaction-spec`/`create-visual-spec`/`create-tech-design`/`tech-design-has-baseline`/`tech-design-has-reuse-matrix`/`design-confirmed`）；`design:scan`（现状识别：业务/数据模型+字段/公共符号，`bin/design-scan.mjs`）；`reuse-adherence` 验证器（复用决策落地静态校验：调用已有/扩展已有/新封装公用/新建局部，fail>0 exit 1，不可判定 → warning 不阻断，`bin/reuse-adherence.mjs`）；`config.designStage`（enabled/designsDir），feature 且启用时 gate 自动追加 `reuse-adherence-gate`，由 reuse-adherence 验证器证据自动满足
- 设计检查机器校验（§19A.4 落地）：`design:check`（`bin/design-check.mjs`）校验 4 设计文档存在 + tech-design Part A 四节 + Part B 复用矩阵；`gate:clear` 对 6 个设计检查项强制机器校验（未通过拒绝 clear，design-confirmed 保持人工 WAIT）；无 taskId 时扫描全部任务
- 单测：`bin/ac-semantic.test.mjs`、`bin/ac-trace.test.mjs`、`bin/scan-ui-anti-patterns.test.mjs`、`bin/visual-regression.test.mjs`、`bin/capability-registry.test.mjs`、`bin/governance.test.mjs`、`bin/wizard.test.mjs`、`bin/baseline.test.mjs`、`bin/design-scan.test.mjs`、`bin/reuse-adherence.test.mjs`、`bin/design-check.test.mjs`（全量 274/274 通过）

### Guided UX + External Validation

- 交互式 TUI 当前任务视图（HTH-016）：键盘导航 / 任务详情 / nextAction 动作执行，全部动作有 CLI/JSON 等价物
- Brain 检索 adapter 与评测框架（HTH-017）：`brain query` 确定性 top-K 检索 + `brain eval` 离线评测（Recall@K + 必需资产遗漏率）+ 50 查询评测集；修复 F-09 召回虚高
- 本地匿名指标（HTH-019）：`harness metrics` 隐私优先，默认不上传，`metrics export` 审阅导出
- 插件合同测试与兼容政策（HTH-021）：1.0 manifest 幂等验证 + 确定性断言
- Tier A 参考仓 fixtures（HTH-018）：`examples/` node-ts/rails/java 最小参考项目
- 小白可用性试点包（HTH-020）：`docs/pilot/` 指南/指标表/访谈/问题报告模板（待外部执行）
- 双语核心文档与 2.0 beta 发布决策（HTH-022）：`README.en.md` / `docs/getting-started.en.md` / Go-No-Go 报告 `docs/rfc/0003-release-gate.md`（2.0 正式版 No-Go，继续 beta）

### README 版本信息防漂移（readme:sync）

- 新增 `harness readme:sync [--check|--write]`：从 `package.json`（当前版本）+ `CHANGELOG.md`（已发布版本）确定性同步 README「发布信息/版本记录」——`--check` 漂移即 exit 1（CI 硬卡），`--write` 就地修复（更新当前版本行 + 补齐缺失版本表行，自动生成行标注「待润色」，不覆盖手写富文本）
- 修复现存漂移：README 当前源码版本 1.6.0 → 1.7.0 + 版本表补 v1.7.0/v1.3.1 行；`package-lock.json` 根版本经 `npm install --package-lock-only` 再生成；`docs/roadmap.md` 1.6.0 状态行改为已发布；`SECURITY.md` 支持版本下限升 1.7.0
- CI 门禁：`.github/workflows/test.yml` 新增 `readme-sync` job（`node bin/readme-sync.mjs --check`），版本变更 PR 必须同步 README 才能合并
- 发布后自动更新：`.github/workflows/publish.yml` 发布成功后自动 `--write`，若有漂移自动创建修复 PR（main 受 Ruleset 保护，禁止直推）
- 单测 `bin/readme-sync.test.mjs`（11 用例）覆盖 parse/check/write/roundtrip

## [1.7.0] — 2026-08-22

### Trust Kernel（可信内核）

- ChangeSnapshot: Task/Gate/Evidence/commit 绑定同一可重算变更快照（index tree + worktree/untracked manifest + config hash）— RFC `docs/rfc/0002-change-snapshot.md`
- Verifier Registry: `harness verify`；任意命令降级 diagnostic；手工证据 `success:null` + `--approve`
- Task 强绑定: 新 Gate 必须绑定 Task；Taskless Gate 隔离 + 废弃路径；verify-test 一律证据控制
- Node 化安全 Hook: `bin/hook-agent.mjs` + `harness hooks doctor`（支持级别矩阵）
- 可执行文档: getting-started task-bound 生命周期；docs:check 过时命令防漂移
- 独立仓自治理: AGENTS.md/harness.config.mjs/lefthook.yml/SECURITY.md/CHANGELOG.md + **GitHub Ruleset `main-protection`**（禁直推/强推/删除、PR+review、6 个 required checks）
- 引导式体验（P1 前置内容）：`harness do`/`next` 零认知路径 + 真 Lite + `harness setup` 统一接入 + 保护 doctor 覆盖

## [1.6.0] — 2026-08-20

- feat: automated trigger completion (自动触发补全)
- 45 production `.mjs` modules, 138 passing automated tests
- CI on Windows/macOS/Ubuntu × Node 22/24
- npm OIDC trusted publishing + SLSA provenance

## [1.5.0] — 2026-08-19

- feat: Auto-Content 自动内容生成

## [1.4.0] — 2026-08-18

- feat: PRD workflow enabled by default (一句话 → PRD → 确认 → 实施)

## [1.3.1] — 2026-08-17

- fix: resolveSmartPath src doubling + glob/negation/table-row support in scan & freshness

## [1.3.0] — 2026-08-16

- feat: skill audit — 通用 Skills 自动治理
