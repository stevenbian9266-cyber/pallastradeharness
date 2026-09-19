# 需求文档 REQ-20260919-batch-d-d02-d03-runtime-ports.md

> 对应 PRD：`docs/prd/other/PRD-20260919-other-batch-d-d02-d03-runtime-ports-file-适配器.md`
> Task: TASK-20260919100403-2ff1efa5 / Gate: GATE-2026-09-19T10-04-08
> 上游：`docs/rfc/0006-runtime-boundary.md`（D01）· `docs/adr/ADR-0002-runtime-boundary.md`（D1，已批准）

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | `Repository` / `Port` / `adapter` | 无端口/仓储抽象（存储访问全部为直接函数调用：state-store / project-artifacts / constitution / approvals / gate-commands / evidence） | ❌ 净新增（包装对象） |
| presets | `presets/` | `repository` / `port` | 无 | 不涉及 |
| templates | `templates/` | `repository` | 无（constitution 模板仅描述架构规则） | 不涉及 |
| rules | `rules/` | `repository` | 无 | 不涉及 |
| docs | `docs/` | `Repository` / `SqliteTaskRepository` | `docs/rfc/0006-runtime-boundary.md`（端口清单）、`harness方案.md` §69/§86/§120-122（设计源）、`docs/rfc/0005-hosted-service.md` §4.1（DDL） | ✅ 规格已定 |

### 搜索结论

- 端口与 File 适配器为**净新增**；被包装函数全部已存在（清单见技术方案 Part A A4）；
- **禁止重写**：适配器只做"方法名映射 + 缺失语义归一（未知 → null）"；
- 契约套件必须与 File 解耦（AC-003），供 D07 Sqlite 适配器复用（同一套行为测试）。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-standards-audit/SKILL.md` | ✅ 已读 | 机器可读契约应"结构 + 校验器"分离 → 端口采用 method 清单 + `validatePortImplementation` |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 变更后跑 `docs:check`/`doc-impact`，人确认后写回 → 本任务文档清单 |
| `skills/harness-skill-author/SKILL.md` | ✅ 已读（前批次） | Skill 结构不涉及本任务（无 Cloud 领域 Skill，如实记录） |

---

## 需求标题

Batch D D02/D03：Runtime Ports（7 端口）+ File 适配器 + 可复用契约测试套件。

## 任务类型

新增（feature，引擎仓 self-dogfood；critical 风险——工作区含关键路径文件）。

## 需求描述（FR）

1. **FR-001**：`bin/runtime-ports.mjs`：`RUNTIME_PORT_KINDS`（ProjectRepository / ArtifactRepository / TaskRepository / GateRepository / ApprovalRepository / EvidenceRepository / EventRepository）、`RUNTIME_PORT_METHODS`、`validatePortImplementation`、`isPortImplementation`、`CLOUD_FORBIDDEN_IMPORTS`。
2. **FR-002**：`bin/file-repositories.mjs`：`createFileRepositories({ rootDir, config })` → 7 个 File 适配器（逐一包装既有函数；Event 用本地 JSONL `<state>/events/<taskId>.ndjson`；缺省语义统一为 `null`，不抛出）。
3. **FR-003**：`bin/repository-contract.mjs`：`runRepositoryContractTests({ kind, makeRepository, label })` —— 同一套行为断言可跑 File 与 Sqlite（D07）。
4. **FR-004**：测试 `bin/runtime-ports.test.mjs`（AC-001/004）+ `bin/file-repositories.test.mjs`（AC-002，7 端口契约）。
5. **FR-005**：行为零变化（不改既有函数/测试/调用点）。
6. **FR-006**：ADR-0002 → ACCEPTED；README/CHANGELOG 同步。

## 验收标准（AC，与 PRD 一致）

| AC | 描述 | 测试位置 |
|---|---|---|
| AC-001 | 端口定义与校验器（缺方法/非函数 → 拒绝） | `bin/runtime-ports.test.mjs` |
| AC-002 | 7 个 File 适配器通过契约套件 | `bin/file-repositories.test.mjs` |
| AC-003 | 契约套件与 File 解耦（可被 Sqlite 复用） | 套件源码不 import file-repositories |
| AC-004 | Cloud 禁 import 清单（fs/child_process）存在并可断言 | `bin/runtime-ports.test.mjs` |
| AC-005 | 行为零变化：`test:core` 全绿、既有测试零修改 | 命令实测 |
| AC-006 | docs:check / doc-impact / readme:sync 通过 | 命令实测 |

## 文档同步清单

`docs/adr/ADR-0002-runtime-boundary.md`、`README.md`、`CHANGELOG.md`。
