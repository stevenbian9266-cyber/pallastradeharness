# PRD-20260919-other-batch-d-d02-d03-runtime-ports-file-适配器

| 元数据 | 值 |
|---|---|
| 状态 | approved（授权：ADR-0002 已获人工"自主决定"批准；对话指令"自主决定"） |
| 创建日期 | 2026-09-19 |
| 来源 | Batch D 实施第一批：D02 Runtime Ports + D03 Local File Adapters |
| 分类 | other（自动判定） |
| 上游规格 | `docs/rfc/0006-runtime-boundary.md`（D01 矩阵与端口计划）· `docs/adr/ADR-0002-runtime-boundary.md`（D1 决策） |
| 关联任务 | TASK-20260919100403-2ff1efa5 / GATE-2026-09-19T10-04-08 |

## 1. 背景

- Batch D 目标：抽出 **Governance Core + Local Runtime + Cloud Runtime** 三层运行时边界（RFC-0006 §1-3）。
- D01 实测：78 模块中 68 依赖 `node:fs`、16 涉及 Git——治理语义与 Local I/O 高耦合（架构制品 known_debt 第一项）。
- ADR-0002 D1 已批准：**端口 + 适配器渐进抽取**——新增 Repository 端口，Local 以 File* 适配器包装现状（行为零变化），Cloud 后续提供 Sqlite* 实现。
- 本任务 = 抽取地基：**端口定义 + File 适配器 + 可复用契约测试套件**（为 D07 双适配器验证铺路）。

## 2. 目标

1. 定义 7 个存储端口（Project/Artifact/Task/Gate/Approval/Evidence/Event）及其方法清单与校验器；
2. 提供覆盖全部 7 端口的 **File 适配器**（包装既有 `state-store` / `project-artifacts` / `constitution` / `approvals` / `gate-commands` / `evidence` / `governance` 等函数，禁止重写）；
3. 提供**可复用契约测试套件**（同一套行为断言可对 File 与将来的 Sqlite 适配器运行）；
4. 冻结 Cloud 禁 import 清单（D08/D10 的 import 白名单测试将复用）。

## 3. 成功指标

- `validatePortImplementation` 正/反例行为正确（缺方法、非函数均拒绝）；
- 7 个 File 适配器通过整套契约测试（行为与现状一致：读回写、缺省语义、错误语义）；
- `test:core` 全绿且**既有测试文件零修改**（行为零变化）；
- 契约套件可被第三方适配器复用（导出函数，无 File 专属假设）。

## 4. 场景

| # | 场景 | 期望 |
|---|---|---|
| A | 端口中查缺方法 | `validatePortImplementation` 返回 ok=false + missing 列表 |
| B | Task 适配器读写 | `save` 后可 `get` 读回；未知 task → `null`（不抛出） |
| C | Gate 适配器 | `loadLatest` 返回既有 gate 状态；`statusSnapshot` 与既有函数一致 |
| D | Evidence 适配器 | `record` 后可 `list`；`bundle` 输出与既有函数一致 |
| E | Approval 适配器 | `record` 后可 `list`/`statuses`（含 STALE 语义） |
| F | Artifact 适配器 | `upsert` 后可 `get`；`refresh` 输出 drift |
| G | Project 适配器 | 返回画像/制品清单/当前 Constitution 版本 |
| H | Event 适配器 | `append` 后 `list` 按序返回（本地 JSONL 存储） |

## 5. 功能需求（FR）

- **FR-001**：`bin/runtime-ports.mjs` 导出 `RUNTIME_PORT_KINDS`（7）、`RUNTIME_PORT_METHODS`、`validatePortImplementation(kind, impl)`、`isPortImplementation`、`CLOUD_FORBIDDEN_IMPORTS`（`node:fs`/`node:child_process`）。
- **FR-002**：`bin/file-repositories.mjs` 导出 `createFileRepositories({ rootDir, config })` 返回 7 个适配器（每个含 `kind`），方法**逐一包装**既有函数（Task=state-store；Gate=gate-commands；Evidence=evidence.mjs；Approval=approvals.mjs；Artifact=project-artifacts.mjs；Project=governance+project-artifacts+constitution；Event=新增本地 JSONL，落 `<state>/events/<taskId>.ndjson`）。
- **FR-003**：`bin/repository-contract.mjs` 导出 `runRepositoryContractTests({ kind, makeRepository, label })`（内部使用 `node:test`/`node:assert`，逐 kind 生成行为用例；File/Sqlite 共用）。
- **FR-004**：`bin/runtime-ports.test.mjs`（定义与校验器用例）+ `bin/file-repositories.test.mjs`（对 7 个适配器跑契约套件）。
- **FR-005**：不改变任何既有函数签名与行为；不改既有测试文件；不接线生产调用点（D10 起按需接线，本任务只交付可复用层）。
- **FR-006**：文档同步：`docs/adr/ADR-0002-runtime-boundary.md` 状态 → ACCEPTED（含授权记录）；README/CHANGELOG 增补。

## 6. 验收标准（AC）

| AC | 描述 | 测试位置 |
|---|---|---|
| AC-001 | 7 端口定义 + 校验器正反例 | `bin/runtime-ports.test.mjs` |
| AC-002 | 7 个 File 适配器契约测试全绿（含缺省/错误语义） | `bin/file-repositories.test.mjs` |
| AC-003 | 契约套件与 File 实现解耦（仅依赖端口方法面） | 套件内不 import `file-repositories.mjs` |
| AC-004 | Cloud 禁 import 清单存在且被测试引用（防回退） | `bin/runtime-ports.test.mjs` |
| AC-005 | 行为零变化：`test:core` 全绿 + 既有测试零修改 | 命令实测 |
| AC-006 | 文档三门通过（docs:check / doc-impact / readme:sync） | 命令实测 |

## 7. 技术影响

- **Architecture Impact**：`CROSS_MODULE`（新增抽象层，包装多模块；不改变既有调用关系与行为）。
- **Tech Stack Impact**：`NONE`（零新依赖；本地 JSONL 用 `node:fs`）。
- **In Scope**：D02/D03。**Out of Scope**：D04/D05 Provider 抽象、D06/D07 SQLite、D10+ HTTP/Cloud、生产调用点接线、`strict:true` 启用（D13 单独决策）。

## 8. 测试计划

- 新增 2 个测试文件（端口 + 适配器契约）；契约套件自身不含 File 专属断言；
- 全量回归 `node --test "bin/*.test.mjs"`；文档三门；supervise 审查。

## 9. 文档同步清单

`docs/adr/ADR-0002-runtime-boundary.md`（状态）、`README.md`、`CHANGELOG.md`（+ 本 PRD/REQ/设计产物）。
