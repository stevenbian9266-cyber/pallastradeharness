# REQ-20260822-trust-kernel-p0-3

- **任务**: 优化：实施 Harness 可信化升级（P0 第三批：Verifier Registry + 手工证据收紧）
- **Gate**: GATE-2026-08-22T14-46-33
- **Task**: TASK-20260822144627-6f25d176
- **日期**: 2026-08-22
- **类型**: 功能优化（Harness 引擎自身可信化）
- **权威方案**: `harness优化升级实施方案-20260820.md` §5.2（P0-2 Verifier Registry）+ §5.1 边界
- **承上**: REQ-20260822-trust-kernel-p0-1/2 完成；用户已确认 PRD 并授权 P0 分批实施

## 需求描述

把"命令退出 0"升级为"已注册且适用于当前风险的验证器退出 0"（F-02）：

1. **HTH-005（Verifier Registry）**：
   - 新增 `harness verify <verifier-id>` 命令，只允许执行 `config.evidence.verifiers` 中已注册的验证器。
   - `evidence run --type test -- <任意命令>` 继续可用，但默认标记 `diagnostic`，不满足严格 Gate 的 test 要求。
   - Evidence 记录 verifierId + verifierDefinitionHash；配置中验证器定义变化后旧证据失效。
2. **HTH-006（手工证据收紧）**：`evidence record` 的手工证据默认 `success: null`（非 true），必须经独立 approval 才可满足 Gate；消除"无 exit code 即成功"的漏洞（F-02 第二面）。

## 变更范围

| 文件 | 变更 |
|---|---|
| `bin/verifier.mjs` | 新增：verifier registry（读取 config.evidence.verifiers）+ 定义 hash + 运行 |
| `bin/harness.mjs` | 新增 `verify` 子命令（--list / <verifier-id>） |
| `bin/evidence.mjs` | record/run 支持 verifierId；run 未指定验证器时标记 diagnostic；record 手工证据 success:null |
| `bin/config-loader.mjs` | DEFAULT_CONFIG.evidence 增加 verifiers 默认注册表（unit/docs） |
| `bin/verifier.test.mjs` | 新增：注册表/定义 hash/diagnostic 降级/验证器变化失效测试 |
| `bin/evidence.test.mjs` | 更新：verifyTaskEvidence 对 diagnostic/无 verifier 证据的判定 |
| `docs/rfc/0002-change-snapshot.md` | 追加 HTH-005/006 实施记录 |

## 跨层搜索结论

升级对象为引擎仓 `bin/` 层（verifier/evidence/harness/config-loader），无 PallasTrade 业务层。`change-snapshot.mjs` 为已验证依赖，无重复实现。

## Skill 咨询（已读，承上批）

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `pallastrade-customization/SKILL.md` | ✅ 已读 | 引擎自身修改无业务定制冲突 |
| `harness-prd/SKILL.md` | ✅ 已读 | 已确认 PRD 的 FR-002 延续 |
| `harness-docs/SKILL.md` | ✅ 已读 | 代码变更同步文档；本批同步 RFC-0002 |

## 技术方案（初步）

1. **验证器注册表**（config）：`evidence.verifiers` 结构如方案 §5.2 示例（id/type/command/cwd/timeoutMs/profiles/paths）。
2. **定义 hash**：对 verifier 的规范化 JSON 计算 sha256；证据记录 verifierId + definitionHash；`evidenceFreshness` 重算定义 hash 不一致 → 失效。
3. **`harness verify`**：`verify --list` 列出注册验证器；`verify <id>` 运行并记录为 `test` 类型证据（含 verifierId）。
4. **diagnostic 降级**：`evidence run --type test` 未指定 verifier → 证据标记 `metadata.diagnostic: true`；`verifyTaskEvidence` 对 test 类型只接受非 diagnostic 且 verifierId 存在的证据。
5. **手工证据**：`evidence record` 的 success 改为 `null`（除非 `--approve` 且经审批流程），`verifyTaskEvidence` 不接受 success:null 证据满足 Gate。

## 风险点

- 兼容：现有 `evidence run --type test` 用户（如本仓第一批/第二批）会被标记 diagnostic → 需要 `harness verify` 替代；文档需同步
- verifyTaskEvidence 收紧可能误伤旧证据 → 过渡期：无 verifier 但非 diagnostic 的旧证据仍视为 test（仅新记录且未指定 verifier 时标记 diagnostic）
- 全套测试回归必须全绿
