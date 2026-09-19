# PRD — harness 托管 MCP 服务本地构建与离线部署

> **状态**：approved（授权：用户明确「我不打算发布到 github 继续开源了，我打算本地直接构建发布到服务器」；三项决策 = 暂不动 GitHub 仅停 npm 发布 / 目标服务 = harness 托管 MCP（mcp.pallastrade.cn）/ 传输 = docker save→scp→docker load）
> **创建**：2026-09-19 ｜ **分类**：other（部署与交付）｜ **任务**：TASK-20260919123118-6991b0c0
> **关联**：`docs/rfc/0005-hosted-service.md` §5 + 附录 A/B/C（本 PRD 是其**现状适配版**）· `docs/adr/ADR-0002-runtime-boundary.md`（Cloud 恒严格）· `docs/rfc/0006-runtime-boundary.md`

## 1. 背景

RFC-0005（托管服务方案）§5 给出的是 **GitHub 中心**的交付路径：服务器 `git clone` 本仓（deploy key）→ cron `pull-deploy-harness.sh` 拉代码 → `docker compose build` **在服务器上构建**。

用户决策改变了前提：

1. **不再开源发布**（仓库暂留 GitHub，但**停止 npm 发布链路**）；
2. **本地直接构建**，产物离线送到服务器（`docker save | gzip → scp → docker load`）。

同时，方案附录与**已实现的引擎**存在漂移（附录写的是 M5 形态）：

| 方案附录（M5 形态） | 已实现现状（Batch D） |
|---|---|
| `service/server.mjs`（独立服务代码目录） | `bin/cloud-runtime.mjs` + `bin/mcp-server.mjs`（引擎内） |
| `HARNESS_CLOUD_TOKEN_SALT` / `HARNESS_CLOUD_ADMIN_KEY`（多 Key） | `HARNESS_API_KEY`（**单静态 Key**，ADR-0002 D4） |
| 健康检查 `/healthz` + `/readyz` | 只有 `/health` |
| `/verify`（REST） | 未实现（M4） |
| `node:22-alpine` + `npm ci --omit=dev` | 引擎**零运行时依赖**（可直接 COPY，无需 npm ci） |

**风险**：现有部署路径在服务器构建（2C/8G、历史上磁盘满/OOM）+ 依赖 GitHub 可用性；且方案附录与实现不一致，直接照抄会得到一个**跑不起来**的镜像。

## 2. 目标

- **G1**：交付「**本地构建 → 离线交付 → 服务器激活**」的可复用流水线（Windows 本机 + Linux 服务器），不依赖 registry、不依赖 GitHub、不依赖服务器构建。
- **G2**：服务入口可用：`harness-mcp --http`（绑定 host/port、读取 `HARNESS_API_KEY`、打开 SQLite、暴露 `/healthz`）。**缺 Key 拒绝启动**（配置错误即失败，不半开）。
- **G3**：部署产物与方案对齐但**修正漂移**：compose 用镜像 tag（不 build）、nginx 独立限流 zone、`.env.mcp` 模板、Runbook 步骤。
- **G4**：**可回滚**：镜像按 tag 保留最近 3 个；激活脚本在探活失败时自动回退上一 tag。
- **G5**：部署契约**可测**：跨文件一致性（端口/镜像 tag 变量/健康路径/env 键）由测试守护，防止再次漂移。
- **G6**：停用本仓 npm 发布链路，并在文档中说明新的发布方式（本地构建 + 离线部署）。

## 3. 用户场景

**场景 A（日常发版）**：本机 `pwsh deploy/build-local.ps1` → `deploy/publish-local.ps1 -Server <ip>` → 服务器 load 镜像 → compose up → 公网 `https://mcp.pallastrade.cn/healthz` 200。

**场景 B（回滚）**：新版本探活失败 → `activate.sh` 自动回到上一 tag（≤1 分钟），并保留失败镜像供排查。

**场景 C（配置错误）**：忘记写 `HARNESS_API_KEY` → 容器**启动即失败**（日志明确），不会出现"起来了但对所有人 503/放行"的中间态。

**场景 D（审计/隔离）**：与现有 pallastrade 栈零耦合：独立目录 `/opt/harness-mcp`、独立 compose 项目 `harness-mcp`、独立网络、仅 `127.0.0.1:3110`、独立 nginx vhost 与证书。

## 4. 功能需求

