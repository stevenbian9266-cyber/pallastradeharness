---
layout: default
title: 命令参考
---
# 命令参考

| 命令 | 说明 |
|---|---|
| `harness init` | 生成 `harness.config.mjs` 骨架（`--preset` / `--tier` / `--ai` / `--team`） |
| `harness gate --task "..."` | 创建分阶段门禁（前缀自动判定类型）；`--quiet` 只输出 check 计数 + 必读提示（默认全量；token 优化） |
| `harness gate:status [--short]` | 当前 preparation / implementation / finished 状态（有效/过期）；`--short` 单行输出（token 优化） |
| `harness gate:clear --gate <ID> --clear <check-id>` | 清除单个 check（回显精简：变更项 + 计数 + 剩余 id，不重复 check 描述） |
| `harness gate:migrate [--dry-run]` | 将旧 Gate 迁移为分阶段生命周期 |
| `harness gate:required` | 供 lefthook/CI 硬卡（未完成 verification → exit 1） |
| `harness gate:clean` | 清理过期 gate 文件 |
| `harness standards list [--category x] [--json]` | 列出机器可读规范 |
| `harness standards select [--base ref] [--files ...] [--json]` | 根据 Diff/文件选择适用规范 |
| `harness standards coverage [--json]` | 报告机器执行、Review、仅文档覆盖率 |
| `harness supervise plan --task <text> [--allow ...] [--deny ...]` | 输出 Risk + Change Plan + 必需规范/证据 |
| `harness supervise diff [--base ref] [--plan path] [--json]` | 执行范围、依赖、架构、循环和新代码质量监督 |
| `harness supervise review [--base ref] [--json]` | 执行 Database/API/Security/UI/Interaction/A11y/Knowledge 专项监督 |
| `harness task start/status/checkpoint/resume/handoff/finish/abandon` | 持久任务状态机、检查点和跨 Agent 交接；`start --ac <PRD-ID> AC-x` 任务↔AC 绑定（§19.4，完成时校验 AC 覆盖与未认领 AC）；`list` 默认只显示最近 N 条（`config.output.taskListDefaultLimit`，默认 20；`--all` 全量；`--status <status>` 过滤；token 优化） |
| `harness brain index/context/decision/status` | 项目画像、知识索引、最小上下文和决策记录 |
| `harness risk check` | Quick / Standard / Critical 风险复评；自动判断只允许升级 |
| `harness evidence run/record/list/verify/bundle/report` | 采集、验证与交付绑定代码状态的类型化证据 |
| `harness verify <verifier-id>` | 受信验证器注册表（`unit` / `docs` / `coverage`）；`verify coverage` 产出 typed 证据并自动满足 `coverage-gate`（§19.3） |
| `harness recovery create/status/verify` | Critical 任务的人工恢复预案与检查点 |
| `harness knowledge assess/status/verify` | 对受影响知识资产作显式闭环评估 |
| `harness adapter generate` | 为 Codex/Claude/Copilot/Cursor/generic 生成受控策略块（默认 dry-run） |
| `harness adapter register / registered / unregister` | Agent 能力登记与诚实保护报告（§17.3.2）：`register --id <id> --capabilities a,b,c` 校验并保存；`registered` 输出 enforced/guarded/advisory 大白话描述；`unregister --id <id>` 移除 |
| `harness governance:init / status / version` | 治理版本与项目画像（§15 总前置条件）：`init --name <n>` 建 `harness/project.yaml`；`status` 大白话报告未就绪项；`version` 仅当 `governance_ready` 时锁定 `governance-0.1.0`（状态机只前进，禁止覆盖） |
| `harness wizard init / step / status / from / finish / reset` | 从零项目 10 步向导（§17.7）：`init --name <n>` 开始；`step --n <1-9> --answer <v>` 逐步记录（多选逗号分隔）；`status` 进度；`from --file <answers.json>` 批量载入；`finish` 生成项目底座并锁定治理版本；`reset` 清空。答案存 `.harness-state/wizard/answers.json`（可恢复） |
| `harness mcp` | 启动无任意 shell 能力的 stdio MCP 服务 |
| `harness tui [--json] [--watch]` | 展示任务、风险、Gate、证据和下一步动作 |
| `harness config:migrate / state:migrate` | dry-run 优先迁移至 1.0 schema；`--write` 后自动备份 |
| `harness ci github [--base main] [--write]` | 生成多档位 CI（v1.6.0）：`harness.yml`（PR 快速门禁：anti-patterns/secrets/doc-impact/generated-check/coverage-gate 分工 job + 主矩阵）、`harness-nightly.yml`（cron 定时：check --profile full + coverage --enforce + scenarios/freshness）、`harness-release.yml`（tag 触发：全档 + 发布清单） |
| `harness skill catalog list\|add` | Auto-Skills：三层领域目录管理（内置基线 / 项目 `harness/catalog/*.json` / 订阅；`add --path <json>` 本地订阅） |
| `harness prd new/list/verify` | PRD 工作流（骨架创建 + 查重回写 + AC→测试校验）；`verify --semantic` 拒绝空断言/全 mock 的"假覆盖"（§19.2） |
| `harness check --profile quick\|full` | 检查档案（变更感知：本地默认只扫 changed-files） |
| `harness doc-impact --base origin/main` | 知识同步门 |
| `harness docs:check [--json]` | 检查 Agent/README/文档站 Markdown 的本地链接目标；断链返回 exit 1 |
| `harness readme:sync [--check\|--write]` | README 版本信息防漂移：从 `package.json`（当前版本）+ `CHANGELOG.md`（已发布版本）同步「发布信息/版本记录」；`--check` CI 硬卡（漂移 exit 1）；`--write` 就地修复（更新当前版本行 + 补齐缺失版本表行，自动生成行标注「待润色」） |
| `harness scan-anti-patterns / scan-secrets / scan-degraded-loop / scan-ui-anti-patterns` | 扫描器（供 lefthook staged_files 调用）；`scan-ui-anti-patterns`：UI-001 inline style / UI-002 硬编码色（排除 design-tokens）/ UI-003 裸 fetch / UI-005 img 缺 alt（§18.1） |
| `harness visual:baseline / visual:diff` | 视觉回归（§18.4）：golden screenshot 基线 + 像素 diff（pngjs+pixelmatch）；`baseline --from <dir>` 建基线，`diff --from <dir>` 超阈值 exit 1，无基线/无截图 → `validation_unavailable`（exit 2） |
| `harness baseline:create / check / status` | 存量项目质量基线 / no_regression（§14.5）：`create` 运行测试并记录"当前已知失败"（历史失败不清零）；`check` 三态——新增失败阻断 / 历史失败仅记录 / 已修复（改善）；`status` 查看基线；无基线 → `no_baseline`（exit 0，先 create） |
| `harness design:scan [--scope business\|data\|code\|all] [--json]` | 设计阶段现状识别（设计阶段治理）：PRD 确认后技术方案 Part A 的事实来源——业务模块/服务盘点、数据模型与字段（migrations/prisma/sql/entity/model）、公共符号清单（导出函数/常量/类 + 文件位置） |
| `harness design:check [--task <id>] [--json]` | 设计产物机器校验（§19A.4）：校验 `docs/designs/<task>/` 4 设计文档存在 + tech-design Part A 四节 + Part B 复用矩阵；fail>0 exit 1。`gate:clear --clear` 6 个设计检查项（create-ui-doc 等）必须先通过本校验才能 clear（design-confirmed 保持人工 WAIT） |
| `harness reuse-adherence [--json]` | 技术方案复用决策落地校验（设计阶段治理）：解析 `docs/designs/<task>/tech-design.md` 复用矩阵——调用已有（非定义文件被引用）/ 扩展已有（依据文件存在）/ 新封装公用（导出且被用）/ 新建局部（仅单文件）；fail>0 exit 1，无法判定 → warning 不阻断 |
| `harness doctor` | 项目体检 |
| `harness config:check` | 配置校验 + 默认值使用报告 |
| `harness plugins:list` | 列出已加载插件（check / scanner / preset） |
| `harness suggest` | 自学习建议（`--format json` / `--since-days N`） |
| `harness report` | 工程机制报告（gate 通过率 / 扫描趋势 / 文档资产） |
| `harness metrics [--json] / export` | 本地匿名指标（HTH-019）；`metrics` 显示聚合 + 产物文档统计（PRD/REQ/designs 计数/字节/token 估算 ≈ bytes/4，token 优化 §6.6）；`metrics export [--out <file>]` 导出 JSON 供审阅 |
| `harness eval-ai / eval-scenarios / eval-llm` | AI 行为评估（GS 场景库） |
| `harness sync-check [--id ID] [--base ref]` | 知识同步评估门；`--base` 可将评估限定到当前任务基线 |
| `harness generated:check` | 生成文件漂移检查 |
| `harness cache:clean` | 清理缓存 |
| `harness affected` | 变更影响分析 |
| `harness analyze` | 项目栈/层/差距分析（`--write` 生成配置草案；支持 Java/Maven/Gradle/Spring Boot 识别） |
| `harness onboard [--write] [--preset auto\|nextjs\|rails\|single\|monorepo] [--tier lite\|standard\|strict]` | 冷启动：从 0 / 存量项目一键接入（配置 + policies + 通用 skills + PRD 模板 + 规范骨架）；v1.5.0 起 `--write` 自动检测技术栈并批量生成领域 Skill（内容模板渲染，含项目权威文件）；v1.6.0 起自动生成 `lefthook.yml`（提交拦截）+ `ai/hooks/`（AI 行为级安全钩子）+ 配置深度补全（profiles/coverage/risk/brain/syncCheck/generatedCheck，lite 档降级） |
| `harness standards gap` | Auto-Standards：领域代码 vs 规范覆盖缺口报告（含 Java/Maven 信号） |
| `harness standards validate` | Auto-Standards：规范文件 schema 校验 |
| `harness standards generate [--domains ...] [--write]` | Auto-Standards：生成规范起草包 + 安装 standards-audit skill（dry-run 优先） |
| `harness skill new --domain <x> [--title ...]` | Auto-Skills：创建领域 Skill + 自动注册索引；v1.5.0 起若有 `presets/skills/<x>.md` 内容模板则渲染有实质内容版（非空骨架） |
| `harness skill check [--freshness]` | Auto-Skills：结构 + 索引一致性校验；`--freshness` 追加权威路径新鲜度 + gate 幽灵引用检测 |
| `harness skill list [--format json]` | Auto-Skills：领域清单 |
| `harness skill audit [--json\|--generate\|--check]` | Auto-Skills 自动治理（v1.3.0）：技术栈/架构/领域词能力指纹 → 三层目录匹配 → 应有 vs 现有对比 → MISSING/STALE/OK + 疑似新领域；`--generate` 自动创建 缺失 Skill 并注册索引（v1.5.0 起用 `presets/skills/` 内容模板渲染，注入项目权威文件）；`--check` CI 硬卡 must 级缺失 |
| `harness skill catalog list\|add` | Auto-Skills：三层领域目录管理（内置基线 / 项目 `harness/catalog/*.json` / 订阅；`add --path <json>` 本地订阅） |
| `harness scan [--fix] [--check] [--json] [--category <id>]` | 资产治理：扫描 skills/standards/agent/PRD/scenarios/索引 + 自愈（`--fix` 自动补齐 L0 确定性项；`--check` CI 硬卡 must 级缺口；MUST/SHOULD/NICE 分级） |
| `harness docs generate --asset <path> [--write]` | Auto-Docs：知识文档起草包（AI 起草 + 人确认） |
| `harness docs template --copy [--preset x]` | Auto-Docs：安装 PRD 模板到 `docs/prd/_TEMPLATE.md` |

