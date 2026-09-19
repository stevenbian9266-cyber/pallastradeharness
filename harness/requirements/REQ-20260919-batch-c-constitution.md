# 需求文档 REQ-20260919-batch-c-constitution.md

> 对应 PRD：`docs/prd/other/PRD-20260919-other-batch-c-constitution-集成.md`
> Task: TASK-20260919084823-c0b3bcb3 / Gate: GATE-2026-09-19T08-48-27
> 上游：`pallastradeharness Phase 1 AI 实施指令.md` §四（Batch C）；`harness方案.md` §16-17/§44/§50/§55/§66-67/§94-95

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | `ProjectArtifact` / `ConstitutionVersion` / `artifact_hash` / `strictGovernance` | 无（净新增）；挂点：`task-orchestrator.startTask/finishCommand`、`gate-commands.clearGateCheck`、`project-brain.buildContextPack`、`domain-supervisors.runDomainReviewers`、`governance.validateProfile`、`evidence.verifyTaskEvidence` | ❌ 净新增 + 6 处增量挂点 |
| presets | `presets/` | `constitution` / `approval` | 无 | 不涉及 |
| templates | `templates/` | `constitution` | 8 个模板 + 2 机读契约（Batch B 产出，本批次消费） | ✅ 模板已就绪 |
| rules | `rules/` | `constitution` | 无（`STD-ARCH-001/002`、`STD-TECH-001` 是合规审查的机器规则出口） | ⚠️ 规则存在，缺"由 Artifact 派生"的输入侧 |
| docs | `docs/` + 根 | `Constitution` | `harness方案.md` §44/§50/§55/§66/§94-95（精确语义：Approval 字段、staleness、Strict 检查清单、strictGovernance）、`current-governance-baseline.md` | ✅ 规格已定 |

### 搜索结论

- 本批次为**净新增 6 模块 + 6 处增量接线**；不重写 Task/Gate/Evidence/Skill/Supervisor 引擎；
- 语义对齐方案：Approval = `{id, task_id, type, artifact_hash, summary, approved_at, status}`（§94），
  `artifact_hash changed → STALE`（§95），Strict 检查清单（§66），`strictGovernance`（§67）；
- Local Runtime 继续文件化：制品 `harness/constitution/`、approvals `harness/constitution/approvals.json`、versions `harness/constitution/versions/`。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-skill-author/SKILL.md` | ✅ 已读 | Skill 输出结构与完成标准；C10 的 stale 处置（UPDATE / REVIEWED_NO_CHANGE）对标 `skill audit` 的 STALE 语义 |
| `skills/harness-standards-audit/SKILL.md` | ✅ 已读 | 机器可读规范与"权威文件"模式 → C13 由 Architecture/Tech Stack Artifact 派生合规检查，而非另写规则文案 |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 变更后知识同步 + `docs:check` + doc-impact 放行（C04 制品与文档批次） |
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 命名/AC→测试映射/确认门（本任务 PRD 与 11 个 AC） |

---

## 需求标题

Constitution 集成：ProjectArtifact / ConstitutionVersion / Task 冻结 / 事实驱动 Gate / Strict finish。

## 任务类型

新增（feature，引擎仓 self-dogfood，critical 风险——含 `bin/harness.mjs` 关键路径）。

## 需求描述（FR）

见 PRD §5（FR-001 ~ FR-014）。要点：
1. C01 `bin/project-artifacts.mjs` + 契约类型 `ProjectArtifact` / `ConstitutionVersion`；
2. C02 `bin/constitution.mjs`（version 计算/锁定/current/diff + Task 冻结快照 + Context 选择）；
3. C03 `governance.validateProfile` 向后兼容扩展；
4. C04 真实 Constitution 制品（8 份 + skills 计算制品 + `product` 记 not_applicable）；
5. C05 `startTask` 冻结；C06 `buildContextPack` 引入；
6. C07/C08 Impact 常量 + `task impact`；
7. C09/C10 `bin/constitution-change.mjs`（proposal/apply + skill impact/disposition）；
8. C11 `bin/approvals.mjs` + `clearGateCheck` 自动绑定；
9. C12 `bin/fact-gates.mjs`（4 facts）；C13 `bin/constitution-compliance.mjs`（接入 domain-supervisors）；
10. C14 `finishCommand` strict 模式 → `REQUIRED_ACTIONS`；
11. FR-013 CLI（`constitution:*` / `task impact|facts`）；FR-014 文档批次。

## 验收标准（AC，与 PRD 一致）

| AC | 描述 | 测试位置 |
|---|---|---|
| AC-001 | 契约校验（ProjectArtifact / ConstitutionVersion） | `bin/contracts.test.mjs` |
| AC-002 | 制品 hash + drift | `bin/project-artifacts.test.mjs` |
| AC-003 | version 锁定/不可变/current/diff | `bin/constitution.test.mjs` |
| AC-004 | Task 冻结快照（有/无 Constitution） | `bin/constitution.test.mjs` |
| AC-005 | Context Pack constitution 选择 ≤ limit | `bin/constitution.test.mjs` |
| AC-006 | 变更流 proposal→apply→新 version+skill impact | `bin/constitution-change.test.mjs` |
| AC-007 | Approval 绑定 + staleness | `bin/approvals.test.mjs` |
| AC-008 | 4 facts 判定 | `bin/fact-gates.test.mjs` |
| AC-009 | 合规审查 blocking | `bin/constitution-compliance.test.mjs` |
| AC-010 | 严格收尾 REQUIRED_ACTIONS | `bin/fact-gates.test.mjs` |
| AC-011 | 全量回归 + 文档三门 | 命令实测 |

## 文档同步清单

`README.md`、`CHANGELOG.md`、`docs/current-governance-baseline.md`。
