# REQ-20260822-trust-kernel-p0-5

- **任务**: 优化：实施 Harness 可信化升级（P0 第五批：Node 化安全 Hook）
- **Gate**: GATE-2026-08-22T15-05-48
- **Task**: TASK-20260822150539-dd7cb4e9（risk: critical）
- **日期**: 2026-08-22
- **类型**: 功能优化（Harness 引擎自身安全）
- **权威方案**: `harness优化升级实施方案-20260820.md` §5.4（P0-4 Agent 原生 Hook 与生效诊断）
- **承上**: REQ-20260822-trust-kernel-p0-1~4 完成；用户已确认 PRD 并授权 P0 分批实施

## 需求描述

HTH-009（Node 化安全 Hook，F-04）：把 Agent Hook 从"脆弱 Shell 文本解析"升级为"Node 解析 JSON 的结构化安全拦截"：

1. **Node 化 hook 处理器**：`bin/hook-agent.mjs` 从 stdin 读取 Agent hook 输入（JSON），用结构化危险规则判断，输出 `{ decision, reason, ruleId }`；不使用 `sed`/脆弱 grep。
2. **支持级别 matrix**：Claude Code / Codex / GitHub Copilot 声明支持级别（native-blocking / advisory / unsupported）。
3. **`hooks doctor`**：验证 hook 配置、入口路径、执行权限；模拟危险/安全命令验证拦截正确。
4. **结构化危险规则**：内置 `DEFAULT_SAFETY_RULES`（破坏性 DB、DROP、批量删除、强推 main、密钥写入），支持规则扩展。
5. **未生效不谎报**：hook 未安装/未生效时不显示"已保护"。

## 变更范围

| 文件 | 变更 |
|---|---|
| `bin/hook-agent.mjs` | 新增：Node 化 hook 处理器（stdin JSON → 决策 JSON） |
| `bin/hooks.mjs` | 新增：`hooks doctor` 实现 + 支持级别 matrix |
| `bin/harness.mjs` | 新增 `hooks` 命令分支 |
| `bin/hooks.test.mjs` | 新增：危险/安全样例、doctor 模拟测试 |
| `docs/rfc/0001-threat-model.md` | 追加 HTH-009 实施记录（L1 层加固） |

## 跨层搜索结论

升级对象为引擎仓 `bin/` 层（agent-adapters 现有生成器是"指令块"非"工具拦截 hook"；本批新增真正的 hook 处理器）。无 PallasTrade 业务层重复实现。

## Skill 咨询（已读，承上批）

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `pallastrade-customization/SKILL.md` | ✅ 已读 | 引擎自身修改无业务定制冲突 |
| `harness-prd/SKILL.md` | ✅ 已读 | 已确认 PRD 的 FR-004 延续 |
| `harness-docs/SKILL.md` | ✅ 已读 | 代码变更同步文档；本批同步 RFC-0001 |

## 技术方案（初步）

1. **hook-agent.mjs**：`process.stdin` 收集输入 → `JSON.parse` → 提取 `tool_name`/`tool_input`（命令字符串或参数数组）→ 与 `DEFAULT_SAFETY_RULES`（regex）匹配 → 输出 `{ decision: 'block'|'allow', reason, ruleId, severity }`。对参数数组先 `join(' ')` 再匹配（保持简单、跨 Agent 输入容错）。
2. **hooks.mjs**：`ADAPTER_HOOK_SUPPORT`（claude: native-blocking / codex: advisory / copilot: native-blocking(agent hooks)）；`hooksDoctor()` 检查 hook 配置文件存在、入口存在、模拟 2 个危险 + 2 个安全样例。
3. **harness.mjs**：`hooks doctor` / `hooks test`（模拟输入）子命令。
4. 测试：危险样例必须 block（含换行/Unicode/嵌套引号），安全样例必须 allow；doctor 模拟输出正确。

## 风险点

- Agent hook 协议因 Agent 而异 → hook-agent 输出统一决策格式，adapter 层负责转换（本批只做处理器 + doctor，不做具体 Agent 配置文件安装）
- critical risk 需要 recovery plan + approval 证据 → 验证阶段补齐
- 全套测试回归必须全绿
