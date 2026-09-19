# PRD-20260919-other-batch-c-constitution-集成.md

| 元数据 | 值 |
|---|---|
| 状态 | approved（用户确认依据：`pallastradeharness Phase 1 AI 实施指令.md` §四 批次 C + 对话"继续推进"授权） |
| 创建日期 | 2026-09-19 |
| 来源 | Batch C：让 Constitution 真正进入现有 Harness（C01-C14） |
| 分类 | other（自动判定） |
| 上游规格 | `harness方案.md` §16-17/§44/§50/§55/§66-67/§94-95；`pallastradeharness Phase 1 AI 实施指令.md` §四 |
| 关联任务 | TASK-20260919084823-c0b3bcb3 / GATE-2026-09-19T08-48-27 |

## 1. 背景

Batch B 交付了 Template Registry 与 8 个 Constitution 模板（**模板存在，但 Constitution 尚未成为运行时事实**）：

- 无 ProjectArtifact 契约与制品哈希 → 无法判断"哪一版 Constitution"；
- 无 ConstitutionVersion（不可变快照）→ 无法回答"这个 Task 当时依据哪一版"；
- Task 创建不冻结 Constitution；
- Context Pack 不引入 Constitution；
- 无 Architecture / Tech Stack Impact 记录；
- Approval 不与 Artifact Hash 绑定（PRD 改了旧确认仍可用）；
- Supervisor 不消费 Architecture / Tech Stack Artifact；
- `finish_task` 允许 Local 兼容补链，无严格模式。

本批次**不触碰** Cloud / SQLite / HTTP / 静态 Key / User-Tenant（那属 Batch D）。

## 2. 目标

1. 定义 `ProjectArtifact` 契约（C01）与文件型制品清单（Local 继续以文件形式存在）；
2. 定义 `ConstitutionVersion`（不可变、可比较、可获取 current）（C02）；
3. 兼容式升级 Governance Profile（`constitution_version` / `artifacts` / `skills` 可选字段）（C03）；
4. 为 pallastradeharness 自己建立真实 Constitution（Brownfield Discovery，未知即 `UNKNOWN` / `TO_BE_DECIDED`）+ 第一版 version（C04）；
5. Task 创建冻结 Constitution（version + tech_stack/architecture/engineering/testing hash + skills hashes）（C05）；
6. Context Pack 按任务相关性引入 Constitution（不无限增长）（C06）；
7. Architecture Impact / Tech Stack Impact 统一枚举与记录（C07/C08）；
8. Constitution Change Flow（CHANGE_REQUIRED → Proposal → Decision → Approval → Update → New Version → Skill Impact → Resume）（C09）；
9. Skill 随 Constitution 变化变 `STALE` + 处置记录（UPDATE / REVIEWED_NO_CHANGE）（C10）；
10. Approval 绑定 Artifact Hash，变化即 `STALE`（C11）；
11. 事实驱动 Gate（REQUIREMENT_APPROVED / UI_APPROVED / PLAN_READY / TESTS_PASS）（C12）；
12. Supervisor 消费 Architecture / Tech Stack Artifact（ARCHITECTURE_COMPLIANT / TECH_STACK_COMPLIANT）（C13）；
13. `strictGovernance` 模式：`finish_task` 不补造事实，缺失即 `REQUIRED_ACTIONS`（C14）。

## 3. 成功指标

- `validateContract('ProjectArtifact'|'ConstitutionVersion')` 生效；制品 hash 可复算；
- 第一版 Constitution 锁定：`constitution:status` 0 drift，version 不可变（重复 lock 拒绝）；
- Task 冻结：`task start` 输出含 constitution_version + 4 个 hash + skill hashes；
- Context Pack 含 constitution 选择（≤ limit 条）；
- Approval 绑定：改 PRD → 旧 requirement approval 变 `STALE`（测试证明）；
- 事实门：4 个 fact 可由真实事实推导（测试证明）；
- 合规审查：违反 architecture `deny` 规则 / 引入受限技术 → blocking finding（测试证明）；
- 严格收尾：缺失任一事实 → `REQUIRED_ACTIONS` 且 exit 非 0（测试证明）；Local 兼容模式行为不变。

## 4. 场景

| # | 场景 | 输入 | 期望 |
|---|---|---|---|
| A | 首次锁定 | `constitution:lock`（无制品） | 拒绝并提示先创建制品 |
| B | 锁定 | 制品齐全 | `constitution-<hash>` 快照写入 versions/，current.json 更新 |
| C | 重复锁定 | 同 hash | 拒绝覆盖（immutable） |
| D | 漂移 | 手工改 architecture.md | `constitution:status` 报 drift；`lock` 拒绝并指向 change flow |
| E | 变更流 | `constitution:change --reason` → `apply` | 新 version + skill impact 列表 + proposal CLOSED |
| F | Task 冻结 | `task start` | task.constitution 含 version/hashes |
| G | Approval 失效 | 改 PRD 后查 approval | `STALE` |
| H | 严格收尾 | `strictGovernance=true` 且缺 impact | `REQUIRED_ACTIONS` 列出缺失项 |
| I | 事实门 | 全事实齐备 | 4 facts 全 ok |

## 5. 功能需求（FR）

