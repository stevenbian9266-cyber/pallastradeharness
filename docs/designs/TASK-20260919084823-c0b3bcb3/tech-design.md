# 技术方案（Tech Design）— TASK-20260919084823-c0b3bcb3

> 设计阶段产物 **4/4（核心）**。对应 PRD：`PRD-20260919-other-batch-c-constitution-集成`；Task：TASK-20260919084823-c0b3bcb3
> 前置：Part A 事实来源 = 跨层搜索（2026-09-19）+ 源码核对（task-orchestrator / gate-commands / project-brain / domain-supervisors / governance / evidence）。

## Part A — 现状识别（强制，缺此段方案无效）

### A1 业务系统盘点

| 现有模块/分组 | 边界 | 新功能归属 |
|---|---|---|
| `bin/contracts.mjs` | 契约层（17 类型） | **扩展**：`ProjectArtifact` / `ConstitutionVersion` + 两组 Impact 枚举 |
| `bin/task-orchestrator.mjs` | Task 状态机 / startTask / finishCommand | **扩展**：冻结 Constitution（C05）、`impact` 子命令（C07/C08）、strict 收尾（C14） |
| `bin/gate-commands.mjs` | 门禁生命周期（clearGateCheck） | **扩展**：清理 human-WAIT 时自动记录 Approval 绑定（C11） |
| `bin/project-brain.mjs` | Context Pack 选择 | **扩展**：constitution 选择段（C06） |
| `bin/domain-supervisors.mjs` | 域审查注册表 | **扩展**：architecture / tech-stack 合规审查（C13） |
| `bin/governance.mjs` | 治理画像（JSON 存 `.yaml`） | **扩展**：可选 `constitution_version` / `artifacts` / `skills`（C03） |
| `bin/harness.mjs` | CLI 分发 | **扩展**：`constitution:*` 分支（FR-013，critical 路径） |
| `harness/constitution/**` | （不存在） | **新增**：制品 + 清单 + 快照 + 审批 + 变更提案（C01/C02/C04/C09/C11） |

### A2 数据模型识别

| 产物 | 归属 | 说明 |
|---|---|---|
| `harness/constitution/artifacts.json` | 项目状态 | ProjectArtifact[]（id/type/path/hash/status/时间戳） |
| `harness/constitution/versions/<version>.json` | 项目状态（不可变） | ConstitutionVersion 快照（含全部制品 hash） |
| `harness/constitution/current.json` | 项目状态 | 当前 version 指针 |
| `harness/constitution/approvals.json` | 项目状态 | Approval[]（含 artifact_hash / approved_at / status） |
| `harness/constitution/changes/<id>.json` | 项目状态 | Change Proposal（OPEN/CLOSED） |
| `harness/constitution/skill-dispositions.json` | 项目状态 | Skill 处置记录（UPDATE / REVIEWED_NO_CHANGE） |
| `harness/constitution/*.md|json` | 项目真值 | 8 份 Constitution 制品（C04） |

无数据库；不写 `.harness-state`（Approval 由 gate 流程自动记录）。

### A3 字段盘点

| 契约 | 必填字段 | 枚举/约束 |
|---|---|---|
| `ProjectArtifact` | id · type · path · template_id · template_version · artifact_version · content_hash · status · created_at · updated_at | status ∈ ACTIVE/STALE/SUPERSEDED；content_hash `sha256:…`；artifact_version semver |
| `ConstitutionVersion` | version · created_at · artifacts | version `constitution-<hex12>`；artifacts 非空 `{id, hash, status}` |
| Approval（方案 §94） | id · taskId · type · artifact_hash · summary · approved_at · status | type ∈ baseline/requirement/ui/architecture/tech_stack/high_risk/waiver；status ∈ VALID/STALE/UNBOUND |
| Impact（C07/C08） | task.impact.architecture / techStack | NONE/LOCAL/CROSS_MODULE/ARCHITECTURE_CHANGE；NONE/DEPENDENCY_CHANGE/TECH_STACK_CHANGE |

### A4 代码结构

