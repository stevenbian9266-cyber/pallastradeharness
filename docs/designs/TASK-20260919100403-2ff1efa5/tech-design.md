# 技术方案（Tech Design）— TASK-20260919100403-2ff1efa5

> 设计阶段产物 **4/4（核心）**。对应 PRD：`PRD-20260919-other-batch-d-d02-d03-runtime-ports-file-适配器`；Task：TASK-20260919100403-2ff1efa5
> 前置：Part A 事实来源 = RFC-0006 §2（D01 实测扫描）+ 直接源码核对（8 个模块导出清单，2026-09-19）。

## Part A — 现状识别（强制，缺此段方案无效）

### A1 业务系统盘点

| 现有模块/分组 | 边界 | 新功能归属 |
|---|---|---|
| `bin/state-store.mjs` | 状态根路径 / 原子写 / Task 持久化 / 指纹 | **复用（包装）**：Task Repository File 适配器 |
| `bin/gate-commands.mjs` | Gate 文件读写与快照 | **复用（包装）**：Gate Repository File 适配器 |
| `bin/evidence.mjs` | 证据记录/列表/束 | **复用（包装）**：Evidence Repository File 适配器 |
| `bin/approvals.mjs` | 审批记录/清单/失效状态 | **复用（包装）**：Approval Repository File 适配器 |
| `bin/project-artifacts.mjs` | 制品清单/上架/刷新 | **复用（包装）**：Artifact Repository File 适配器 |
| `bin/constitution.mjs` / `bin/governance.mjs` | Constitution 版本 / 治理画像 | **复用（包装）**：Project Repository File 适配器 |
| （不存在） | 端口/适配器抽象 | **新增**：`runtime-ports` / `file-repositories` / `repository-contract` |

### A2 数据模型识别

无迁移、无数据库。唯一新增**本地轻量存储**：

| 产物 | 归属 | 说明 |
|---|---|---|
| `<paths.state>/events/<taskId>.ndjson` | `.harness-state`（既有状态根） | Event 端口 File 实现的 JSONL 追加日志（每行 `{at,type,payload}`）；不进 Git、不做保留策略（Cloud 侧由 D06 决定） |

### A3 字段盘点（端口契约）

| kind | 方法面 | 语义 |
|---|---|---|
| ProjectRepository | getProfile · listArtifacts · getConstitutionVersion | 画像 / 制品清单 / 当前版本（只读） |
| ArtifactRepository | list · get · upsert · refresh | 制品存储与漂移刷新 |
| TaskRepository | list · get · save | Task 持久化（get 缺省 → null） |
| GateRepository | loadLatest · statusSnapshot | 最新 Gate 读取与状态快照 |
| ApprovalRepository | list · record · statuses | 审批记录与 VALID/STALE 判定 |
| EvidenceRepository | list · record · bundle | 证据存储与束构建 |
| EventRepository | append · list | 事件追加与按序读取（新本地 JSONL） |

### A4 代码结构

