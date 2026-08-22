# PRD-20260822-other-实施-harness-可信化与易用性升级-p0-可信内核-p1-引导体验-p2-外部验证

| 元数据 | 值 |
|---|---|
| 状态 | draft |
| 创建日期 | 2026-08-22 |
| 来源 | 优化：实施 Harness 可信化与易用性升级（P0 可信内核→P1 引导体验→P2 外部验证） |
| 分类 | other（自动判定） |
| 关联 Skill | harness-docs / harness-prd / harness-skill-author / harness-standards-audit |
| 关联 REQ | REQ-20260822-trust-kernel-p0-1.md（P0 第一批） |
| 关联 PRD | N/A（全新） |
| 需求类型 | 优化迭代 |
| 权威实施方案 | `harness优化升级实施方案-20260820.md`（主仓，本 PRD 为其实施载体） |

> 🔁 本 PRD 是 `harness优化升级实施方案-20260820.md`（整合 `harness升级方案.md` 与 `harness通用化升级方案.md` 的升级版）的执行落地文档。

## 1. 背景与目标

- **一句话需求原文**：优化：实施 Harness 可信化与易用性升级（P0 可信内核→P1 引导体验→P2 外部验证）
- **背景**：pallastrade-harness@1.6.0 已具备完整治理骨架（Task/Risk/Gate/Supervisor/Evidence/Recovery/Knowledge/Adapter/MCP/TUI），但存在三类高风险绕过（F-01 验证后修改仍可放行、F-02 任意命令可冒充 test 证据、F-03 Taskless Gate 人工清理路径），且小白首次成功成本过高（F-06~F-08）。PallasTrade 主仓提供了高强度 dogfood 场景，但独立仓自身缺少自治理（F-05）。
- **目标**：把 Harness 从"能力多但可绕过"升级为"拦得住、普通人会用、用了少返工"的可信治理工具。
- **成功指标**（Go/No-Go 门禁，§7.4 方案）：
  - P0 绕过测试 100% 阻断；外部试点任务完成率 ≥ 80%；首个可信提交 P50 ≤ 10 分钟、P90 ≤ 20 分钟；误阻断率 < 5%；正常任务显式人工动作 P50 ≤ 3；三 Tier A 参考项目连续 14 天 nightly 通过；独立仓 main 受保护且发布来自 required-check 通过的 commit。

## 2. 用户故事 / 场景

- 作为使用 AI Coding 的个人开发者，我希望验证过的代码不会被验证后再修改而绕过，以便我的提交确实等于被验证的内容。
- 作为新手，我希望只运行 `harness do "需求"` 和 `harness next` 就能完成治理流程，以便不需要理解 Task ID / Gate ID / check ID。
- 作为维护者，我希望 CI 在干净环境重算快照并生成远程结论，以便本地证据不可单独作为合并边界。
- 场景：正常流（安装→首个任务→验证→完成）；边界（验证后修改、配置变更、切分支）；异常（无网络、无 Bash、Windows 路径、插件 fail-open）。

## 3. 功能需求（FR）

- FR-001（ChangeSnapshot）：Task/Gate/Evidence/提交绑定同一份可重算变更快照（index tree + worktree/untracked manifest + config hash）。
- FR-002（Verifier Registry）：证据必须来自已注册受信验证器；任意命令降级为 diagnostic，不满足严格 Gate。
- FR-003（Task 强绑定）：新 Gate 必须绑定 Task/仓库/worktree/branch/base HEAD；Taskless Gate 隔离并弃用。
- FR-004（Agent 原生 Hook）：Hook 用 Node JSON 解析、可安装/验证/解释，支持级别 matrix，`harness hooks doctor` 诊断。
- FR-005（独立仓自治理）：独立仓具备 AGENTS.md/harness.config.mjs/lefthook.yml/SECURITY.md/CHANGELOG.md + main 分支保护 + required checks。
- FR-006（可执行文档）：快速开始/路线图修复为 task-bound 生命周期；Markdown fenced-code 可执行。
- FR-007（setup/do/next）：统一首次接入 + 单条主路径 + 稳定 JSON nextAction。
- FR-008（真 Lite）：风险自适应档位，Lite 不继承 PRD/领域 Skill/人工逐项 clear。
- FR-009（保护覆盖 doctor）：doctor 输出 pass/warn/fail/unknown 保护覆盖状态。
- FR-010（Brain 2.0）：可替换检索 adapter + BM25 + 中文/符号检索 + 评测集。
- FR-011（支持等级）：Node/TS、Rails、Java 为 Tier A；其余明确 Tier B/C。
- FR-012（本地指标）：默认本地匿名聚合、上传 opt-in、`metrics export` 可审阅。
- FR-013（外部试点）：≥10 名目标用户两轮可观察试点。
- FR-014（开源成熟度）：Issue 模板、支持窗口、插件合同测试、双语核心文档。

## 4. 非功能需求（NFR）

- 性能：`gate:status` P95<300ms；小型仓 snapshot P95<500ms；10 万文件 monorepo 增量 snapshot P95<2s；pre-commit 固定开销 P95<3s（不含项目测试）；总等待 ≤ 原测试时间 10%。
- 安全：本地 hash chain 只防意外损坏与普通绕过；恶意管理员边界明确；敏感输出遮蔽。
- 兼容：1.7 显式 legacy + 迁移器 + 弃用周期；每个 minor 保留上一 schema 只读解析至少一个发布周期。
- 可维护性：TUI 不拥有独立业务逻辑；所有交互有 CLI/JSON 等价物；跨平台（Win/macOS/Linux × Node 22/24）golden fixtures。

