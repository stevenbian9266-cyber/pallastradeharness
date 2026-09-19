# REQ — harness 托管 MCP 服务本地构建与离线部署

> Task: TASK-20260919123118-6991b0c0 ｜ PRD: `docs/prd/other/PRD-20260919-other-harness-mcp-local-deploy.md` ｜ Gate: GATE-2026-09-19T12-31-22
> 风险等级：critical（命中 `.github/workflows/**`、`**/*deploy*`、`**/Dockerfile*`）

## Step 0 — 跨层检索（AGENTS.md §3）

| 层 | 检索词 | 命中 | 结论 |
|---|---|---|---|
| `bin/` | `docker|compose|3110|Dockerfile` | `config-loader.mjs`（`doctor.composeCandidates`、criticalPaths 已含 `**/*deploy*`/`**/Dockerfile*`/`.github/workflows/**`）· `harness.mjs:57` composer-file 医生检查 · `standards-gen.mjs:40` 部署域信号 | **复用**：doctor 检查 + 风险路径已就绪，新增部署资产即可被既有机制覆盖 |
| `bin/` | `startHttpServer|/health` | `http-transport.mjs`（`createHttpHandler` 纯函数 + `startHttpServer`）· `cloud-runtime.mjs`（`startCloudRuntime`） | **复用**：只加 `/healthz`·`/readyz` 别名与 `--http` 入口，不新造服务实现 |
| `bin/` | `HARNESS_API_KEY` | `static-key-auth.mjs`（未配置→503；缺/错凭据→401） | **复用**；服务模式额外要求启动即校验 Key（FR-002） |
| `presets/` | `docker|deploy` | `skill-catalog.json`（deployment 域检测：Dockerfile/compose/k8s）· `skills/deployment.md` | **不冲突**：那是给消费方项目的领域 Skill，与本仓交付物无关 |
| `templates/` | `Dockerfile|compose` | 0 命中 | 无 |
| `rules/` | `Dockerfile|compose` | `base-standards.json:522-523`（部署域标准覆盖 Dockerfile/compose glob） | **适用**：新文件会被该标准扫到（supervisor 会校验） |
| `docs/` | `mcp.pallastrade.cn|3110` | `docs/rfc/0005-hosted-service.md` §5 + 附录 A/B/C（**GitHub 中心**的旧方案） | **需适配**：改为本地离线交付，并修正与实现不符的键名/路径 |

## Step 1 — Skill 咨询

| Skill | 关键结论 | 落地 |
|---|---|---|
| `harness-prd` | 一句话需求 → 完整 PRD（背景/FR/AC/测试计划）→ 确认 → 实施 | 本 REQ 对应 PRD 已扩充并 approved（用户三项决策） |
| `harness-docs` | 部署/Runbook 属于知识资产，变更后需同步并过 `docs:check` | `deploy/README.md` + RFC-0005 §5 适配说明 + README/CHANGELOG |
| `harness-standards-audit` | 部署标准需可验证（端口/健康路径/资源上限可断言） | 新增 `bin/deploy-contract.test.mjs` 做跨文件契约断言 |
| `presets/skills/deployment.md`（领域） | 镜像/环境变量/上线约定 | 镜像非 root、env_file 600、`HEALTHCHECK`、日志轮转 |

## Step 2 — 复用决策摘要

| 能力需求 | 决策 | 目标 |
|---|---|---|
| HTTP 运行时装配 | 调用已有 | `startCloudRuntime`（bin/cloud-runtime.mjs） |
| 健康检查实现 | 扩展已有 | `createHttpHandler`（bin/http-transport.mjs，+`/healthz`·`/readyz`） |
| 服务入口 | 扩展已有 | `resolveServerContext`（bin/mcp-server.mjs，+`--http`） |
| 鉴权 | 调用已有 | `authorizeRequest`（bin/static-key-auth.mjs） |
| DB 打开 | 调用已有 | `openHarnessDatabaseSync`（bin/sqlite-store.mjs） |
| 项目根/配置装载 | 调用已有 | `loadConfig`（bin/config-loader.mjs） |
| 版本/tag 命名 | 调用已有 | `getHarnessVersion`（bin/version.mjs） |
| 部署资产（compose/nginx/Dockerfile/脚本） | 新交付物 | `deploy/`（新增目录，方案附录 A–C 的现状适配版） |
| 部署契约测试 | 新交付物 | `bin/deploy-contract.test.mjs` |

## Step 3 — 需求与验收

- FR-001/002/003/004 → **AC-001 / AC-002 / AC-003**
- FR-005/006/007/011 → **AC-004 / AC-005**
- FR-008/009/010 → **AC-006 / AC-007**
- FR-013 → **AC-008**；FR-015 → **AC-009**；FR-012/014 → 覆盖在上列测试与文档中

## Step 4 — 风险与缓解

| 风险 | 缓解 |
|---|---|
| 镜像跑不起来（附录与实现漂移，如 `npm ci`、`node:22` 无 sqlite 标志） | 本地**真实构建 + 真实运行**（AC-007 实测），并按实现修正 Dockerfile |
| 服务器磁盘/内存（历史问题） | 服务器零构建；镜像 ~60MB、容器 512m 上限；产物与镜像保留 3 份 |
| 部署脚本在服务器上语法/路径错误 | `bash -n` 语法检查 + 契约测试断言关键行为（回滚、保留份数） |
| 无 Key 启动导致"半开"服务 | 启动即校验 `HARNESS_API_KEY`，缺则退出非 0（AC-001） |
| 与 pallastrade 栈互相污染 | 沿用方案 §5.1 隔离矩阵：独立目录/项目/网络/端口/nginx/证书 |
| 停 npm 发布后有人仍期待 tag 发布 | 工作流显式标注停用 + README/CHANGELOG 说明 |

## Step 5 — 验证计划

1. `node --test bin/mcp-server.test.mjs`（HTTP 模式：启动 / 健康 / 鉴权 / 缺 Key 拒绝）
2. `node --test bin/cloud-runtime.test.mjs`（`/healthz`·`/readyz` 与 `/health` 等价）
3. `node --test bin/deploy-contract.test.mjs`（契约一致性 + `bash -n` + 发布链路停用）
4. `npm run test:core` 全量回归
5. 本机实测：`docker build` → `docker run` → 容器内 `/healthz` 200 → `docker save` 产物与 manifest

## Step 6 — 文档同步清单

| 文档 | 更新内容 |
|---|---|
| `deploy/README.md`（新） | Runbook（本地构建→离线交付→激活→回滚）、隔离矩阵、与 RFC 附录差异 |
| `docs/rfc/0005-hosted-service.md` §5 | 标注交付形态变更（GitHub 中心 → 本地离线交付）与本仓已实施范围 |
| `README.md` | 「发布与部署」说明：npm 发布停用、本地构建直发 |
| `CHANGELOG.md` | `[Unreleased]` 条目（服务入口 + 部署资产 + 发布链路停用） |
| `harness.config.mjs` | `doctor.composeCandidates` 指向新 compose 文件 |
