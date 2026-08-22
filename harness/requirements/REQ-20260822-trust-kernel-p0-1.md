# REQ-20260822-trust-kernel-p0-1

- **任务**: 优化：实施 Harness 可信化与易用性升级（P0 可信内核第一批）
- **Gate**: GATE-2026-08-22T14-29-51
- **Task**: TASK-20260822142943-f2abaa34
- **日期**: 2026-08-22
- **类型**: 功能优化（Harness 引擎自身可信化）
- **权威方案**: `harness优化升级实施方案-20260820.md`（P0-1/P0-2/P0-5 部分）

## 需求描述

pallastrade-harness@1.6.0 存在三类高风险绕过（F-01 验证后修改仍放行、F-02 任意命令冒充 test 证据、F-03 Taskless Gate），且独立仓自身无自治理（F-05）。本批次实施 P0 可信内核的第一批：

1. **HTH-010 前置（自治理骨架）**：独立仓加入 `AGENTS.md`、`harness.config.mjs`、`lefthook.yml`、`SECURITY.md`、`CHANGELOG.md`，让独立仓自身可跑通 Harness 治理闭环（self-dogfood）。
2. **HTH-001（Threat Model RFC）**：编写威胁模型与可信不变量 RFC，明确保护对象、可信主体、攻击者能力与非目标。
3. **HTH-002（ChangeSnapshot schema）**：定义 ChangeSnapshot 数据合同与 canonical hash 算法，跨平台 golden fixtures。

## 变更范围

| 文件 | 变更 |
|---|---|
| `AGENTS.md` | 新增：独立仓自治理说明 |
| `harness.config.mjs` | 新增：独立仓结构声明（layers/gates/evidence 等） |
| `lefthook.yml` | 新增：pre-commit/pre-push 钩子（anti-pattern + doc-impact） |
| `SECURITY.md` | 新增：安全问题报告方式 |
| `CHANGELOG.md` | 新增：变更日志 |
| `docs/rfc/0001-threat-model.md` | 新增：威胁模型与可信不变量 |
| `docs/rfc/0002-change-snapshot.md` | 新增：ChangeSnapshot 数据合同 |
| `bin/change-snapshot.mjs` | 新增：canonical hash 实现（index tree/worktree manifest） |
| `bin/change-snapshot.test.mjs` | 新增：跨平台 golden fixtures 测试 |
| `package.json` | 更新：版本/依赖/描述 |

## 跨层搜索结论

升级对象为引擎仓自身（`bin/`、`presets/`、`templates/`、`rules/`、`docs/`），不涉及 PallasTrade 六业务层。独立仓无第二套 Gate/Evidence。无重复实现风险。

## Step 1：Skill 文件咨询（已执行）

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `ai/skills/pallastrade-customization/SKILL.md` | ✅ 已读 | 定制决策树：先 Settings→Events→DI→Admin→Generators→Decorators；对引擎自身实施，本批次为引擎代码修改，无 PallasTrade 业务定制冲突 |
| `ai/skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 工作流：一句话需求→PRD→用户确认→gate→AC↔测试映射→知识同步；本批次 PRD 已按模板扩充 |
| `ai/skills/harness-docs/SKILL.md` | ✅ 已读 | 文档同步方法论：代码变更后更新受影响知识文档，`docs:check` 校验断链；本批次 RFC/CHANGELOG 属于知识资产 |

## 技术方案（初步）

1. **ChangeSnapshot**：用 `git write-tree` 得到 index tree SHA 作为"准备提交内容"主身份；对 allow 范围内 unstaged/untracked 文件生成稳定 manifest（排序、路径分隔符、编码跨平台一致）；Evidence 前后计算 snapshot，变化则标记 superseded。
2. **canonical hash**：Node 内置 crypto（sha256）+ git plumbing，无新增依赖；Windows 路径归一化 + UTF-8。
3. **自治理骨架**：参照主仓 `harness.config.mjs`/`lefthook.yml` 精简到独立仓结构（layers 指向 bin/presets/templates/rules/docs）。

## 风险点

- 跨平台 manifest 不一致（Windows 大小写/路径分隔符）→ golden fixtures 覆盖
- 独立仓尚无分支保护，实施期间直推 main → 完成后补 Ruleset/required checks（HTH-010 后半）
- npx 在 F 盘 exFAT 缓存上创建 symlink 失败 → 用 `node node_modules/pallastrade-harness/bin/harness.mjs` 直接调用
