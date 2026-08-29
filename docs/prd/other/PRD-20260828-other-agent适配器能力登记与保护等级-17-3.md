# PRD-20260828-other-agent适配器能力登记与保护等级-17-3

| 元数据 | 值 |
|---|---|
| 状态 | approved |
| 创建日期 | 2026-08-28 |
| 来源 | 新增：Agent适配器能力登记与保护等级（§17.3） |
| 分类 | other（引擎仓 self-dogfood 功能） |
| 需求类型 | 新功能（设计文档 §17.3.1–17.3.2） |

> 对应设计文档：`harness持续治理机制设计(1).md` **§17.3 Agent 接入协议**（保护等级 enforced/guarded/advisory + 能力登记）。

## 1. 背景与目标

- **背景**：引擎已有 `adapter generate`（生成托管策略块），但缺"能力登记"——插件安装不等于自动获得信任；也缺保护等级的**诚实报告**（enforced/guarded/advisory 三选一，不能把"给了提示"说成"已经拦住"）。
- **目标**：实现 Agent 适配器能力登记 + 保护等级派生 + 诚实报告。
- **成功指标**：`harness adapter register` 校验并保存能力；`harness adapter registered` 输出含保护等级的诚实报告；派生逻辑可测试。

## 2. 用户故事 / 场景

- 作为 引擎使用者，我希望登记我的 IDE Agent 能力（读治理上下文/提计划/改文件/跑检查/能否拦截写入），以便 Harness 按最小权限授予。
- 作为 引擎使用者，我希望看到保护等级的真实描述（强制/部分/仅提醒），以便知道"能不能真的拦住"。
- 场景：正常（合法登记 → 保护等级派生正确）、边界（声明未知能力 → 拒绝）、异常（无拦截能力 → advisory，诚实降级）。

## 3. 功能需求（FR）

- FR-001：新增 `bin/capability-registry.mjs`：能力白名单、`validateCapabilityRegistration`、`deriveProtectionLevel`（声明 block_write+block_command/block_commit → enforced；有任一 block_* → guarded；否则 advisory）、`honestReport`（大白话描述）。
- FR-002：登记存储 `.harness-state/adapters/<id>.json`；`registerCapability` / `listRegisteredCapabilities` / `removeCapability`。
- FR-003：`harness adapter register --id <id> --kind agent_adapter --capabilities a,b [--needs-permission x] [--cannot-do y] [--protection-level <level>]` 校验并保存。
- FR-004：`harness adapter registered [--json]` 列出已登记适配器 + 诚实保护报告。
- FR-005：`harness adapter unregister --id <id>` 移除登记。
- FR-006：非法登记（未知能力/未知 cannot_do/缺 id）被拒绝并报错。

## 4. 非功能需求（NFR）

- 向后兼容：`adapter list|generate` 行为不变。
- 诚实：保护等级由能力派生或显式声明，报告用大白话（"已强制保护"/"已开启保护，但仍需注意"/"只能提醒"）。
- 确定性：纯函数 + 本地存储，可测试。

## 5. 验收标准（AC，与测试一一映射）

- AC-001 ← FR-001：合法登记通过校验，非法登记（缺 id / 未知能力 / 未知 cannot_do）被拒绝。
- AC-002 ← FR-001：声明 block_write+block_command → enforced；仅 block_write → guarded；无 block_* → advisory。
- AC-003 ← FR-001：honestReport 输出对应大白话描述。
- AC-004 ← FR-002：register → list 往返正确（临时目录）。
- AC-005 ← FR-003/004：CLI `adapter register` + `adapter registered` 可用且输出保护等级。
- AC-006 ← FR-006：CLI 非法登记 exit 非 0 并报错。

## 6. 技术影响

- 新增：`bin/capability-registry.mjs`、`bin/capability-registry.test.mjs`。
- 修改：`bin/agent-adapters.mjs`（runAdapters 增加 register/registered/unregister 子命令）。
- 文档：`docs/commands.md`、`docs/getting-started.md`、`README.md`、`CHANGELOG.md`。
- 影响面：`harness affected --base origin/main` 输出。

## 7. 测试计划

- `test`：`node --test bin/capability-registry.test.mjs` + 全量 `node --test bin/*.test.mjs`。
- AC 映射：AC-001~004 → capability-registry.test.mjs；AC-005~006 → CLI 冒烟。
- 校验：`prd verify --semantic --id PRD-20260828-other-agent适配器能力登记与保护等级-17-3` 对本 PRD 通过。

## 8. 文档同步清单（知识同步门）

- `docs/commands.md`：`adapter register|registered|unregister`。
- `docs/getting-started.md`：Agent 接入小节。
- `README.md`：命令表。
- `CHANGELOG.md`：Unreleased。