## 常用组合

```bash
# 一次可恢复、可审计的任务全流程
npx harness task start --title "修复：xxx" --allow "src/**" \
  --ac PRD-20260828-xxx AC-001,AC-002      # 可选：任务↔AC 绑定（§19.4）
npx harness brain context --task <TASK-ID>
npx harness risk check --task <TASK-ID>
npx harness gate --task "修复：xxx" --task-id <TASK-ID>
# 清空 Gate 输出中的 preparation checks 后进入 implementation
npx harness supervise plan --task "修复：xxx" --allow "src/**"
npx harness supervise diff
npx harness verify coverage --task <TASK-ID>   # 覆盖率验证器（§19.3，产出 coverage-gate 证据）
npx harness prd verify --semantic --id PRD-xxx # AC 语义校验（§19.2）
npx harness evidence run --task <TASK-ID> --type test -- npm test
npx harness knowledge assess --task <TASK-ID> --asset README.md \
  --status reviewed-no-change --reason "公共行为未变化"
npx harness knowledge verify --task <TASK-ID>
npx harness evidence verify --task <TASK-ID> --gate <GATE-ID>
npx harness task finish --task <TASK-ID>
npx harness gate:status
```

## 退出码

| 代码 | 含义 |
|---:|---|
| 0 | 命令成功；或 Gate 已允许当前生命周期动作 |
| 1 | 质量/策略失败，例如阻塞 Finding、未完成 preparation、测试证据不足 |
| 2 | 调用、配置、插件或 Git 上下文错误 |
| 3 | Harness 内部错误 |

