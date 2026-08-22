# RFC-0002: ChangeSnapshot — 变更快照数据合同

> 状态：部分实施完成（HTH-002~008 + HTH-011 已实现；HTH-009 见 RFC-0001、HTH-010 待 GitHub 操作）  
> 日期：2026-08-22  
> 关联：RFC-0001（INV-01/02/03/04）、HTH-002~008/011、方案 §5.1~§5.3/§5.6/§11.1

## 1. 问题

当前 Gate/Evidence 校验绑定 branch/HEAD/时效，未绑定**确切的变更内容**。存在 TOCTOU（time-of-check to time-of-use）漏洞：验证后继续修改文件，旧证据仍可放行（F-01）。

## 2. 目标

将 Task、Gate、Evidence 与提交绑定到**同一份可重算的变更快照**，实现：

> 哪个受信验证器，在什么环境中，对哪一个确切变更快照，得到什么结果？

## 3. 数据合同（schemaVersion 2.0）

```json
{
  "schemaVersion": "2.0",
  "id": "SNAP-<timestamp>-<rand>",
  "taskId": "TASK-...",
  "repositoryId": "sha256(realpath + git-common-dir)",
  "worktreeId": "<worktree-id>",
  "branch": "dev",
  "baseHead": "<full-sha>",
  "indexTree": "<git-write-tree-sha>",
  "worktreeManifestHash": "sha256:<digest>",
  "untrackedManifestHash": "sha256:<digest>",
  "allowPolicyHash": "sha256:<digest>",
  "configHash": "sha256:<digest>",
  "createdAt": "<ISO-8601>"
}
```

### 字段语义

| 字段 | 语义 | 来源 |
|---|---|---|
| `indexTree` | **准备提交内容的主身份**（staged tree） | `git write-tree` 全量 SHA |
| `worktreeManifestHash` | 允许范围内 unstaged 已跟踪文件的稳定 manifest | 遍历 + sha256 |
| `untrackedManifestHash` | 允许范围内 untracked 文件的稳定 manifest | `git ls-files --others` + sha256 |
| `allowPolicyHash` | 允许/拒绝范围策略的规范化 hash | 配置序列化 |
| `configHash` | 影响验证语义的配置 hash（evidence/risk/verifier 等） | 配置序列化 |
| `repositoryId` | 仓库唯一身份（防跨仓证据复制） | realpath + git-common-dir |
| `baseHead` | 任务基线 commit | task 状态 |

## 4. Canonical Manifest 算法

对一组文件生成稳定 hash，**跨平台（Win/macOS/Linux）一致**：

```
manifest = lines.sorted(by: relativePath) joined by "\n"
其中每行:  <relativePath>\t<sha256(content)>
编码: UTF-8（无 BOM）
路径: 统一正斜杠 "/"；相对仓库根；不含前导 "./"
行尾: LF
最终 hash: sha256(manifest)
```

要求：
1. 路径排序按 **UTF-8 码点**（跨平台一致，不依赖 locale）。
2. 内容 hash 用原始字节（不做行尾转换）——即"文件实际内容"。
3. 符号链接按目标路径字符串 hash（不跟随）。
4. Windows：大小写不折叠（区分大小写是 Git 默认行为，保持与 Git 一致）。
5. 空文件集 → `sha256("")`（已知常量），非空集不允许跳过。

## 5. 失效矩阵

| 变化 | Gate 准备项 | Test Evidence | Review Evidence | Knowledge Evidence |
|---|---|---|---|---|
| 仅文档目标文件内容变化 | 保留 | 失效 | 失效 | 失效 |
| staged tree 变化（indexTree 变） | 保留 | 失效 | 失效 | 视影响重评 |
| base HEAD / rebase 变化 | 重评风险与范围 | 失效 | 失效 | 失效 |
| `harness.config.mjs` 变化 | 重新准备 | 失效 | 失效 | 失效 |
| allow/deny 变化 | 重新准备 | 失效 | 失效 | 失效 |
| 无关范围的 unstaged 文件变化 | 保留并提示 | 保留 | 保留 | 保留 |

## 6. 生命周期集成

1. `evidence run` / `evidence record` **开始前**生成 snapshot（start），**结束后**重算（end）。
2. 若 start ≠ end（运行期间发生变化）→ 证据标记 `superseded`。
3. `gate:required`（pre-commit）重算 staged tree，只接受 **indexTree 完全匹配** 的验证证据。
4. `task finish` 要求允许范围内无未处理变更；无关用户改动不得被自动删除或覆盖。
5. 状态文件原子写入 + schema 校验 + 保留最近一个可恢复备份。

