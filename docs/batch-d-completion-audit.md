# Batch D 验收自审（人工检查重点八条）

> 目的：为指令文档「八、你的人工审批重点」提供**逐条证据**，让人工检查可在数分钟内完成。
> 范围：Batch D（D01-D14，Cloud Runtime）。批次产出：18 个新引擎模块 + 12 个测试文件，4 个既有模块小改。

- 审计日期：2026-09-19
- 运行命令：`node bin/harness.mjs`（本仓 `npx harness` 有 EISDIR 问题）
- 证据入口：`npm run test:core` · `harness reuse-adherence` · `harness docs:check` · `harness supervise diff` · `harness/gates/*.json`

---

## 1. 有没有重写已有成熟能力？

**没有。** 全部实现走「端口 + 适配器」包装既有函数：

| 端口实现 | 包装的既有能力（未重写） |
|---|---|
| File 适配器（D03） | `state-store` · `gate-commands` · `evidence` · `approvals` · `project-artifacts` · `constitution` · `governance` 的既有函数 |
| 本机 Provider（D05） | `project-brain`（画像/索引/检索/上下文包/决策）· `git-files` · `change-snapshot` |
| Sqlite 仓储（D07） | 只做存储，无 Task/Gate/Evidence 业务判定（判定仍在 Core，ARCH-R1/R2） |
| Cloud 命令层（D12） | 风险用 **既有纯引擎** `risk-engine.assessRisk`；模板用既有 `template-registry`；配置常量复用 `contracts` |

**反证**：Batch D 未新增任何 Task/Gate/Evidence/Skill 引擎；`reuse-adherence` 对全部 14 份历史设计复核 **193 pass / 0 fail**。

## 2. 有没有偷偷扩大 Scope？

**没有。** 每个阶段先落 PRD/REQ（含 **范围外** 一节）再实施，且逐阶段独立 gate：

- 明确未做（并在证据中保留）：Cloud 侧 `gate_create`/`gate_clear`/`run_verifier`/`generate_*` 未接线（返回 `cloud_not_implemented`）；`review_diff` 因缺提交内容显式降级。
- 未做多用户/租户/试用/过期/密钥库/设备绑定（指令 TASK-D11 明确不做）。
- 未迁移 Local 到 SQLite（指令 TASK-D06 明确不做）。
- Supervisor 范围检查：仅剩 2 项 `package-lock.json` 既定例外（受保护文件，历史依赖清理所致，本批次未新增依赖）。

## 3. 有没有引入新核心 dependency？

**没有。** 本仓保持零运行时依赖：

- 新增能力只使用 Node 内置：`node:sqlite` · `node:http` · `node:crypto`。
- `package.json` 依赖面**未改动**（D14 有静态断言：`@modelcontextprotocol` 不出现在 `package.json`）。
- 真实客户端 SDK（`@modelcontextprotocol/sdk@1.30.0`）**隔离安装在仓库外**（`%TEMP%\harness-mcp-client`），仅测试期使用。

## 4. Tech Stack / Architecture 是否发生改变？

**按 ADR 进行，且已获人工批准。**

- `docs/adr/ADR-0002-runtime-boundary.md`：**ACCEPTED**（授权：「自主决定」），三项附注决策已记录（strict 延后 D13 / `product.md` 维持 `not_applicable` / 接受 Node ≥ 23.4 门槛不引原生依赖）。
- 架构变化：新增**端口层**（7 仓储 + 3 Provider）与 **Cloud 四层单向运行时**（HTTP → Auth → MCP Adapter → Application → Core/端口 → SQLite）。
- 关键约束有测试兜底：传输层不得 import 存储/领域（静态断言）；Cloud `strictGovernance` 恒 true（双层守卫 + 无 legacy 回退扫描）。

## 5. Template 是否足够具体并符合 Harness 能力？

本批次未改模板系统（属 Batch B 范围）。Batch D 新增的 PRD/REQ/设计产物**均按仓库模板结构**产出：

- PRD：背景/目标/场景/FR/AC/影响/测试计划/范围外；
- REQ：Step 0 跨层检索表 + Step 1 Skill 咨询表 + 复用摘要 + 风险 + 验证计划；
- 设计：Part A 现状四节（A1-A4）+ Part B 复用矩阵（单符号目标）+ Part C 实施与回滚。

`design:check` 与 `reuse-adherence` 逐份校验通过。

## 6. Constitution 是否来自真实源码，而不是 AI 想象？

本批次未生成 Constitution（属 Batch C 范围）。Cloud 侧对 Constitution 只做**读取与落库**（`constitution_versions` 表 + `project_status` 暴露版本），不臆造内容。

## 7. Strict finish_task 是否真的不能伪造流程？

**已由三层证据锁定：**