`--json` 命令只在 stdout 输出 JSON；诊断信息进入 stderr。

## 扫描器独立 bin

- `harness-scan-anti-patterns` — 反模式扫描
- `harness-scan-degraded-loop` — AP-009 退化循环检测
- `harness-scan-secrets` — 密钥扫描

## Token 优化配置（v1.9.0 起，默认值 = 现状，约束零变化）

在 `harness.config.mjs` 中按需降档，不削弱 gate / 跨层搜索 / 证据 / 知识同步约束：

```js
export default {
  // 输出级可调项（默认保守保兼容）
  output: {
    gateListVerbose: true,     // false → gate 创建只输出计数+提示（等价 --quiet）
    taskListDefaultLimit: 20,  // task list 默认条数（0 = 全量）
    requireSkillRead: true,    // false → 移除 read-skill-* 检查项（默认 true 保约束）
  },
  // 允许按任务类型禁用内置 check（默认空；verify-test 证据门与 search-* 跨层搜索不可禁用）
  gates: {
    disableChecks: {
      feature: ['read-skill-prd', 'create-prd-doc'], // 示例：轻档项目跳过 PRD 工作流
    },
  },
  // designStage 分级：true（默认，全 feature 强制）| false | 'auto'
  // 'auto'：仅任务描述命中 uiKeywords（ui/页面/组件/交互/视觉/样式/storefront/dashboard）才强制 4 设计文档
  designStage: {
    enabled: 'auto',
    designsDir: 'docs/designs',
    uiKeywords: ['ui', '页面', '组件', '交互', '视觉', '样式', 'storefront', 'dashboard'],
  },
};
```
