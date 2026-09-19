# 交互规格 — TASK-20260919103331-1198e842（D08/D09）

本任务无界面交互；「交互」= **本地 Agent → Cloud 的提交契约**、**Cloud Provider 端口行为**与**证据边界标记**。

## 1. 提交契约（本地 Agent 调用）

```js
import {
  buildProjectContextSubmission, buildTaskContextSubmission, buildGitSnapshotSubmission,
} from './submitted-context.mjs';

const git = buildGitSnapshotSubmission({
  id: 'SUB-git-1',
  task_id: 'TASK-1',
  commit: 'a1b2c3d',
  base_commit: 'e4f5a6b',
  changed_files: ['bin/x.mjs', 'docs/y.md'],
  tree_hash: 'sha256:...',
  diff_hash: 'sha256:...',
  workspace_hash: 'sha256:...',
  summary: '2 files changed',
});
// → 冻结对象；任何 content/source/patch/full_diff/diff 字段已被剥离并记入 removed
```

| 提交类型 | 必需字段 | 说明 |
|---|---|---|
| `ProjectContextSubmission` | `id` · `summary` | 结构化画像摘要（stacks/layers/commands 可选，**不含源码**） |
| `TaskContextSubmission` | `task_id` · `summary` | 任务上下文摘要（goals/acceptanceCriteria 可选） |
| `GitSnapshotSubmission` | `commit` · `base_commit` · `changed_files` · `tree_hash` · `diff_hash` · `workspace_hash` | 只传 hash 与文件清单，**不传全量 diff** |

净化规则（`stripSourcePayload`）：递归删除 `content` / `source` / `source_code` / `code` / `patch` / `full_diff` / `diff` / `blob` / `text`（最大深度 3），并返回 `removed` 路径数组供审计。

## 2. Cloud Provider 端口行为（D04 端口面的 Submitted 实现）

| 方法 | Submitted 实现返回 | 与 Local 的差异（设计约束） |
|---|---|---|
| `projectContext.profile()` | 最近一次 `ProjectContextSubmission` 内容；无提交 → `null` | 来自提交，而非本机 FS |
| `projectContext.index()` / `status()` | `{ assets: [...] }` / `{ indexed: true, assets: n, stale: [] }` | 无本机文件可重算 hash → 不做 stale 计算 |
| `projectContext.search(q, top)` | `{ indexed: true, query, top, count: 0, results: [] }` | Cloud 不做本地检索（提交内容为摘要） |
| `taskContext.contextPack(task)` | `{ id, taskId, assets: [...], summary }` | 资产来自提交的引用（path+hash） |
| `taskContext.recordDecision(d)` | `{ id, taskId, title, decision, reason, createdAt }`（写入 `decisions` 表） | 与 Local 同语义 |
| `gitSnapshot.changedFiles(base)` | `{ files: [...], errors: [] }` | 取自提交 |
| `gitSnapshot.diff(base)` | `{ diff: '', errors: [], diff_hash }` | **Cloud 不持有全量 diff**（默认不保存），仅回 hash |
| `gitSnapshot.showAtRef(ref, file)` | `{ content: null, error: 'cloud: file content is not submitted' }` | Cloud 无文件内容 |
| `gitSnapshot.createSnapshot/writeSnapshot/readSnapshot/listSnapshots` | 快照对象落 `git_snapshots` 表 | 与 Local 同形的读写语义 |

## 3. 证据边界（D09）

```js
import { applyEvidenceBoundary, createBoundaryEvidenceRepository } from './evidence-boundary.mjs';

applyEvidenceBoundary({ evidenceType: 'test', summary: 'x' })
// → { evidenceType:'test', summary:'x', source:'local_agent', trust_level:'cooperative', ... }

applyEvidenceBoundary({ evidenceType: 'test', source: 'ci_attested' })
// → ✗ TypeError（不得伪装 CI attestation）

applyEvidenceBoundary({ evidenceType: 'test', source: 'ci_attested', attestation: 'ci://run/123' })
// → { source:'ci_attested', trust_level:'verified', attestation:'ci://run/123' }

const evidence = createBoundaryEvidenceRepository(sqliteRepositories.evidence);
evidence.record({ task, evidenceType: 'test', summary: 'x' }); // 自动带边界标记
```

| 输入 | 结果 |
|---|---|
| 无 `source` | `source=local_agent`、`trust_level=cooperative` |
| `source='local_agent'` | 同上（强制 cooperative，不接受自抬为 verified） |
| `source='human'` | `source='human'`、`trust_level=cooperative` |
| `source='ci_attested'` 无 `attestation` | 抛 `TypeError` |
| `source='ci_attested'` 带 `attestation` | `trust_level='verified'` + 保留 attestation |
| 其它 `source` / `trust_level` 值 | 抛 `TypeError` |

## 4. 失败语义

| 场景 | 行为 |
|---|---|
| 提交缺必需字段 | `build*Submission` 抛 `TypeError`（含 missing 列表）；`validateSubmission` 返回 `{ok:false, errors, missing}` |
| 提交含源码/全量 diff | 静默剥离（不抛错），`removed` 记录路径；摘要中不出现正文 |
| Cloud 无对应提交 | Provider 返回空态（`null` / `[]` / `{ files: [] }`），不抛错 |
| 快照 id 不存在 | `readSnapshot` → `null`（与 D07 Sqlite 适配器一致） |
| 伪造 CI attestation | 抛 `TypeError`（fail-loud，不降级静默） |
