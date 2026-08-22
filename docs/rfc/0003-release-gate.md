# RFC-0003 — 2.0 正式版 Go/No-Go 评估报告（HTH-022）

- 状态：✅ 已定稿（2026-08-22）
- 评估对象：`pallastrade-harness` 2.0.0 正式版发布门槛（方案 §7.4 八项条件）
- 决策：**2.0.0 正式版 = No-Go（继续 beta 阶段）**；**立即发布 v1.7.0**（P0 可信内核验收）

## 1. 逐项对照（§7.4 八项条件）

| # | 条件 | 当前证据 | 达标 |
|---|---|---|---|
| 1 | P0 绕过测试 100% 阻断 | P0 六项发现全部修复：ChangeSnapshot/TOCTOU（F-01）、Verifier Registry + 手工证据收紧（F-02）、Taskless 隔离 + verify-test 证据控制（F-03）、Node 化 Hook（F-04）、GitHub Ruleset（F-05）、可执行文档（F-06）；`verify-test` 不可手工 clear（本次会话 11 个 task 均经 `evidence verify` 关闭） | ✅ |
| 2 | ≥10 名外部试点用户完成率 ≥80% | **未执行**。HTH-020 试点包已交付（`docs/pilot/`：指南/指标表/访谈/问题报告模板），需外部协调招募 ≥10 人 | ❌ |
| 3 | 首可信提交 P50≤10min / P90≤20min | **未测量**。`harness metrics` 提供 timeToFirstEvidenceMinutes（本地基线 4.36min），但试点首可信提交数据未采集 | ❌ |
| 4 | 误阻断率 <5% | **未测量**（依赖试点） | ❌ |
| 5 | 正常任务显式人工动作 P50≤3 | **未测量**（依赖试点） | ❌ |
| 6 | 三个 Tier A 参考项目连续 14 天 nightly | `examples/` 三个 fixture（node-ts/rails/java）已交付（P1-3, PR #9），nightly workflow 已配置，**尚未累计 14 天** | ❌ |
| 7 | main 受保护且发布来自 required-check 通过 commit | GitHub Ruleset `main-protection`（id 21200575）enforcement active：deletion + non_fast_forward + pull_request + 6 个 required checks；本次会话 11 个 PR 全部 CI 12/12 通过后合并 | ✅ |
| 8 | 无未解决 P0/P1 安全或数据损坏缺陷 | 197/197 测试全绿；`docs:check` 通过；无已知未解决 P0/P1 | ✅ |

**达标：2/8 → 2.0.0 正式版 No-Go。**

## 2. 判定依据（方案原文）

> "未达标时继续 beta，不用版本号掩盖产品尚未被验证的事实。"（§7.4）
> "只有同时满足以下条件才进入 `2.0.0`。"（§7.4）

正式版发布需外部试点数据（条件 2/3/4/5）与 14 天 nightly（条件 6），当前均未达成。

## 3. 版本决策

| 版本 | 决策 | 依据 |
|---|---|---|
| **v1.7.0** | **立即发布** | P0 可信内核验收通过（条件 1/7/8），方案里程碑 7："P0 验收通过 → 发布 1.7.0"；CHANGELOG 已记录 Trust Kernel 内容；发布通道 OIDC trusted publishing 就绪 |
| v1.8.0 | 待 Brain eval 达标 | 方案里程碑 8："BM25 adapter、中文/符号检索 → 离线 eval 达标"。当前 HTH-017 交付词法检索 + 评测框架，独立仓基线 recall@10=69%（`harness brain eval` 可复现）；Recall@10≥90%、遗漏<3% 为后续里程碑 |
| **2.0.0-beta.1** | **暂缓（Go/No-Go 记录）** | 合同收敛已具备（插件 API 1.0 + 合同测试 HTH-021 + Taskless 移除），但按方案"不强行"原则，beta 应在外部试点启动前/时发布以收集反馈；决策可复核 |
| 2.0.0 | No-Go（本报告） | 见 §1 达标 2/8 |

## 4. 证据来源（可审计）

- P0/P1/P2 实施：git log（`d223e79`…`b3e8b54`），11 个 Task/Gate/Evidence 闭环记录（`.harness-state/`）
- 测试基线：`node --test bin/*.test.mjs` → 197/197
- Brain eval：`harness brain eval` → recall@10 69.0%（`presets/brain-eval/default.json` 50 查询）
- 指标：`harness metrics`（本地匿名，timeToFirstEvidenceMinutes 4.36）
- Ruleset：GitHub `main-protection`（gh api 可查，enforcement active）
- Tier A fixtures：`examples/`（node-ts/rails/java）
- 试点包：`docs/pilot/`（HTH-020）
- 双语核心文档：`README.en.md`、`docs/getting-started.en.md`（HTH-022）

## 5. 2.0.0 正式版的剩余门槛（复核清单）

- [ ] HTH-020 两轮试点完成：≥10 人，完成率≥80%，问题报告已分级
- [ ] 首可信提交 P50≤10min / P90≤20min（试点数据）
- [ ] 误阻断率 <5%（试点数据）
- [ ] 显式人工动作 P50≤3（试点数据）
- [ ] 三 Tier A 项目 nightly 连续 14 天通过
- [ ] Brain eval：Recall@10≥90%，遗漏<3%（BM25/中文/符号检索改进后）
- [ ] 无未解决 P0/P1
- [ ] 全部达标后重新出 Go/No-Go 报告
