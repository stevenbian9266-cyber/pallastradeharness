# 交互设计 — TASK-20260919100403-2ff1efa5（D02/D03 Runtime Ports）

> 适用性：**部分适用** — 无 UI 交互；存在"调用方 ↔ 端口/适配器"的**程序化交互契约**（本文件固化）。

## 1. 交互主体与路径

| 主体 | 入口 | 交互 | 结果 |
|---|---|---|---|
| D07 Sqlite 适配器 | `RUNTIME_PORT_METHODS` + `validatePortImplementation` | 按 kind 实现方法面 → 自检 | `{ok, errors, missing}` |
| D10 Cloud 应用层 | `createFileRepositories` 的同类工厂（未来 `createSqliteRepositories`） | 按端口方法调用 | 与 Local 同语义 |
| 测试套件 | `runRepositoryContractTests({ kind, makeRepository, label })` | 对任意适配器运行同一套行为断言 | 每 kind 一组用例（前缀 = label） |

## 2. 契约细节（冻结）

- **kind 命名**：`ProjectRepository` · `ArtifactRepository` · `TaskRepository` · `GateRepository` · `ApprovalRepository` · `EvidenceRepository` · `EventRepository`（`RUNTIME_PORT_KINDS` 冻结）。
- **方法面**（`RUNTIME_PORT_METHODS`，D02 冻结；扩展需 ADR）：
  - Project：`getProfile` `listArtifacts` `getConstitutionVersion`
  - Artifact：`list` `get` `upsert` `refresh`
  - Task：`list` `get` `save`
  - Gate：`loadLatest` `statusSnapshot`
  - Approval：`list` `record` `statuses`
  - Evidence：`list` `record` `bundle`
  - Event：`append` `list`
- **缺失语义统一**：`get` 类方法的"不存在"返回 `null`（不得抛出）；写操作失败按既有函数语义抛出（fail-loud）。
- **纯函数约束**：适配器方法**不得**自行实现业务规则——只允许做"参数映射 + 缺失归一 + 存储路径解析"（违反即视为重写，ARCH-R1）。
- **身份字段**：每个适配器自带 `kind` 属性（供校验器与日志使用）。
- **本地产物位置**：Event 适配器写 `<paths.state>/events/<taskId>.ndjson`（JSONL，每行 `{at,type,payload}`）；不触碰既有目录结构。

## 3. 边界与不做的事

- 不接线生产调用点（D10 起按需）；不新增 CLI/MCP 暴露；
- 不引入 Cloud 分支（`if (cloud)` 属违规，ARCH-R4）；Cloud 以**新适配器实现**而非条件分支落地。
