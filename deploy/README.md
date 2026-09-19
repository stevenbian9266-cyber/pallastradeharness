# deploy/ — harness 托管 MCP 服务：本地构建与离线部署

> 目标服务：**mcp.pallastrade.cn**（阿里云 ECS 上的独立栈，与 pallastrade 零耦合）
> 交付形态：**本机构建镜像 → 离线产物（docker save）→ 服务器 load 激活**（服务器**不做构建**、不依赖 GitHub、不依赖 registry）
> 依据：`docs/rfc/0005-hosted-service.md` §5 + 附录 A/B/C（本目录是其**现状适配版**，差异见文末）

---

## 0. 一页速查

```powershell
# ① 本机构建（产出 artifacts/dist/harness-mcp-<version>-<sha>.tar.gz + manifest.json）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/build-local.ps1      # Windows PowerShell 5.1
pwsh deploy/build-local.ps1                                                     # PowerShell 7+

# ② 上传 + 远端激活（自动探活；失败自动回滚上一 tag）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/publish-local.ps1 -Server <ECS_IP> -SshKey $HOME\.ssh\harness_mcp
# 追加 -PublicSmoke 做公网冒烟（https://mcp.pallastrade.cn/healthz）
```

服务器侧只需存在 `/opt/harness-mcp/{deploy,dist,data,logs,backups}`；**首次**需要人工做三件事：DNS、证书、`deploy/.env.mcp`（含 `HARNESS_API_KEY`）。

---

## 1. 隔离矩阵（与 pallastrade 零耦合）

| 维度 | pallastrade | harness-mcp | 隔离手段 |
|---|---|---|---|
| 目录 | `/opt/pallastrade/` | `/opt/harness-mcp/` | 独立树 |
| Compose 项目 | `pallastrade-dev` | `harness-mcp` | `name:` + 容器名 `harness-mcp-app` |
| 网络 | 默认栈网络 | `harness-mcp-net` | 专属网络 |
| 端口 | 3102 / 3103 | `127.0.0.1:3110` | 仅本机监听，公网走 nginx |
| nginx | `sites-enabled/dev.pallastrade.cn` | `sites-enabled/mcp.pallastrade.cn` | 独立文件 |
| 限流 zone | 无 | `/etc/nginx/conf.d/mcp-ratelimit.conf` | 独立文件（zone 需 http context） |
| 证书 | `live/pallastrade.cn` | `live/mcp.pallastrade.cn` | certbot 独立签发 |
| 资源 | 现有负载 | `mem_limit 512m` / `cpus 0.75` | 硬上限 |
| 日志 | docker logs | json-file 10m×3 + `logs/` | 独立轮转 |
| 交付 | GitHub CI → ghcr → pull | **本地构建 → scp → docker load** | 本目录脚本 |

## 2. 服务器目录

```text
/opt/harness-mcp/
├── deploy/                     # 随每次发布覆盖（来源=本仓 deploy/）
│   ├── docker-compose.mcp.yml
│   ├── activate.sh
│   ├── .env.mcp                # 600；人工写一次（含 HARNESS_API_KEY）
│   ├── .env.tag                # activate.sh 写当前 tag（回滚点 ← .env.tag.prev）
│   └── nginx/{mcp-ratelimit.conf,mcp.pallastrade.cn.conf}
├── dist/                       # 产物 tar.gz + manifest.json（保留最近 3 个）
├── data/harness-cloud.db       # SQLite（bind mount 进容器 /data）
├── logs/
└── backups/                    # db-YYYYMMDD.sqlite
```

## 3. 首次上线 Runbook（Step 0–10）

