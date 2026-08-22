# REQ-20260822-guided-ux-p1-2

- **任务**: 优化：实施 Harness 引导式体验（P1 第二批：setup 统一接入 + 保护覆盖 doctor）
- **Gate**: GATE-2026-08-22T15-33-15
- **Task**: TASK-20260822153307-9addeffb
- **日期**: 2026-08-22
- **类型**: 功能优化（引导式体验）
- **权威方案**: `harness优化升级实施方案-20260820.md` §6.1（setup）+ §6.5（保护覆盖 doctor）
- **承上**: P0 全部完成 + P1 第一批（do/next）完成

## 需求描述

1. **HTH-012（`setup` 统一接入）**：`harness setup` 作为唯一推荐首次接入入口（init/onboard 保留兼容别名）；`--dry-run` 永远可用（列出将创建/修改的文件、需用户在 GitHub 完成的操作、如何撤销、下一条命令）。
2. **HTH-015（保护覆盖 doctor）**：`harness doctor` 增加保护覆盖检查——Git Hook 安装、CI workflow、注册验证器；每项 pass/warn/fail，不把警告计入"全部通过"。

## 变更范围

| 文件 | 变更 |
|---|---|
| `bin/harness.mjs` | 新增 `setup` 分支（含 --dry-run 预检）；doctor checks 追加保护覆盖项 |
| `bin/guide.test.mjs` 或 `bin/cli-e2e.test.mjs` | 追加：setup --dry-run 输出；doctor 保护覆盖项 |
| `docs/getting-started.md` | 首接入改为 `setup` |

## 跨层搜索结论

升级对象为引擎仓 `bin/` 层（harness/init 委托），无 PallasTrade 业务层。

## Skill 咨询（已读，承上批）

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `harness-docs/SKILL.md` | ✅ 已读 | 文档同步；首接入入口更新 |
| `harness-prd/SKILL.md` | ✅ 已读 | 已确认 PRD 的 FR-007 延续 |
| `pallastrade-customization/SKILL.md` | ✅ 已读 | 无冲突 |

## 技术方案（初步）

1. **setup**：`--dry-run` 输出将创建/修改的文件清单 + GitHub 侧操作提示 + 撤销方式 + 下一条命令；非 dry-run 委托 init.mjs（参数透传）。
2. **doctor 保护覆盖**：在 doctor checks 追加 `git-hook-installed`（.git/hooks/pre-commit）、`ci-workflow`（.github/workflows/test.yml）、`verifiers`（config.evidence.verifiers 非空）。
3. 测试：setup --dry-run 含 MODIFY/CREATE 与 GitHub 提示；doctor 含新检查项且 pass/fail 正确。

## 风险点

- setup 委托 init 需保持参数兼容（--preset/--tier/--name）
- doctor 新 check 不应破坏现有 11 项
- 全套回归必须全绿
