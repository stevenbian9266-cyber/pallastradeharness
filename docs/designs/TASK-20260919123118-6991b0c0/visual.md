# 视觉设计 — TASK-20260919123118-6991b0c0（harness 托管 MCP 本地构建与离线部署）

> 无图形界面。本节的"视觉" = **部署资产的文件与输出形态**（命名、目录、行文），目标是让运维**一眼认路**。

## 1. 目录视觉（服务器/仓库一致）

```text
deploy/                            # 仓库侧（版本化，随产物上传）
├── Dockerfile                     # 镜像定义
├── docker-compose.mcp.yml         # 生产栈（镜像 tag 变量）
├── .env.mcp.example               # 环境变量模板（真实值不入库）
├── build-local.ps1                # 本机构建（Windows）
├── publish-local.ps1              # 本地上传 + 远端激活
├── activate.sh                    # 服务器侧激活/回滚
├── nginx/
│   ├── mcp-ratelimit.conf         # 独立限流 zone
│   └── mcp.pallastrade.cn.conf    # vhost
└── README.md                      # Runbook
```

服务器侧（与方案 §5.2 对齐，去掉 `repo/` 克隆树）：

```text
/opt/harness-mcp/
├── deploy/     # 随每次发布覆盖（版本化来源 = 本仓 deploy/）
├── dist/       # 产物 tar.gz + manifest.json（保留最近 3 个）
├── data/       # harness-cloud.db
├── logs/
└── backups/
```

## 2. 命名视觉

| 对象 | 命名 | 例 |
|---|---|---|
| 镜像 tag | `<version>-<short-sha>` | `harness-mcp:1.10.0-5356d3d` |
| 产物文件 | `harness-mcp-<version>-<short-sha>.tar.gz` | `harness-mcp-1.10.0-5356d3d.tar.gz` |
| 清单 | `manifest.json`（同目录，含 sha256/digest/git sha/时间） | — |
| 环境文件 | `.env.mcp`（600，人工维护）/ `.env.tag`（脚本写）/ `.env.tag.prev`（回滚点） | — |
| 容器/网络 | `harness-mcp-app` / `harness-mcp-net` | 与 pallastrade 栈不重名 |

## 3. 输出行文规范

- 每步一行、前缀 `✅`/`❌`、关键值在同一行（tag、端口、路径、耗时）。
- 不使用 ANSI 颜色、不输出 Key 值；文件/目录路径一律绝对路径（服务器侧）。
- 脚本对"将要做什么"先打印一行（如 `→ building harness-mcp:1.10.0-5356d3d from deploy/Dockerfile`），再执行。

## 4. 与既有资产的一致性

- Runbook 采用与 `docs/rfc/0005` §5.3 相同的 **Step 0–12** 表格骨架（便于与方案对照差异）。
- 配置沿用"版本化于仓库 + 服务器只做 cp/ln、不现场手改"的既有模式。

## 5. 验收相关性

AC-004/AC-005/AC-006 断言的是**文件内容形态**（键名、路径、tag 变量、保留份数、健康路径），本节即这些形态的约定来源。下游任务如需变更形态，应先改本节。
