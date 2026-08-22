# REQ-20260822-trust-kernel-p0-2

- **任务**: 优化：实施 Harness 可信化升级（P0 第二批：Evidence snapshot 集成 + gate:required staged tree 绑定）
- **Gate**: GATE-2026-08-22T14-38-15
- **Task**: TASK-20260822143808-a9cd150e
- **日期**: 2026-08-22
- **类型**: 功能优化（Harness 引擎自身可信化）
- **权威方案**: `harness优化升级实施方案-20260820.md` §5.1（P0-1 ChangeSnapshot：实现要求 3/4/5）
- **承上**: REQ-20260822-trust-kernel-p0-1（ChangeSnapshot 基础已落地）；用户已于 2026-08-22 确认 PRD-20260822-other-实施-harness-可信化与易用性升级 并授权 P0 分批实施

## 需求描述

将 ChangeSnapshot 集成进证据与提交路径，消除 TOCTOU（F-01）：

1. **HTH-003（Evidence 前后 snapshot）**：`evidence run`/`record` 开始前生成 start snapshot，结束后重算 end snapshot；若期间发生变化（staged tree / 允许范围文件 / 配置）则证据标记 `superseded`，不能作为有效验证。
2. **HTH-004（gate:required staged tree 绑定）**：`gate:required`（pre-commit）重算当前 staged tree（indexTree），只接受 indexTree 完全匹配的验证证据；不匹配则阻止提交并要求重新验证。

## 变更范围

| 文件 | 变更 |
|---|---|
| `bin/contracts.mjs` | Evidence contract 增加 `snapshot` 字段（start/end/status） |
| `bin/evidence.mjs` | record/run 集成 snapshot；变化标记 superseded；freshness 增加 snapshot 校验 |
| `bin/gate-lifecycle.mjs` | `gate:required` 增加 staged tree 绑定检查 |
| `bin/evidence.test.mjs` | 新增 snapshot 集成测试 |
| `bin/gate-lifecycle.test.mjs` | 新增 staged tree 绑定测试 |
| `docs/rfc/0002-change-snapshot.md` | 状态更新（实施完成记录） |

## 跨层搜索结论

升级对象为引擎仓 `bin/` 层自身（evidence/gate-lifecycle/contracts），无 PallasTrade 业务层。`change-snapshot.mjs`（上批新增）为唯一依赖模块，无重复实现。

## Skill 咨询（已读，承上批）

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `pallastrade-customization/SKILL.md` | ✅ 已读 | 引擎自身修改无业务定制冲突 |
| `harness-prd/SKILL.md` | ✅ 已读 | PRD→gate→AC↔测试映射流程；本批为已确认 PRD 的 FR-001 延续 |
| `harness-docs/SKILL.md` | ✅ 已读 | 代码变更后同步文档；本批同步 RFC-0002 |

## 技术方案（初步）

1. **Evidence snapshot**：`runEvidenceCommand` 执行前 `createSnapshot()`（start），执行后 `createSnapshot()`（end）；`snapshotsEqual(start, end)` 判定；不一致时 evidence 记录 `snapshot: { start, end, status: 'superseded' }`。`recordEvidence` 手工记录时允许可选传入 snapshot。
2. **gate:required 绑定**：pre-commit 时重算 `indexTree(rootDir)`，扫描任务最新验证证据的 `snapshot.end.indexTree`，匹配才放行；无证据或过期/不匹配则失败并输出修复命令。

## 风险点

- 修改 `evidence.mjs`/`gate-lifecycle.mjs` 是引擎核心 → 全套测试回归（153+ 用例）必须全绿
- snapshot 计算开销：pre-commit 固定开销 P95 < 3s（性能预算）
- 兼容：旧证据无 snapshot 字段 → 视为"无快照绑定"（降级为 diagnostic，不满足严格 Gate），不影响旧流程正常使用