- **FR-001**（C01）：`contracts.mjs` + `ProjectArtifact` / `ConstitutionVersion` 类型；新增 `bin/project-artifacts.mjs`（hash / 清单 / upsert / refresh drift）。
- **FR-002**（C02）：新增 `bin/constitution.mjs`：`computeConstitutionVersion` / `lockConstitutionVersion` / `getCurrentConstitutionVersion` / `listConstitutionVersions` / `diffConstitutionVersions` / `buildConstitutionSnapshot`；version = `constitution-<sha12>`（内容决定，天然不可变）。
- **FR-003**（C03）：`governance.validateProfile` 接受可选 `constitution_version` / `artifacts` / `skills`；`updateProfileConstitution` 回写助手；旧 profile 仍可读。
- **FR-004**（C04）：`harness/constitution/` 产出 8 份制品（project-overview / tech-stack+json / architecture+json / engineering / testing / acceptance / agent-rules）+ skills 计算制品；`product` 槽位记 `not_applicable`（理由：引擎无独立业务规则，已并入 project-overview）并列入报告待人工决策。
- **FR-005**（C05）：`startTask` 冻结 constitution 快照（无制品 → null，不阻塞）。
- **FR-006**（C06）：`buildContextPack` 增加 `constitution` 选择段（按任务相关性 + 上限）。
- **FR-007**（C07/C08）：`ARCHITECTURE_IMPACTS` / `TECH_STACK_IMPACTS` 常量（contracts.mjs）+ `task impact` 子命令；`ARCHITECTURE_CHANGE` / `TECH_STACK_CHANGE` 必须伴随 Decision（否则拒绝）。
- **FR-008**（C09/C10）：`bin/constitution-change.mjs`：drift 检测（复用 refreshArtifacts）、`openChangeProposal` / `applyChangeProposal`、`assessSkillImpact` / `recordSkillDisposition` / `pendingSkillDispositions`。
- **FR-009**（C11）：`bin/approvals.mjs`：Approval 形状 `{id, taskId, type, artifact_hash, summary, approved_at, status}`；`listApprovals` / `approvalStatuses` / `validApprovals`；`gate-commands.clearGateCheck` 在清 `user-confirmed`/`design-confirmed` 时自动记录绑定（含 files → hash）。
- **FR-010**（C12）：`bin/fact-gates.mjs`：`deriveGateFacts`（4 facts，全部来自真实事实：Approval / changePlan / 新鲜证据）。
- **FR-011**（C13）：`bin/constitution-compliance.mjs`：`reviewArchitectureCompliance` / `reviewTechStackCompliance`（消费机读制品；violation → Finding，blocking 按 severity）；接入 `domain-supervisors`。
- **FR-012**（C14）：`finishCommand` 在 `config.strictGovernance === true` 时执行 `evaluateStrictFinish`；缺失 → `REQUIRED_ACTIONS`（含可执行 next action）+ exit 非 0；Local 兼容路径不变。
- **FR-013**：CLI：`harness constitution:status|lock|diff`、`constitution:change|apply|skills|approvals`、`harness task impact|facts`；`bin/harness.mjs` 冒号分支接线。
- **FR-014**：文档同步（README / CHANGELOG / current-governance-baseline）。

## 6. 验收标准（AC）

| AC | 描述 | 测试位置 |
|---|---|---|
| AC-001 | ProjectArtifact / ConstitutionVersion 契约校验生效 | `bin/contracts.test.mjs` |
| AC-002 | 制品 hash 复算与 drift（ACTIVE→STALE） | `bin/project-artifacts.test.mjs` |
| AC-003 | version 计算/锁定/不可变/current/diff | `bin/constitution.test.mjs` |
| AC-004 | Task 冻结：有 Constitution → 快照；无 → null | `bin/constitution.test.mjs` |
| AC-005 | Context Pack 含 constitution 选择且 ≤ limit | `bin/constitution.test.mjs` |
| AC-006 | 变更流：proposal → apply → 新 version + skills impact | `bin/constitution-change.test.mjs` |
| AC-007 | Approval 绑定与 staleness | `bin/approvals.test.mjs` |
| AC-008 | 4 个事实门判定 | `bin/fact-gates.test.mjs` |
| AC-009 | 合规审查：deny 依赖 / 受限技术 → blocking | `bin/constitution-compliance.test.mjs` |
| AC-010 | 严格收尾：缺失事实 → REQUIRED_ACTIONS | `bin/fact-gates.test.mjs` |
| AC-011 | 全量回归 + 文档三门 | 命令实测 |

## 7. 技术影响

- **Architecture Impact**：`CROSS_MODULE`（task-orchestrator / gate-commands / project-brain / domain-supervisors / governance / harness.mjs 接线 + 6 个新模块；不改变既有语义，仅增量）。
- **Tech Stack Impact**：`NONE`（零新依赖；哈希复用 `node:crypto`）。
- **In Scope**：C01-C14 + Batch C 验收的 3 个 dogfooding Task。**Out of Scope**：Batch D（Cloud/SQLite/HTTP/Key）、MCP 新工具（冻结面不动）、product.md 模板（待人工决策）、Blocking Findings 与 Supervisor 报告的持久化关联（后续批次）。

## 8. 测试计划

6 个新测试文件（temp git 仓库 / 注入制品）+ `contracts.test.mjs` 扩展 + 全量 `test:core` + `docs:check` / `doc-impact` / `readme:sync` + `reuse-adherence`。

## 9. 文档同步清单

`README.md`、`CHANGELOG.md`、`docs/current-governance-baseline.md`（Constitution 段 + 回归命令）。