- **FR-001**：`harness-mcp --http [--port <n>] [--host <addr>] [--db <path>]`：启动 HTTP MCP 服务；复用 `createCloudRuntime`/`startCloudRuntime`（不新造服务实现）。
- **FR-002**：启动前置校验：`HARNESS_API_KEY` 非空（否则退出码非 0 + 明确提示）；`node:sqlite` 不可用（Node < 22.5）时退出并给出 Node 版本提示；DB 文件路径可创建。
- **FR-003**：健康检查：`GET /healthz` 与 `GET /readyz` 返回 `{ ok: true, runtime: 'cloud', strictGovernance: true }`；`GET /health` 保持兼容。
- **FR-004**：优雅退出：收到 SIGTERM/SIGINT 时关闭 HTTP 监听与 DB 句柄（容器 stop 不产生脏状态）。
- **FR-005**：`deploy/Dockerfile`：`node:24-alpine`、非 root（`USER node`）、零依赖 COPY（不 `npm ci`）、`EXPOSE 3110`、`HEALTHCHECK` 打 `/healthz`、`CMD node bin/mcp-server.mjs --http`。
- **FR-006**：`deploy/docker-compose.mcp.yml`：`name: harness-mcp`；镜像 `harness-mcp:${HARNESS_MCP_TAG}`；`127.0.0.1:3110:3110`；`../data:/data` + `../logs:/logs`；`mem_limit 512m` / `cpus 0.75`；`restart: unless-stopped`；json-file 10m×3；健康检查同 FR-003。
- **FR-007**：`deploy/.env.mcp.example`：`HARNESS_API_KEY` / `PORT` / `DATA_DIR` / `NODE_ENV`（真实值不入库，`.env.mcp` 权限 600）。
- **FR-008**：`deploy/build-local.ps1`：构建镜像（tag = `<version>-<short-sha>`）→ `docker save` → gzip → `artifacts/dist/` + `manifest.json`（含 sha256、镜像 digest、git sha）。
- **FR-009**：`deploy/publish-local.ps1`：上传产物与 `deploy/` 脚本 → 远端 `activate.sh` → 远端 `/healthz` 探活 →（可选）公网冒烟；失败非 0 退出。
- **FR-010**：`deploy/activate.sh`：`docker load` → 写 `.env.tag`（保留 `.env.tag.prev`）→ `compose up -d` → 探活（30×2s）→ 失败自动回滚上一 tag；镜像保留最近 3 个。
- **FR-011**：`deploy/nginx/`：`mcp-ratelimit.conf`（独立 zone）+ `mcp.pallastrade.cn.conf`（80→443、TLS1.2/1.3、HSTS、`/healthz`·`/readyz`·`/mcp` location、其余 404）。
- **FR-012**：`deploy/README.md`：Runbook（Step 0–12 的**本地推送版**）、回滚、隔离矩阵、与 RFC 附录的差异说明。
- **FR-013**：停用 npm 发布：`.github/workflows/publish.yml` 移除 npm publish 触发（改为仅手动且明确拒绝），README/CHANGELOG 说明新发布方式。
- **FR-014**：部署契约测试：跨文件一致性 + `bash -n` 语法检查 + publish 链路停用断言。
- **FR-015**：本仓 `doctor.composeCandidates` 指向新 compose 文件（让既有 `harness doctor` 能验证部署资产存在）。

## 5. 非功能需求

- **零新增运行时依赖**（`package.json` dependencies 不变）；镜像不装 git/curl（健康检查用 `node -e fetch`）。
- **服务器零构建**：服务器只做 `docker load` + `compose up`（满足 2C/8G 资源约束，避免构建期磁盘/CPU 压力）。
- **可观测**：容器日志受 10m×3 上限；`/healthz` 供云监控与 compose 探活。
- **安全**：仅本机监听；Key 走 `env_file`（600）；镜像非 root；不在任何入库文件中出现真实 Key。

## 6. 验收标准（AC）

| AC | 内容 | 判定方式 |
|---|---|---|
| AC-001 | `harness-mcp --http` 可启动并打印监听地址；缺 `HARNESS_API_KEY` 时**拒绝启动**（非 0 + 明确提示） | `bin/mcp-server.test.mjs` |
| AC-002 | `/healthz`、`/readyz` 返回 200 且含 `strictGovernance: true`；`/health` 兼容 | `bin/mcp-server.test.mjs` + `bin/cloud-runtime.test.mjs` |
| AC-003 | `POST /mcp` 带正确 Bearer key → `initialize` 成功；无 key → 401 | `bin/mcp-server.test.mjs` |
| AC-004 | compose 引用 tag 变量、仅 127.0.0.1:3110、含资源上限与日志轮转 | `bin/deploy-contract.test.mjs` |
| AC-005 | 部署契约一致：Dockerfile EXPOSE / compose 端口 / nginx proxy 目标 / activate 探活路径 / env 键 | `bin/deploy-contract.test.mjs` |
| AC-006 | `activate.sh` 含回滚与保留 3 镜像逻辑，`bash -n` 通过 | `bin/deploy-contract.test.mjs` |
| AC-007 | 本地可构建可运行：`docker build` 成功、容器内 `/healthz` 200、`docker save` 产物 + manifest 生成 | 实测记录（证据 + `deploy-contract` 结构断言） |
| AC-008 | npm 发布链路停用（工作流无 publish 触发；文档说明） | `bin/deploy-contract.test.mjs` |
| AC-009 | 本仓 `doctor.composeCandidates` 指向 `deploy/docker-compose.mcp.yml` | `bin/deploy-contract.test.mjs` |

## 7. 架构 / 技术影响

- **架构影响**：`LOCAL`（新增部署层 `deploy/`；既有运行时复用，不新增端口/模块依赖）。
- **技术栈影响**：`NONE`（无新依赖；镜像基线 `node:24-alpine` 是部署产物，不进 `package.json`）。
- **治理影响**：命中 `criticalPaths`（`.github/workflows/**`、`**/*deploy*`、`**/Dockerfile*`）→ 任务为 **critical**：需 recovery plan + 审批证据。

## 8. 测试计划

1. `node --test bin/mcp-server.test.mjs`（HTTP 模式 e2e：启动/健康/鉴权/缺 Key 拒绝）
2. `node --test bin/cloud-runtime.test.mjs`（healthz/readyz 兼容断言）
3. `node --test bin/deploy-contract.test.mjs`（部署契约 + `bash -n` + publish 停用）
4. `npm run test:core` 全量回归
5. **实测**：本机 `docker build` + `docker run` + 容器内 `curl /healthz` + `docker save`（记录命令与输出作为证据）

## 9. 范围外

- 多租户 Key 管理 / 站点页面 / `/verify` REST / 计费（M4–M5，见 RFC-0005 §9 开放决策）
- 服务器实际执行（需要 SSH 凭据；本任务交付脚本与 Runbook，由用户在本机执行）
- GitHub 仓库可见性变更（用户选择"暂不动"，只停 npm 发布）