## 7. 验收标准（HTH-002/003/004）

- AC-001：证据完成后修改并暂存任意目标文件 → `gate:required` 失败。
- AC-002：仅修改无关且未暂存文件 → 不误伤本次 staged commit。
- AC-003：新增/删除/重命名/大小写/符号链接/Windows 路径均有测试。
- AC-004：失效信息含旧/新 snapshot ID、变化文件、下一条修复命令。
- AC-005：三平台 × Node 22/24 的同一 fixture 生成相同 manifest hash。

## 8. 实施记录（2026-08-22，HTH-002/003/004）

| 工作包 | 状态 | 交付 |
|---|---|---|
| HTH-002 | ✅ 已实现 | `bin/change-snapshot.mjs`（canonical manifest + createSnapshot + 比较/持久化），15 个单元测试 |
| HTH-003 | ✅ 已实现 | `bin/evidence.mjs`：run 前后生成 start/end snapshot，变化标记 `superseded`；`evidenceFreshness` 校验 staged tree 一致性（INV-01） |
| HTH-004 | ✅ 已实现 | `bin/harness.mjs` `gate:required`：staged tree 与最新 snapshot-bound 证据不一致时阻止提交，输出修复命令 |

已知边界（后续 HTH-005 收紧）：
- 任意命令仍可按 `test` 类型记录证据（F-02 需 Verifier Registry 解决）
- 无 snapshot 的旧证据在 `gate:required` 中降级跳过（向后兼容，方案 §11.2）

## 9. 实施记录追加（2026-08-22，HTH-005/006 — F-02 修复）

| 工作包 | 状态 | 交付 |
|---|---|---|
| HTH-005 | ✅ 已实现 | `bin/verifier.mjs` + `harness verify` 命令 + `config.evidence.verifiers` 注册表（默认 unit/docs）+ `evidence run --type test` 无验证器降级 `diagnostic` + 验证器定义 hash 失效（INV-04）+ `bin/glob-utils.mjs` 跨平台 glob 展开 |
| HTH-006 | ✅ 已实现 | `evidence record` 手工证据默认 `success:null`，`--approve` 显式审批；`verifyTaskEvidence` 区分 pending（未审批/诊断证据）与 missing |

边界更新：
- `evidence run --type test --verifier <id>` 运行验证器注册命令（忽略用户传入命令，防伪冒）；任意命令只能记为 diagnostic
- review/knowledge 等非 test 类型不受 verifier 限制，但手工记录需 `--approve` 才满足 Gate

## 10. 实施记录追加（2026-08-22，HTH-007/008 — F-03 修复）

| 工作包 | 状态 | 交付 |
|---|---|---|
| HTH-007 | ✅ 已实现 | `harness gate` 默认要求/自动发现 Task（INV-03）：无 Task 时拒绝创建并输出 `task start` 命令；`legacy.allowTasklessGate=true` 逃生舱 + 弃用警告；`gate:clear` 的 `verify-test` 一律证据控制（taskless 也不能手工 clear） |
| HTH-008 | ✅ 已实现 | `state:migrate`：dry-run 默认、`.pre-harness-1.0.bak` 备份、原子写入、幂等（重复运行不重复备份），备份路径输出 |

边界更新：
- Taskless Gate 是弃用路径（2.0.0-beta 移除默认兼容入口）；所有新 Gate 100% 绑定 Task
- 状态迁移失败保持旧文件不变；Windows 文件占用失败时停止并给出恢复方法（现有原子写保证）

## 11. 实施记录追加（2026-08-22，HTH-011 — F-06 修复）

| 工作包 | 状态 | 交付 |
|---|---|---|
| HTH-011 | ✅ 已实现 | `docs/getting-started.md` 重写为 task-bound 生命周期（task start → gate --task-id → verify → evidence verify → task finish）；删除手工 clear verify-test 示例；`docs/roadmap.md` 修复 1.5.0/1.6.0 行拼接并追加 1.7.0 Trust Kernel 计划；`docs:check` 增加 fenced-block 级过时命令防漂移检查（含警示块跳过） |

## 12. 实施记录追加（2026-08-22，HTH-010 — F-05 修复）

| 工作包 | 状态 | 交付 |
|---|---|---|
| HTH-010 | ✅ 已实现 | 独立仓 GitHub Ruleset `main-protection`（id 21200575, enforcement active）：deletion（禁删 main）+ non_fast_forward（禁强推）+ pull_request（1 approval、对话解决、stale 失效）+ required_status_checks（6 个 CI check：ubuntu/macos/windows × Node 22/24）；已验证 `rules/branches/main` 返回 4 条规则 |
