# RFC-0001: Threat Model & Trust Invariants

> 状态：draft（待 HTH-001 评审通过后 approved）  
> 日期：2026-08-22  
> 关联：`harness优化升级实施方案-20260820.md` §4.1/§4.2、HTH-001

## 1. 目的

为 pallastrade-harness 定义**保护对象、可信主体、攻击者能力模型、信任边界与非目标**，作为所有可信内核功能（ChangeSnapshot、Verifier Registry、Task 强绑定、Hook、CI/Ruleset）的设计约束。

## 2. 保护对象（Assets）

| 资产 | 说明 | 保护等级 |
|---|---|---|
| A1 提交内容 | 即将被提交的确切变更（staged tree + 相关工作区文件） | 高 |
| A2 验证证据 | 证明"谁、何时、用哪个验证器、验证了哪个快照"的记录 | 高 |
| A3 治理状态 | Task/Gate/Evidence 状态文件（`.harness-state`、`harness/gates/`） | 高 |
| A4 项目知识 | Project Brain 索引、PRD/REQ/场景库 | 中 |
| A5 开发环境 | Hook 配置、Git 钩子、Agent 适配配置 | 中 |

## 3. 可信主体（Trusted Actors）

| 主体 | 能力 | 信任假设 |
|---|---|---|
| 本地开发者 | 完整 shell、文件写权限、可禁用 hook | 可信，但会误操作；不是恶意 |
| AI Coding Agent | 工具调用（文件读/写/执行命令），受 hook 约束 | 部分可信：会犯错、可能被 prompt 诱导 |
| CI 运行器 | 干净环境、只读 clone、执行 required checks | 可信（托管方保证） |
| 仓库维护者（merge） | PR 合并、分支策略管理 | 可信 |
| 恶意管理员 | 仓库+系统+CI 管理权限 | **不可信（非目标）** |

## 4. 攻击者能力模型（Adversary Capabilities）

按能力从低到高排列：

1. **意外 Agent（最常见）**：AI 验证后继续改文件、运行任意命令记录为 test 证据、误清 check。
2. **普通绕过 Agent**：故意用退出 0 命令冒充测试、复制其他 Task 的证据、手动编辑状态 JSON。
3. **持文件写权限的攻击者**：可以伪造全部本地状态、篡改 snapshot 与 hash。
4. **持 CI/仓库权限的攻击者**：可以改 workflow、改 required checks、直推 main。

**关键结论**：本地 hash chain 只能检测**意外损坏与普通绕过（1-2）**，不能对抗（3-4）。对抗（3）需要 CI 重算 + 远程 attestation；对抗（4）需要 GitHub Ruleset/Branch Protection 与不可绕过的 required checks。

## 5. 六层防线与信任边界

| 层 | 机制 | 防攻击者等级 | 是否安全边界 |
|---|---|---|---|
| L0 | `setup/do/next` 引导 | 降低误操作（1） | 否 |
| L1 | Agent 原生 Hook + Git Hook | 拦截工具调用/提交/推送（1-2） | 部分 |
| L2 | Task/Gate 状态机 | 约束阶段/范围/风险/确认（1-2） | 部分 |
| L3 | ChangeSnapshot + Typed Evidence | 证明验证对象=交付对象（2） | **是（本地边界）** |
| L4 | CI required checks | 干净环境复验 + 远程结论（3） | **是（协作边界）** |
| L5 | GitHub Ruleset/Branch Protection | 禁止绕过合并（4） | **是（仓库边界）** |

**对用户的表述约束**：提示词与自定义指令是**协作规则，不是硬安全边界**；本地管理员始终可以改文件或禁用 Hook；需要强保证时，最终权威是受保护分支上的 CI 结果。

## 6. 五条可信不变量（Trust Invariants）

| ID | 不变量 | 失败时行为 |
|---|---|---|
| INV-01 | 通过验证的变更快照必须与提交时 staged tree 一致 | 阻止提交，要求重新验证 |
| INV-02 | 满足 Gate 要求的证据必须来自已注册验证器 | 任意命令只记为 diagnostic，不满足 Gate |
| INV-03 | 新 Gate 必须绑定 Task、仓库、worktree、branch、base HEAD | 拒绝创建或进入 legacy 隔离模式 |
| INV-04 | 风险、配置或允许范围改变后，相关证据自动失效 | 回到 verification 阶段 |
| INV-05 | 本地结论不能替代远程 required check | 严格模式下阻止完成或明确降级 |

## 7. 非目标（明确不做）

- 不承诺抵御拥有仓库、系统和 CI 管理权限的恶意管理员
- 不以 LLM Review 作为唯一阻断条件
- 不自研 SAST/Sonar/Semgrep 替代品
- 不建设中央 SaaS/RBAC/计费/组织策略中心
- 不采集并上传源码、命令输出、路径、PRD 内容或证据原文

## 8. 设计原则（约束实现）

1. 可信优先于功能数量：先证明已有能力不可轻易绕过。
2. 确定性优先于语义推断：路径、Git tree、命令、退出码、hash 由程序判断；LLM 只负责解释与建议。
3. 默认安全，渐进增强：Lite 也有最小安全底线，但不继承无关重流程。
4. 一个真相源，多 Agent 适配：策略由 Harness 保存，Agent 指令与 Hook 是生成物。
5. 阻断必须可解释：任何失败都输出原因、修复命令和预计成本。
6. 本地证据与远程保护分层：本地提升反馈速度，CI/Ruleset 形成合并边界。
7. 隐私默认关闭采集。

## 9. 验收

- [ ] P0 对抗性测试清单（方案 §10.2，15 条）覆盖攻击者等级 1-2
- [ ] 每条不变量有至少一个自动化测试
- [ ] 对外文档明确"本地非安全边界"表述

## 10. 实施记录追加（2026-08-22，HTH-009 — F-04 修复）

| 工作包 | 状态 | 交付 |
|---|---|---|
| HTH-009 | ✅ 已实现 | `bin/hook-agent.mjs`（Node 化 hook 处理器：stdin JSON → 结构化危险规则 → 决策 JSON，不使用 sed/脆弱文本解析）；`bin/hooks.mjs`（`hooks doctor`：支持级别 matrix claude/codex/copilot + 模拟 3 危险 + 2 安全样例）；`harness hooks doctor\|test` 命令 |

边界更新：
- 支持级别：claude=native-blocking、copilot=native-blocking、codex=advisory
- "已保护"仅在各 Agent 配置文件真实安装 hook 且入口可达时成立；未安装时显示"本地 Agent 层未保护，Git/CI 层仍可用"
- 危险规则为结构化 `DEFAULT_SAFETY_RULES`（SR-001~005），支持扩展；后续可接入 `harness/policies/anti-patterns.json`