| Step | 操作 | 命令要点 | 预期 / 失败处理 |
|---|---|---|---|
| 0 | 预检 | `df -h`（≥5G）、`free -m`、`docker system df` | 不足先 `docker image prune -f; docker builder prune -f` |
| 1 | DNS | 阿里云：`mcp` A → `<ECS_PUBLIC_IP>`；放行 80/443 | `nslookup mcp.pallastrade.cn` 成功 |
| 2 | 目录 | `mkdir -p /opt/harness-mcp/{deploy/nginx,dist,data,logs,backups}` | 由 `publish-local.ps1` 自动创建 |
| 3 | 环境变量 | 上传后 `cp deploy/.env.mcp.example deploy/.env.mcp`，填 `HARNESS_API_KEY`（`openssl rand -hex 32`），`chmod 600` | 缺 Key → 容器启动即失败（设计如此） |
| 4 | 证书 | `certbot certonly --nginx -d mcp.pallastrade.cn` | 生成 `live/mcp.pallastrade.cn/`；**不动现有证书** |
| 5 | nginx | `cp deploy/nginx/mcp-ratelimit.conf /etc/nginx/conf.d/`；vhost `cp` 到 `sites-available/` + `ln -s` → `nginx -t` → `systemctl reload nginx` | `nginx -t` 失败即**不 reload**（保留旧配置） |
| 6 | 发布 | 本机 `publish-local.ps1 -Server <ip>` | 远端 `✅ app healthy`；失败自动回滚 |
| 7 | 本机探活 | `curl -fsS --noproxy '*' http://127.0.0.1:3110/healthz` | `{"ok":true,"runtime":"cloud","strictGovernance":true}` |
| 8 | 公网冒烟 | `curl -fsS https://mcp.pallastrade.cn/healthz`；带 Key 的 `initialize` POST | 200 + `serverInfo`；无 Key → 401 |
| 9 | 备份 | cron 03:30 `sqlite3 data/harness-cloud.db ".backup backups/db-$(date +%F).sqlite"`；保留 7+1 | `backups/` 出现当日文件 |
| 10 | 监控 | 云监控探 `https://mcp.pallastrade.cn/healthz` + 磁盘/内存告警 | 触发一次测试告警 |

> 与方案 §5.3 的差异：**取消** Step 2 的 `git clone`（deploy key）与 Step 9 的 `*/5 pull-deploy` cron——本机推送模式不需要服务器持有仓库。

## 4. 日常发版与回滚

```text
本机：build-local.ps1 → publish-local.ps1 -Server <ip>
远端：docker load → .env.tag 更新（旧值 → .env.tag.prev）→ compose up -d → /healthz 探活（30×2s）
      成功：保留最近 3 个镜像；失败：自动回滚 .env.tag.prev 并以非 0 退出
```

手动回滚：`bash /opt/harness-mcp/deploy/activate.sh <上一个 tag> /opt/harness-mcp/dist/harness-mcp-<tag>.tar.gz`

## 5. 与 RFC-0005 附录的差异（本目录按**已实现形态**修正）

| 方案附录（M5 形态） | 本目录实现 | 原因 |
|---|---|---|
| `service/server.mjs` + `docker-compose` 的 `build:` | `bin/mcp-server.mjs --http` + 镜像 tag 插值 | 服务实现在引擎内；服务器不构建 |
| `HARNESS_CLOUD_TOKEN_SALT` / `HARNESS_CLOUD_ADMIN_KEY` | `HARNESS_API_KEY`（单静态 Key） | ADR-0002 D4 决定的当前鉴权形态（多 Key 属 M5） |
| `FROM node:22-alpine` + `npm ci` | `ARG NODE_BASE=node:22-alpine` + `npm ci --omit=dev` + `--experimental-sqlite` | Node 22 需显式开启 `node:sqlite`；基础镜像与 registry 可覆盖（镜像站） |
| `/healthz`（仅此） | `/healthz` + `/readyz` + `/health`（兼容） | 探活路径三处一致（Dockerfile/compose/nginx） |
| `/verify` REST、站点页面 | 未实现 | M4/M5，未开始 |
| `git clone` + `pull-deploy` cron | 本地推送（`publish-local.ps1`） | 用户决策：不再依赖 GitHub 交付 |

## 6. 已知限制 / 后续

1. **镜像携带未使用的依赖**：Cloud 链路经 `bin/mcp.mjs` → `bin/project-brain.mjs` 引入 `glob`（服务实际不用）。理想修法：抽出纯信封模块切断传递依赖；已登记后续任务。
2. **无多租户 Key**：当前单静态 Key（所有客户端共用）；多 Key/配额/站点属 M5（`docs/rfc/0005-hosted-service.md` §9 开放决策）。
3. **无 CI 镜像校验**：镜像由本机构建，仓库 CI 只跑引擎测试与部署契约测试（`bin/deploy-contract.test.mjs`）。
