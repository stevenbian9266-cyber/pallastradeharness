# Testing Standard

> Project Constitution 模板（Batch B / B09）。
> **单一事实源约束**：测试哲学与选择规则的内容权威源 = `presets/skills/testing.md`（由 `harness skill new --domain testing` 渲染成项目 Skill）。
> 本文档**只固化结构与项目差异**，不复制一份平行的测试真理（避免两份互相冲突的 Testing Truth）。
> 机器执行：验证器注册表（`config.evidence.verifiers`）+ `verify-test` 证据门 + 覆盖率/基线门。

## Testing Philosophy

- 核心理念（引用 `testing.md`：测试金字塔 / 行为优先 / 覆盖三态 / 测试即文档 / 可重复）：
- 本项目的取舍与例外：

## Static

- 静态检查（语法 / 类型 / lint）与执行时机：

## Unit

- 单测范围、框架、运行命令、时间预算：

## Integration

- 集成测试边界（模块间 / 依赖替身策略）：

## API

- 接口契约测试（请求/响应 / 错误格式 / 版本兼容）：

## Database

- 数据库相关测试（迁移 / 约束 / 事务）：

## Migration

- 迁移脚本的可逆性与演练要求：

## E2E

- 端到端流程（入口 / 断言 / 环境）：

## Browser

- 浏览器自动化（工具 / 稳定策略 / 选择器约定）：

## Visual

- 视觉回归（基线与阈值；未启用写 `N/A`）：

## Accessibility

- 无障碍检查项与工具：

## Performance

- 性能测试触发条件与阈值：

## Security

- 安全测试（扫描 / 权限 / 注入路径）：

## Test Selection Rules

- 改 A 必须跑 B 的映射规则（按目录 / 影响面）：
- 全量运行的触发条件：

## Bug Regression Rule

- 修复必须附带复现测试（先红后绿）：
- 无法复现时的替代证据要求：

## Mock Policy

- 允许 mock 的边界（外部 IO / 时钟 / 随机）：
- 禁止 mock 的对象（被测行为本身、治理门禁）：

## Fixture Policy

- 夹具组织、命名与复用规则：

## Test Data

- 测试数据来源与脱敏要求：

## Flaky Test Policy

- 判定标准（连续失败 / 环境相关）：
- 处置（隔离 / 修复期限 / 禁止 --skip 掩盖）：

## Coverage Expectations

- 覆盖率统计口径与阈值（未启用写 `N/A`）：
- 新代码最低要求：

## Evidence Requirements

- 满足 `verify-test` 的证据类型与新鲜度要求（绑定 HEAD / 注册验证器）：
- 证据存放位置与命名：