| 公共方法/符号 | 位置 | 说明 |
|---|---|---|
| `validateContract` / `createContract` | `bin/contracts.mjs` | 复用：两个新契约 + 校验 |
| `atomicWriteJson` / `readJson` | `bin/state-store.mjs` | 复用：快照/清单原子写 |
| `verifyTaskEvidence` | `bin/evidence.mjs` | 复用：TESTS_PASS 与所需证据判定 |
| `hashFile` / `refreshArtifacts` | 新增 `bin/project-artifacts.mjs` | C01 |
| `lockConstitutionVersion` / `buildConstitutionSnapshot` / `selectConstitutionContext` | 新增 `bin/constitution.mjs` | C02/C05/C06 |
| `detectConstitutionDrift`（= refresh 差分）/ `applyChangeProposal` / `assessSkillImpact` | 新增 `bin/constitution-change.mjs` | C09/C10 |
| `listApprovals` / `approvalStatuses` / `recordApproval` | 新增 `bin/approvals.mjs` | C11 |
| `deriveGateFacts` / `evaluateStrictFinish` | 新增 `bin/fact-gates.mjs` | C12/C14 |
| `collectArchitectureViolations` / `collectTechStackViolations` | 新增 `bin/constitution-compliance.mjs` | C13 |

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| 契约构造与校验 | 调用已有 | validateContract | bin/contracts.mjs |
| 契约对象创建 | 调用已有 | createContract | bin/contracts.mjs |
| 原子写盘 | 调用已有 | atomicWriteJson | bin/state-store.mjs |
| 证据判定 | 调用已有 | verifyTaskEvidence | bin/evidence.mjs |
| Task 创建挂点（冻结） | 扩展已有 | startTask | bin/task-orchestrator.mjs |
| Task 收尾挂点（strict） | 扩展已有 | finishVerifiedTask | bin/task-orchestrator.mjs |
| Context Pack 挂点 | 扩展已有 | buildContextPack | bin/project-brain.mjs |
| 域审查挂点 | 扩展已有 | reviewDomainSupervisors | bin/domain-supervisors.mjs |
| 人工确认挂点 | 扩展已有 | clearGateCheck | bin/gate-commands.mjs |
| 画像校验挂点 | 扩展已有 | validateProfile | bin/governance.mjs |
| 制品清单/哈希 | 新封装公用 | refreshArtifacts | bin/project-artifacts.mjs（被 constitution / change / 测试引用） |
| 版本锁定 | 新封装公用 | lockConstitutionVersion | bin/constitution.mjs（被 change / CLI / 测试引用） |
| 事实门推导 | 新封装公用 | deriveGateFacts | bin/fact-gates.mjs（被 task-orchestrator / 测试引用） |
| 严格收尾评估 | 新封装公用 | evaluateStrictFinish | bin/fact-gates.mjs（被 task-orchestrator / 测试引用） |
| 审批清单与失效 | 新封装公用 | approvalStatuses | bin/approvals.mjs（被 fact-gates / 测试引用） |
| 技术栈合规 | 新封装公用 | collectTechStackViolations | bin/constitution-compliance.mjs（被 domain-supervisors / 测试引用） |
| 架构合规 | 新封装公用 | collectArchitectureViolations | bin/constitution-compliance.mjs（被 domain-supervisors / 测试引用） |
| 变更提案应用 | 新封装公用 | applyChangeProposal | bin/constitution-change.mjs（被 CLI / 测试引用） |
| 技能影响评估 | 新封装公用 | assessSkillImpact | bin/constitution-change.mjs（被 applyChangeProposal / 测试引用） |
| 制品槽位常量 | 新建局部 | CORE_ARTIFACT_SLOTS | 仅 bin/constitution.mjs 内部 |

## Part C — 实施落点

### C1 新增/修改文件清单

| 文件路径 | 操作 | 说明 |
|---|---|---|
| `bin/project-artifacts.mjs` / `.test.mjs` | 新增 | C01 + hash/drift |
| `bin/constitution.mjs` / `.test.mjs` | 新增 | C02/C05/C06 + CLI runner |
| `bin/constitution-change.mjs` / `.test.mjs` | 新增 | C09/C10 |
| `bin/approvals.mjs` / `.test.mjs` | 新增 | C11 |
| `bin/fact-gates.mjs` / `.test.mjs` | 新增 | C12/C14 |
| `bin/constitution-compliance.mjs` / `.test.mjs` | 新增 | C13 |
| `bin/contracts.mjs` / `.test.mjs` | 修改 | 2 契约 + 2 枚举 + fixtures |
| `bin/task-orchestrator.mjs` | 修改 | C05/C07/C08/C14 + `impact`/`facts` 子命令 |
| `bin/gate-commands.mjs` | 修改 | C11 绑定记录 |
| `bin/project-brain.mjs` | 修改 | C06 |
| `bin/domain-supervisors.mjs` | 修改 | C13 接线 |
| `bin/governance.mjs` | 修改 | C03 |
| `bin/harness.mjs` | 修改 | FR-013 分支 + help（critical 路径） |
| `harness/constitution/**` | 新增 | C04 制品 + 清单 + 首版快照 |
| `README.md` / `CHANGELOG.md` / `docs/current-governance-baseline.md` | 修改 | 文档批次 |

### C2 分层改动

- 契约层 → 制品层（hash/清单）→ 版本层（快照/差异）→ 变更层（proposal/skill impact）→ 审批层（绑定/失效）→ 事实层（facts/strict）→ 合规层（supervisor findings）→ 接线层（task/gate/brain/CLI）。

### C3 依赖与实施顺序

1. 契约 → 2. 制品/版本/审批模块 + 测试 → 3. 变更流 + 技能影响 → 4. 事实门 + 严格收尾 → 5. 合规审查 → 6. 六处接线 → 7. C04 制品与首版锁定 → 8. 文档 + 全链验证。

### C4 风险与回滚

- 风险 A：`startTask` 增加冻结逻辑 → 无制品时必须 null 且不抛错（测试覆盖）；
- 风险 B：strict 模式误伤 Local 流程 → 默认关闭；测试断言 Local 路径行为不变；
- 风险 C：循环依赖（task-orchestrator ⇄ constitution）→ 单向依赖：task-orchestrator → constitution → project-artifacts；change → constitution；fact-gates → approvals/constitution/evidence；
- 回滚：删除新模块与接线分支；`harness/constitution/` 为纯新增目录。
