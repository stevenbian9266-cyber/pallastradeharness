# 技术设计 — TASK-20260919123118-6991b0c0（harness 托管 MCP：本地构建 + 离线部署）

> PRD：`docs/prd/other/PRD-20260919-other-harness-mcp-local-deploy.md` ｜ REQ：`harness/requirements/REQ-20260919-harness-mcp-local-deploy.md`
> 原则：**服务实现零新增**——复用 Batch D 已交付的 Cloud 运行时；本任务只加"入口 + 部署资产 + 契约测试"。

## Part A — 现状识别（Baseline）

### A1 业务系统盘点

| 系统/流程 | 承载 | 与本次关系 |
|---|---|---|
| Cloud HTTP 运行时 | `bin/http-transport.mjs`（`createHttpHandler` / `startHttpServer`） | **扩展**：`/healthz`·`/readyz` 别名 |
| Cloud 组装根 | `bin/cloud-runtime.mjs`（`createCloudRuntime` / `startCloudRuntime`） | **复用**：`--http` 直接调用 |
| MCP 服务入口 | `bin/mcp-server.mjs`（`harness-mcp`，当前仅 stdio） | **扩展**：`--http` 模式（RFC-0005 M2） |
| 静态 Key 鉴权 | `bin/static-key-auth.mjs`（`HARNESS_API_KEY`） | **复用**（Key 名与方案附录不同，见 A3） |
| 存储 | `bin/sqlite-store.mjs`（`openHarnessDatabaseSync`，schema v2） | **复用**（DB 落在 `/data`） |
| 反代/入口 | nginx（既有 pallastrade vhost 之外的独立 vhost） | **新增** vhost + 限流 zone |
| 构建与交付 | 本机 Docker + scp/ssh | **新增**（替代 GitHub 中心 + 服务器构建） |

### A2 数据模型识别

| 实体 | 位置 | 字段/形态 | 本次影响 |
|---|---|---|---|
| Cloud DB | `/data/harness-cloud.db`（bind mount ← `/opt/harness-mcp/data`） | schema v2（15 表，含 `gates`/`tasks`/`evidences`） | 只挂载，不改结构 |
| 镜像产物 | `artifacts/dist/harness-mcp-<tag>.tar.gz` + `manifest.json` | `{tag, gitSha, file, bytes, sha256, imageDigest, builtAt}` | **新增**（交付物） |
| 运行时环境 | `deploy/.env.mcp` / `.env.tag` / `.env.tag.prev` | 键见 A3 | **新增** |
| 备份 | `/opt/harness-mcp/backups/db-YYYYMMDD.sqlite`（cron 03:30） | 沿用方案 §4.3 | 不改 |

### A3 字段盘点

| 键/字段 | 承载 | 取值 | 说明 |
|---|---|---|---|
| `HARNESS_API_KEY` | `.env.mcp` → 容器 env | 随机 ≥32 字符 | **方案附录写 `HARNESS_CLOUD_TOKEN_SALT`/`ADMIN_KEY`（M5 多 Key 形态）——本任务按实现修正为单静态 Key** |
| `PORT` | `.env.mcp` | `3110` | Compose 端口映射与 nginx 反代目标 |
| `DATA_DIR` | `.env.mcp` | `/data` | 容器内数据目录 |
| `NODE_ENV` | `.env.mcp` | `production` | — |
| `HARNESS_MCP_TAG` | `.env.tag`（脚本写） | `<version>-<short-sha>` | compose 镜像插值来源（**回滚点**） |
| 健康路径 | 服务/nginx/compose | `/healthz`（+`/readyz` 别名） | 方案规定；实现原先只有 `/health` |
| `HARNESS_ROOT`（可选） | 容器 env | 未设置 | 设置时才加载该目录的 `harness.config.mjs`；否则用 `DEFAULT_CONFIG` |

### A4 代码结构