1. **严格判定**：`required = DEFAULT(['test','review','knowledge']) ∪ task.requiredEvidence`（客户端只能叠加，不能调低）；critical 额外要求一条**非 STALE 审批**（查 `approvals` 表）。
2. **拒绝路径**：证据缺一 → `evidence_policy_unmet` + `missing`，任务状态**保持不变**。
3. **无 legacy 回退**：
   - 装配期：`createCloudApplication` 遇 `strictGovernance=false` **拒绝启动**；
   - 运行期：命令层被直连时 `finish_task` 返回 `strict_governance_required`；
   - 全工具扫描用例：无证据任务跑遍**所有已接线工具**后状态仍非 `completed`。

**真实客户端复证**（D14）：官方 MCP 客户端经真实端口调用 `finish_task` → 先被拒（`evidence_policy_unmet`）→ 写入 3 类证据后 → `completed`。

## 8. Local Harness 是否出现 regression？

**没有。** 全部批次（含 Batch D）的 Local 侧为「只加不改」：

- 既有模块改动仅 4 处：`mcp.mjs` 导出两个内部函数、`contracts.mjs` 新增常量、`approvals.mjs` 改为复用该常量、`sqlite-repositories.mjs` 证据记录透传调用方字段（其契约用例保持通过）。
- 既有 Local 契约用例（File 适配器、Provider、D03 契约套件）持续在 `test:core` 中运行并通过。

---

## 验证证据汇总

| 检查 | 结果 |
|---|---|
| `npm run test:core` | **480 / 480 通过**（含 27 条 Sqlite 契约、12 条 Provider 契约、4 条真实客户端） |
| `node --test bin/mcp-real-client.test.mjs` | **4 / 4 通过**（真实 MCP 客户端，真实端口） |
| `reuse-adherence` | 14 份设计 · **193 pass / 0 fail** |
| `docs:check` | 108 文档 / 36 链接，无失效 |
| `readme:sync --check` | 版本一致（1.10.0） |
| `doc-impact --base origin/main` | 3 synced |
| `supervise diff` | 173 文件：2 项 `package-lock.json` 既定例外 + 1 项 `STD-API-001` 已知误报；无复杂度/重复块/安全告警 |

## 各阶段治理留痕（gate / recovery）

| 阶段 | 任务 | Gate | Recovery |
|---|---|---|---|
| D01 | TASK-20260919095414-c09a8d82 | GATE-2026-09-19T09-54-37 | REC-7f24bc32b9f597 |
| D02/D03 | TASK-20260919100403-2ff1efa5 | GATE-2026-09-19T10-04-08 | REC-e8eaaf0e0b64be |
| D04/D05 | TASK-20260919101110-f33d9810 | GATE-2026-09-19T10-11-16 | REC-00099195d6db99 |
| D06/D07 | TASK-20260919102352-4bdf60e2 | GATE-2026-09-19T10-23-53 | REC-d0d3e6f1ab6ca1 |
| D08/D09 | TASK-20260919103331-1198e842 | GATE-2026-09-19T10-33-32 | REC-9dfa2a5d0024db |
| D10/D11 | TASK-20260919104352-1b1ecd6b | GATE-2026-09-19T10-43-54 | REC-5f1716da5b89b8 |
| D12 | TASK-20260919105713-71812e8f | GATE-2026-09-19T10-57-14 | REC-fdced568ec96be |
| D13 | TASK-20260919110529-abfac7d9 | GATE-2026-09-19T11-05-30 | REC-5b8b014b883c4b |
| D14 | TASK-20260919111130-154e748e | GATE-2026-09-19T11-11-31 | REC-2f84093e7f19dc |

---

## 建议的人工检查动作（约 10 分钟）

1. 跑一次 `npm run test:core`，确认 480/480。
2. 跑一次 `node --test bin/mcp-real-client.test.mjs`，观察真实客户端握手与工具调用输出。
3. 抽查 `bin/cloud-commands.mjs` 的 `finish_task`（严格判定）与 `bin/cloud-policy.mjs`（双层守卫）。
4. 抽查任一阶段 PRD 的「范围外」一节与对应 gate JSON（`harness/gates/GATE-2026-09-19T11-*.json`）。
5. 确认 `package.json` 依赖面未变（`git diff package.json` 应无依赖新增）。

## 后续候选（待人工选择方向）

| 候选 | 内容 | 参考 |
|---|---|---|
| E1 部署可交付 | Dockerfile / K8s / CI 与真实云环境冒烟（`/health` + 鉴权 + 真实客户端复验） | RFC-0005 §5（M4/M5） |
| E2 Cloud 门禁政策 | `gate_create` / `gate_clear` 的 Cloud 政策接线（含 human-WAIT 检查项禁止裸清） | RFC-0006 §4 |
| E3 提交式内容通道 | 让 `review_diff` 可用：提交式上下文携带必要文件内容/差异（含体积与隐私约束） | RFC-0006 §6 风险表 6 |
| E4 Local strict dogfood | 在引擎仓自身启用 `strict: true`，用 3 个真实任务验证治理体验 | ADR-0002 附注 |
