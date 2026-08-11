---
layout: default
title: 规范与开发监督
---
# Standards Registry 与 Development Supervisor

Harness 0.4 把自然语言规范转成可索引、可选择、可验证的 Standard，并让实际开发经历实施前、实施中和实施后监督。确定性检查可以阻塞；语义 Review 只能提供建议，不能成为唯一安全边界。

所有持久化领域对象带 `schemaVersion: "1.0"` 和稳定类型判别：`Task`、`Standard`、`Risk`、`Finding`、`Evidence`、`KnowledgeAsset`、`AgentRun`。0.4 已提供字段级校验，后续 Task Orchestrator、Evidence 和 Agent adapters 共用同一契约。

需要构建插件或适配器时，可从公开子路径 `pallastrade-harness/contracts`、`pallastrade-harness/standards`、`pallastrade-harness/supervisor` 与 `pallastrade-harness/gate-lifecycle` 导入这些稳定边界；不要引用未导出的内部文件。

## Standard Schema

```json
{
  "schemaVersion": "1.0",
  "type": "Standard",
  "id": "STD-DB-001",
  "category": "database",
  "title": "Historical migrations are immutable",
  "authority": { "file": "AGENTS.md", "section": "Database" },
  "scope": ["**/db/migrate/**/*"],
  "severity": "error",
  "enforcement": {
    "level": "critical",
    "type": "deterministic",
    "verifier": "historical-migration"
  },
  "evidence": ["base-tree", "changed-files"],
  "fix": "Create a new reversible migration.",
  "exception": { "allowed": false, "requiresReason": false },
  "knowledgeImpact": ["data model documentation", "recovery plan"]
}
```

类别固定为：architecture、technology-selection、code-quality、database、api、security、ui-style、interaction、accessibility、testing、documentation、knowledge、deployment。

执行等级：

- `documented`：仅文档，覆盖率报告会显示缺口；
- `advisory`：给出建议；
- `review-required`：要求专项 Review；
- `verified`：有确定性 verifier；
- `blocking`：失败时禁止完成任务；
- `critical`：失败时禁止提交、合并或发布。

## 三阶段监督

1. `harness supervise plan` 建立 Risk 和 Change Plan，声明 allow/deny scope、适用规范与证据。
2. 实施中运行 `harness supervise diff`，检测范围漂移、新依赖、架构边界、循环依赖，以及新增/修改代码的复杂度和重复块。
3. 实施后再次运行 diff Review；每个 Finding 都包含 Standard ID、文件/行号、风险、修复建议、置信度和 blocking 状态。

复杂度和重复度默认只分析 Git Diff 中的新代码；历史技术债务不会一次性阻断开发。需要全量治理时，应通过独立 audit 任务建立基线。

## Change Plan

```bash
npx harness supervise plan \
  --task "新增：订单导出" \
  --base origin/main \
  --allow "src/orders/**" "test/orders/**" \
  --deny "src/types/generated/**"

npx harness supervise diff --base origin/main
```

计划默认写入 `.harness-cache/plans/`。如实现从 UI 扩张到 API/数据库，先更新风险和 Change Plan，再继续编码。

## Technology Choice Record：`minimatch`

0.4 将 `minimatch` 声明为直接运行时依赖，用于 Standard scope、Change Plan allow/deny 和架构边界的统一 glob 语义。

- 替代方案：自研 glob 匹配器会在 brace、globstar、dotfile 与 Windows 路径上产生不一致；依赖 `glob` 的传递依赖则无法保证包管理器安装布局和版本契约。
- 维护与安全成本：`minimatch` 已存在于 `glob` 的同一依赖生态，本次显式声明避免隐藏依赖；版本受 lockfile 和跨 Node 22/24 CI 约束。
- 退出成本：匹配调用集中在 `matchesScope`，未来可替换实现而不改变 Standard 或 Finding 契约。
- 结论：接受该非阻断 Technology Choice finding；其正确性收益高于增加一个已存在生态依赖的边际成本。

## 覆盖率

```bash
npx harness standards coverage
npx harness standards select --base origin/main --json
```

Coverage 区分 machine enforced、review required 和 documented only。后者不是“已经治理”，而是下一批自动化 verifier 的候选缺口。