```text
bin/mcp-server.mjs          ← +--http（启动 Cloud 运行时；缺 Key/无 sqlite 即失败）
bin/http-transport.mjs      ← +/healthz·/readyz 别名（/health 兼容）
bin/deploy-contract.test.mjs← 新增：跨文件契约 + bash -n + 发布链路停用断言
bin/mcp-server.test.mjs     ← +HTTP 模式 e2e
bin/cloud-runtime.test.mjs  ← +健康路径别名断言
deploy/                     ← 新增：Dockerfile / compose / env 模板 / 构建·上传·激活脚本 / nginx / README
.github/workflows/publish.yml ← npm 发布链路停用
harness.config.mjs          ← doctor.composeCandidates 指向新 compose
```

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| HTTP 运行时装配 | 调用已有 | startCloudRuntime | bin/cloud-runtime.mjs（已导出；Batch D 交付） |
| HTTP 处理器/监听 | 扩展已有 | createHttpHandler | bin/http-transport.mjs（+健康路径别名，保持纯函数） |
| 服务入口与根解析 | 扩展已有 | resolveServerContext | bin/mcp-server.mjs（+`--http` 分支，stdio 行为不变） |
| 静态 Key 鉴权 | 调用已有 | authorizeRequest | bin/static-key-auth.mjs（Cloud 恒严格链路上已有） |
| DB 打开与迁移 | 调用已有 | openHarnessDatabaseSync | bin/sqlite-store.mjs（schema v2） |
| 项目根/配置装载 | 调用已有 | loadConfig | bin/config-loader.mjs（`HARNESS_ROOT` 存在时才加载） |
| 镜像 tag 命名与版本 | 调用已有 | getHarnessVersion | bin/version.mjs（tag = 版本 + 短 sha） |
| 部署资产（镜像/栈/脚本/nginx） | 新交付物 | deploy 目录 | 方案附录 A–C 的现状适配版（本任务新增，属部署层） |
| 部署契约测试 | 新交付物 | deploy-contract 用例 | 本任务新增（防跨文件漂移） |

> 决策列取值域：调用已有 / 扩展已有 / 新封装公用 / 新建局部。
> 说明：`deploy/` 与契约测试为**新交付物**（非「新封装公用符号」，故不占用上表决策列）；引擎侧只做两处「扩展已有」。

## Part C — 实施设计

### C1 文件清单（按实施顺序）

1. `bin/http-transport.mjs` — 健康路径别名（`/health`·`/healthz`·`/readyz`）
2. `bin/mcp-server.mjs` — `--http` 模式：Key 校验 → DB 打开 → `startCloudRuntime` → 打印监听行 → SIGTERM/SIGINT 优雅关闭
3. `deploy/Dockerfile`、`deploy/docker-compose.mcp.yml`、`deploy/.env.mcp.example`
4. `deploy/build-local.ps1`、`deploy/activate.sh`、`deploy/publish-local.ps1`
5. `deploy/nginx/mcp-ratelimit.conf`、`deploy/nginx/mcp.pallastrade.cn.conf`
6. `deploy/README.md`（Runbook + 差异说明）
7. `bin/deploy-contract.test.mjs`、`bin/mcp-server.test.mjs`（+HTTP e2e）、`bin/cloud-runtime.test.mjs`（+别名）
8. `.github/workflows/publish.yml`（停用 npm 发布）、`harness.config.mjs`（doctor 指向 compose）
9. 文档：RFC-0005 §5 适配说明、README、CHANGELOG

### C2 关键实现约定

1. **零依赖镜像**：不 `npm ci`（引擎无运行时依赖），只 COPY `bin/ presets/ templates/ rules/ package.json`；`node:24-alpine`（`node:sqlite` 免 flag；22 需 `--experimental-sqlite`）。
2. **非 root**：`USER node`；`/data`、`/logs` 预创建并 chown。
3. **健康检查**：容器内用 `node -e fetch(...)`（不装 curl）；路径 `/healthz` 三处一致（Dockerfile / compose / nginx）。
4. **Key 强制**：`--http` 模式下 `HARNESS_API_KEY` 缺失 → 退出码非 0（避免"起来了但全 503"的半开状态）。
5. **回滚**：`activate.sh` 在 `compose up` 前把当前 tag 写入 `.env.tag.prev`；探活失败即用 prev 重新 up 并以非 0 退出。
6. **保留策略**：`activate.sh` 只保留最近 3 个 `harness-mcp` 镜像 tag（`docker image prune` 按标签过滤，不动其他项目镜像）。
7. **配置来源**：服务器上的 compose/nginx 均来自本仓 `deploy/`（每次发布上传覆盖），不现场手改。

### C3 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| 镜像体积/依赖缺失导致容器起不来 | 本机**真实构建 + 真实运行 + 容器内 /healthz 实测**（AC-007） | 保留上一 tag，`compose up -d` 指定 prev |
| 服务器磁盘不足 | `activate.sh` 预检 `df -h`；产物与镜像各留 3 份 | 删除旧 tag 后重试 |
| 端口/路径与 pallastrade 冲突 | 仅 `127.0.0.1:3110` + 独立网络/目录/vhost/证书 | 停 `harness-mcp` 栈（不影响对方） |
| 停 npm 发布影响既有使用者 | CHANGELOG + README 明示；已发布版本不受影响 | 恢复工作流（保留 git 历史） |
| 部署脚本语法/逻辑错误 | `bash -n` + 契约测试（回滚/保留份数/路径一致性） | 使用上一版 `deploy/`（随产物保留） |