## 5. 验收标准（AC，与测试一一映射）

> ⚠️ 以下为示例，正式内容请删除注释标记并替换为真实 AC：
- AC-001 ← FR-001：证据完成后修改并暂存任意目标文件，`gate:required` 必须失败；仅修改无关未暂存文件不误伤。
- AC-002 ← FR-001：新增/删除/重命名/大小写/符号链接/Windows 路径均有测试；三平台同一 fixture 生成相同 manifest。
- AC-003 ← FR-002：`node -e "process.exit(0)"` 不能冒充项目测试满足 Gate；同名验证器修改后旧证据失效。
- AC-004 ← FR-003：所有新建 Gate 100% 含 Task ID；无公开 CLI 路径人工改 check 状态完成 verify-test。
- AC-005 ← FR-004：每种受支持 Agent ≥1 安装测试 + 5 危险 + 5 安全样例；Windows 不依赖 Bash 完成最低保护。
- AC-006 ← FR-005：GitHub API 可验证默认分支受保护且 required checks 非空；直推/缺测试 PR/过期分支被拒。
- AC-007 ← FR-006：可执行文档片段通过率 100%；CLI help/README/Getting Started 生命周期顺序一致。
- AC-008 ← FR-007：干净项目 10 分钟内完成接入；正常流程零 ID 复制；低风险任务人工动作 ≤3。
- AC-009 ← FR-008：文档任务不触发无关 PRD 检查；Lite 保留最小不可取消底线。
- AC-010 ← FR-010：Recall@10 ≥ 90%；必需资产遗漏率 < 3%；平均上下文体积下降 30%。
- AC-011 ← FR-012：默认不上传；`metrics export` 不含源码/命令输出/路径/PRD 内容。
- AC-012 ← FR-013：≥10 名外部用户完成率 ≥ 80%，形成问题分级报告。

## 6. 跨层搜索记录（6 层，gate 强制）

| 层 | 路径 | 搜索关键词 | 找到的文件 | 是否满足需求 |
|---|---|---|---|---|
| 引擎代码 | `bin/*.mjs` | ChangeSnapshot/Verifier/evidence/gate | evidence.mjs/gate-lifecycle.mjs/contracts.mjs | 部分（需加固） |
| 引擎测试 | `bin/*.test.mjs` | adversarial/bypass/snapshot | evidence.test.mjs/gate-lifecycle.test.mjs | 部分 |
| 引擎预设 | `presets/` | nextjs/rails/single | 已存在 | 需按 Tier A 补 |
| 引擎模板 | `templates/` | PRD/REQ/SKILL | harness-prd 等 4 个 | 满足 |
| 引擎规则 | `rules/` | base-standards | 已存在 | 满足 |
| 引擎文档 | `docs/` | getting-started/roadmap | 已存在 | 需修复（F-06） |

**结论**：升级对象为引擎仓自身（bin/presets/templates/rules/docs），不涉及 PallasTrade 六业务层；独立仓无第二套 Gate/Evidence 需要。无重复实现风险。

## 7. 技术影响

- 涉及组件：`bin/evidence.mjs`、`bin/gate-lifecycle.mjs`、`bin/contracts.mjs`、`bin/config-loader.mjs`、`bin/task-orchestrator.mjs`、`bin/project-brain.mjs`、`bin/harness.mjs`、`bin/init.mjs`、`bin/onboard.mjs`、`bin/tui.mjs`、新增 `bin/change-snapshot.mjs`、`bin/verifier.mjs`、`bin/hooks.mjs`
- 新合同：Evidence schema 2.0（verifierId/definitionHash/start/end snapshot）、Gate 绑定 snapshot、状态 schema 2.0
- 依赖：无新增运行时依赖（Node 内置 crypto/git）
- 影响面：CLI 全部命令的 help/文档、README、getting-started、roadmap、打包发布流程

## 8. 测试计划

- 新增测试文件：`bin/change-snapshot.test.mjs`、`bin/verifier.test.mjs`、`bin/hooks.test.mjs`、`bin/adversarial.test.mjs`（10.2 对抗性清单 15 条）
- 更新测试文件：`bin/evidence.test.mjs`（前后 snapshot/失效）、`bin/gate-lifecycle.test.mjs`（Task 强绑定）、`bin/contracts.test.mjs`（schema 2.0）
- 覆盖的 AC 映射：AC-001~AC-012 → 上述测试文件
- 跨平台：Windows/macOS/Ubuntu × Node 22/24 golden fixtures

## 9. 文档同步清单（知识同步门）

- [ ] `docs/getting-started.md`、`docs/roadmap.md`（F-06 修复）
- [ ] CLI help 与 README 一致性
- [ ] 方案文档 `harness优化升级实施方案-20260820.md` 状态更新（主仓）
- [ ] `CHANGELOG.md`、`SECURITY.md`、`CONTRIBUTING.md`（HTH-010/022）
- [ ] 本 PRD 状态更新 + `docs/prd/README.md` 索引
- [ ] 场景库 `scenarios.json`（如新增能力）

## 10. 变更记录

| 日期 | 版本 | 变更 | 操作者 |
|---|---|---|---|
| 2026-08-22 | draft | 从实施方案文档落 PRD 骨架并扩充 | DeepSeek |
