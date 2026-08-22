# REQ-20260822-trust-kernel-p0-4

- **任务**: 优化：实施 Harness 可信化升级（P0 第四批：Taskless Gate 隔离 + 状态迁移）
- **Gate**: GATE-2026-08-22T14-55-29
- **Task**: TASK-20260822145524-85e9983a
- **日期**: 2026-08-22
- **类型**: 功能优化（Harness 引擎自身可信化）
- **权威方案**: `harness优化升级实施方案-20260820.md` §5.3（P0-3 Task 强绑定）+ §5.1 实现要求 7 + §11.1
- **承上**: REQ-20260822-trust-kernel-p0-1/2/3 完成；用户已确认 PRD 并授权 P0 分批实施

## 需求描述

1. **HTH-007（Taskless Gate 隔离，F-03）**：
   - `harness gate` 默认必须提供或自动发现当前 Task；无 Task 时输出可直接执行的 `task start` 命令并拒绝创建。
   - Taskless Gate 仅在 `config.legacy.allowTasklessGate=true` 时可用，打印版本化弃用警告。
   - Taskless Gate 的 `verify-test` 永远不能人工清理（证据控制，INV-03）。
2. **HTH-008（状态迁移加固）**：`state:migrate` 已验证具备 dry-run 默认、备份、原子写入；补齐幂等性测试与备份路径输出。

## 变更范围

| 文件 | 变更 |
|---|---|
| `bin/harness.mjs` | gate 命令：taskId 自动发现 + taskless 隔离；gate:clear：verify-test 一律证据控制 |
| `bin/migrations.mjs` | migrateState 输出备份路径（backups 数组）；runMigrations 显示备份信息 |
| `bin/migrations.test.mjs` | 新增：迁移幂等性测试 |
| `bin/cli-e2e.test.mjs` | 新增：无 task 时 gate 拒绝；legacy.allowTasklessGate 时 verify-test 不可手工 clear |
| `docs/rfc/0002-change-snapshot.md` | 追加 HTH-007/008 实施记录 |

## 跨层搜索结论

升级对象为引擎仓 `bin/` 层（harness/migrations），无 PallasTrade 业务层。`state-store.mjs` 的 `listTasks` 为 task 自动发现依赖，无重复实现。

## Skill 咨询（已读，承上批）

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `pallastrade-customization/SKILL.md` | ✅ 已读 | 引擎自身修改无业务定制冲突 |
| `harness-prd/SKILL.md` | ✅ 已读 | 已确认 PRD 的 FR-003 延续 |
| `harness-docs/SKILL.md` | ✅ 已读 | 代码变更同步文档；本批同步 RFC-0002 |

## 技术方案（初步）

1. **autoDiscoverTask**：读 `.harness-state/tasks/*.json`，选 status 非 terminal（completed/cancelled/abandoned）的最新 task。
2. **gate 命令**：无 `--task-id` → 自动发现；发现失败且 `legacy.allowTasklessGate !== true` → 拒绝创建并输出 `task start` 命令；`true` → 创建 taskless gate + 弃用警告。
3. **gate:clear**：`verify-test` 对所有 gate 一律拒绝手工 clear（task-bound 提示 evidence verify；taskless 提示绑定任务或作废）。
4. **migrations**：`migrateState` 收集 backups 相对路径；测试覆盖 dry-run 不写文件、--write 创建备份且幂等（重复运行不重复备份）。

## 风险点

- 完全拒绝 taskless gate 可能影响旧用户脚本 → 保留 `legacy.allowTasklessGate` 逃生舱 + 明确弃用窗口（2.0-beta 移除）
- autoDiscoverTask 误绑其他 worktree 的任务 → 用 repositoryIdentity/worktreeId 过滤
- 全套测试回归必须全绿