| 公共方法/符号 | 位置 | 签名/说明 |
|---|---|---|
| `loadTask` / `listTasks` / `saveTask` / `statePaths` | `bin/state-store.mjs` | Task 读写与状态根（复用） |
| `loadLatestGate` / `gateStatusSnapshot` | `bin/gate-commands.mjs` | Gate 读取/快照（复用） |
| `recordEvidence` / `listEvidence` / `buildEvidenceBundle` | `bin/evidence.mjs` | 证据存储（复用） |
| `recordApproval` / `listApprovals` / `approvalStatuses` | `bin/approvals.mjs` | 审批（复用） |
| `listArtifacts` / `getArtifact` / `upsertArtifact` / `refreshArtifacts` | `bin/project-artifacts.mjs` | 制品（复用） |
| `readProfile` | `bin/governance.mjs` | 治理画像（复用） |
| `getCurrentConstitutionVersion` | `bin/constitution.mjs` | Constitution 版本（复用） |
| `validatePortImplementation` / `isPortImplementation` | 新增 `bin/runtime-ports.mjs` | 端口定义与校验 |
| `createFileRepositories` | 新增 `bin/file-repositories.mjs` | File 适配器工厂 |
| `runRepositoryContractTests` | 新增 `bin/repository-contract.mjs` | 可复用契约套件（File/Sqlite 共用） |

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| Task 读取 | 调用已有 | loadTask | bin/state-store.mjs |
| Task 列表 | 调用已有 | listTasks | bin/state-store.mjs |
| Task 保存 | 调用已有 | saveTask | bin/state-store.mjs |
| 状态根路径 | 调用已有 | statePaths | bin/state-store.mjs |
| Gate 最新读取 | 调用已有 | loadLatestGate | bin/gate-commands.mjs |
| Gate 状态快照 | 调用已有 | gateStatusSnapshot | bin/gate-commands.mjs |
| 证据记录 | 调用已有 | recordEvidence | bin/evidence.mjs |
| 证据列表 | 调用已有 | listEvidence | bin/evidence.mjs |
| 证据束构建 | 调用已有 | buildEvidenceBundle | bin/evidence.mjs |
| 审批记录 | 调用已有 | recordApproval | bin/approvals.mjs |
| 审批清单 | 调用已有 | listApprovals | bin/approvals.mjs |
| 审批状态 | 调用已有 | approvalStatuses | bin/approvals.mjs |
| 制品清单 | 调用已有 | listArtifacts | bin/project-artifacts.mjs |
| 制品读取 | 调用已有 | getArtifact | bin/project-artifacts.mjs |
| 制品上架 | 调用已有 | upsertArtifact | bin/project-artifacts.mjs |
| 制品刷新 | 调用已有 | refreshArtifacts | bin/project-artifacts.mjs |
| 治理画像 | 调用已有 | readProfile | bin/governance.mjs |
| Constitution 版本 | 调用已有 | getCurrentConstitutionVersion | bin/constitution.mjs |
| 事件目录创建 | 调用已有 | mkdirSync | bin/state-store.mjs |
| 端口校验器 | 新封装公用 | validatePortImplementation | bin/runtime-ports.mjs（被 file-repositories / 测试引用） |
| 适配器工厂 | 新封装公用 | createFileRepositories | bin/file-repositories.mjs（被契约测试引用） |
| 契约测试套件 | 新封装公用 | runRepositoryContractTests | bin/repository-contract.mjs（被 file 测试与 D07 sqlite 测试引用） |
| 事件文件路径 | 新建局部 | eventsFile | 仅 bin/file-repositories.mjs 内部使用 |

## Part C — 实施落点

### C1 新增/修改文件清单

| 文件路径 | 操作 | 说明 |
|---|---|---|
| `bin/runtime-ports.mjs` | 新增 | kinds/methods/校验器/CLOUD_FORBIDDEN_IMPORTS |
| `bin/file-repositories.mjs` | 新增 | `createFileRepositories`（7 适配器，逐一包装） |
| `bin/repository-contract.mjs` | 新增 | `runRepositoryContractTests`（node:test 驱动，File/Sqlite 共用） |
| `bin/runtime-ports.test.mjs` | 新增 | 定义/校验器/禁 import 清单用例 |
| `bin/file-repositories.test.mjs` | 新增 | 对 7 适配器运行契约套件 |
| `docs/adr/ADR-0002-runtime-boundary.md` | 修改 | 状态 → ACCEPTED + 授权记录 |
| `README.md` / `CHANGELOG.md` | 修改 | 运行时端口层说明与变更记录 |

### C2 分层改动

- 端口层（新）：纯定义 + 校验（无 IO）；
- 适配层（新）：包装既有存储函数，仅做映射与缺省归一；
- 测试层（新）：契约套件与具体实现解耦，供 Sqlite（D07）复用。

### C3 依赖与实施顺序

1. `runtime-ports`（定义冻结）→ 2. `file-repositories`（包装）→ 3. `repository-contract`（套件）→ 4. 两个测试文件 → 5. ADR/README/CHANGELOG 同步 → 6. 全链验证（test:core / docs 三门 / supervise / reuse-adherence）。

### C4 风险与回滚

- 风险 A：适配器"偷偷实现业务规则" → 评审项 + 契约测试只断言既有语义；套件中不 import File 实现（AC-003）；
- 风险 B：契约套件与 node:test 耦合过深 → 套件仅导出运行器，断言均在套件内闭环，Sqlite 侧零改动复用；
- 风险 C：Event JSONL 为新增本地存储 → 仅追加、独立目录、不影响既有状态；如不接受可整文件删除回滚；
- 回滚：删除 5 个新增文件 + 还原 3 个文档即可（既有函数与调用点零改动）。
