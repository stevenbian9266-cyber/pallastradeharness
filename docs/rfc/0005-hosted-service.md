# RFC-0005: 托管服务详细方案（Harness Cloud / mcp.pallastrade.cn）

> 状态：draft v2（详细设计，待评审）
> 日期：2026-09-19（v1 2026-09-19 初版，v2 细化为可执行设计）
> 关联：RFC-0004（MCP 接入）、RFC-0001（威胁模型）、`docs/mcp.md`
> 商业决策（用户确认）：闭源方向 + 卖服务；客群=个人开发者/小团队；长期自运营；域名 `mcp.pallastrade.cn`；服务器复用现有 ECS 且与 pallastrade **完全隔离**；仓库暂保持公开
> 脱敏约定：**公网 IP、密钥、服务器口令等敏感值一律不入库**，用 `<ECS_PUBLIC_IP>` 等占位；真实值存放于私有运维笔记

## 阅读指引

| 你想做什么 | 看哪里 |
|---|---|
| 理解产品与定价 | §2 + §9 |
| 照着部署上线 | §5 + 附录 A/B/C/G |
| 开发服务端 | §3 + §4 + 附录 D |
| 安全评审 | §6 |
| 日常运维 | §7 |
| 排期与验收 | §8 |

## 目录

- [1. 决策与范围](#1-决策与范围)
- [2. 产品细化](#2-产品细化)
- [3. 架构与协议细化](#3-架构与协议细化)
- [4. 数据模型](#4-数据模型)
- [5. 部署方案（Runbook）](#5-部署方案runbook)
- [6. 安全细化](#6-安全细化)
- [7. 运维手册骨架](#7-运维手册骨架)
- [8. 实施计划（任务级 WBS）](#8-实施计划任务级-wbs)
- [9. 开放决策](#9-开放决策)
- [附录 A：docker-compose.mcp.yml 全文](#附录-adocker-composemcpyml-全文)
- [附录 B：nginx 配置全文（含独立限流 zone）](#附录-bnginx-配置全文含独立限流-zone)
- [附录 C：.env.mcp.example 与 Dockerfile 全文](#附录-cenvmcpexample-与-dockerfile-全文)
- [附录 D：云端工具 JSON Schema（v0）](#附录-d云端工具-json-schema-v0)
- [附录 E：用户 CI 示例（GitHub Actions）](#附录-e用户-ci-示例github-actions)
- [附录 F：隐私政策 / 服务条款大纲](#附录-f隐私政策--服务条款大纲)
- [附录 G：上线检查清单](#附录-g上线检查清单)

---

## 1. 决策与范围

### 1.1 已确认决策（不可回退项）

| # | 决策 | 影响 |
|---|---|---|
| 1 | 源码闭源方向，卖服务 | 云端增值代码不进入公开仓（见 §9 D1） |
| 2 | 客群 = 个人开发者 / 小团队 | 不做企业私有化、不做 SSO/RBAC 首版 |
| 3 | 长期自运营服务器 | 必须有运维手册、监控、备份、回滚（§5/§7） |
| 4 | 域名 `mcp.pallastrade.cn` | DNS/证书/nginx 独立配置（§5） |
| 5 | 与 pallastrade 完全隔离 | 目录/网络/端口/配置/证书全独立（§5.1 隔离矩阵） |
| 6 | 仓库暂保持公开 | 本 RFC 不含敏感值；云端代码归属见 §9 D1 |

### 1.2 交付物清单（本方案要求落地的全部产物）

| # | 产物 | 位置 | 里程碑 |
|---|---|---|---|
| 1 | HTTP 传输层（本机可用） | `bin/mcp-http.mjs` + 测试 | M1 |
| 2 | 云端服务骨架（容器化） | 服务端目录结构见 §5.2 | M2 |
| 3 | 部署包（compose/nginx/env/Dockerfile） | 附录 A/B/C | M2 |
| 4 | 租户与 Key 管理 | 数据层 + CLI | M3 |
| 5 | 配额与限流 | 应用层 + nginx | M3 |
| 6 | `/verify` CI 接口 + 用户示例 | 服务端 + 附录 E | M4 |
| 7 | 落地页文案 + 隐私政策 + 发 Key SOP | 站点 + 文档 | M5 |
| 8 | 运维手册（监控/备份/演练/预案） | §7 成文 + 脚本 | M2 起持续 |

### 1.3 非目标

- 企业私有化部署、SSO、审计导出（后续立项）；
- 在线支付与自动计费（首版人工发 Key）；
- 本地 git 强绑定能力（ChangeSnapshot/lefthook）——明确为本地版专属；
- 多区域/高可用集群（单机 + 备份，用户破千再评估）。

### 1.4 术语表

| 术语 | 含义 |
|---|---|
| 租户（tenant） | 一个用户账号，拥有独立的任务/证据数据空间 |
| Key | API 凭据，形如 `hk_live_<32hex>`；服务端只存哈希 |
| 会话（session） | MCP Streamable HTTP 的 `Mcp-Session-Id`，一次连接生命周期 |
| 调用（call） | 一次 `tools/call`；即计费与配额单位（initialize/tools/list 不计） |
| 云端工具（cloud tool） | 可在云端独立判定的工具（§3.4） |

---

## 2. 产品细化

### 2.1 用户旅程（7 步，含每步页面/文案/结果）

| 步 | 用户动作 | 他看到什么 | 结果 |
|---|---|---|---|
| 1 | 打开 `https://mcp.pallastrade.cn` | 首屏一句话 + 三步图 + 免费档按钮 | 理解"填两行就能用" |
| 2 | 点"领取 Key" | 表单：邮箱 + 用途一句话 | 人工审核后发 Key（M5 前） |
| 3 | 收到 Key 邮件 | `hk_live_...`（仅展示一次）+ 接入指引链接 | 拿到凭据 |
| 4 | 按指引填 IDE 配置 | 5 个客户端 Tab 的复制框（URL+Key） | 配置完成 |
| 5 | 对 AI 说"帮我按治理流程做个功能" | Agent 调 `gate_create`，返回检查清单 | 体验第一次治理 |
| 6 | 开发中 | Agent 调 `standards_check` 审查 diff，返回 findings | 规则生效 |
| 7 | 收尾 | Agent 调 `record_evidence` + `finish_task` | 任务闭环 |

### 2.2 Key 形态与生命周期

| 项 | 规格 |
|---|---|
| 格式 | `hk_live_` + 32 hex（生产）；`hk_test_`（测试子域用，M4+） |
| 展示 | 创建时仅展示一次；服务端存 `sha256(key + salt)` |
| 标识 | 列表页只显示前 12 位（`hk_live_ab12…`） |
| 吊销 | 控制台/CLI 一键吊销，立即生效（鉴权查询实时校验） |
| 轮换 | 支持同时存在 2 个有效 Key（新旧过渡），旧 Key 手动吊销 |
| 归属 | 每个 Key 绑定一个租户；可加 label（如 "work-laptop"） |

### 2.3 五个客户端接入配置（HTTP 版全文）

**VS Code**（`.vscode/mcp.json` 或用户级）：

```json
{
  "servers": {
    "pallastrade-harness": {
      "type": "http",
      "url": "https://mcp.pallastrade.cn/mcp",
      "headers": { "Authorization": "Bearer hk_live_xxxxxxxxxxxxxxxx" }
    }
  }
}
```

**Cursor**（`.cursor/mcp.json` 或 Settings→MCP）：

```json
{
  "mcpServers": {
    "pallastrade-harness": {
      "url": "https://mcp.pallastrade.cn/mcp",
      "headers": { "Authorization": "Bearer hk_live_xxxxxxxxxxxxxxxx" }
    }
  }
}
```

**Claude Code**（项目 `.mcp.json`）：

```json
{
  "mcpServers": {
    "pallastrade-harness": {
      "type": "http",
      "url": "https://mcp.pallastrade.cn/mcp",
      "headers": { "Authorization": "Bearer hk_live_xxxxxxxxxxxxxxxx" }
    }
  }
}
```

**Claude Desktop**（用户级 `claude_desktop_config.json`，结构同 Cursor）。

**Codex CLI**（用户级 `config.toml`；键名以官方文档为准）：

```toml
[mcp_servers.pallastrade-harness]
url = "https://mcp.pallastrade.cn/mcp"
http_headers = { Authorization = "Bearer hk_live_xxxxxxxxxxxxxxxx" }
```

> 落地页为每个客户端提供 **复制按钮**（连同用户自己的 Key 渲染），避免手抄错误。

### 2.4 用户可见错误文案一览

| HTTP 状态 / 场景 | 用户看到的话 | 用户该做什么 |
|---|---|---|
| 401 | "Key 无效或已被吊销" | 检查是否复制完整/去控制台确认 |
| 403 | "账号已停用，请联系支持" | 联系客服 |
| 429（秒级） | "请求太快，请 2 秒后重试" | 等待重试（Agent 自动） |
| 429（月配额） | "本月免费额度已用完，升级后不限次" | 升级提示链接 |
| 413 | "单次请求内容过大（>256KB），请拆分为更小的 diff" | 拆分调用 |
| 503 | "服务维护中，预计 xx:xx 恢复" | 稍后重试 |
| 工具级 `EVIDENCE_REQUIRED` | "任务尚缺以下证据：test / review…" | 按 reasons 补齐 |
| 工具级 `HUMAN_CONFIRMATION_REQUIRED` | "该项需人工确认，请到控制台操作" | 人工点击确认 |

### 2.5 档位与配额（首版）

| 档位 | 价格 | 配额 | 限制 | 目标 |
|---|---|---|---|---|
| 免费 | ¥0 | 200 调用/月、1 项目、2 rps | 无 `/verify` | 体验转化 |
| 个人版 | ¥29/月 | 不限次、3 项目、5 rps | 无 `/verify` | 核心收入 |
| 小团队 | ¥199/月 | 不限次、10 项目、10 rps、5 Key | 含 `/verify` | 第二增长点 |

计量口径：仅 `tools/call` 计数；`initialize` / `tools/list` / 探活免费；跨月按 UTC+8 自然月归零。

### 2.6 站点结构（首版 5 个页面）

| 页面 | 路径 | 内容大纲 |
|---|---|---|
| 首页 | `/` | 一句话价值 + 三步图 + 免费按钮 + FAQ 5 条 |
| 接入文档 | `/docs` | `docs/mcp.md` 的托管版（URL+Key 替换本地安装段） |
| 领取/管理 Key | `/console`（M5 先静态表单） | 表单 + Key 列表（前 12 位）+ 吊销按钮 |
| 定价 | `/pricing` | 三档对照表 + 常见问题（不退款场景等） |
| 法律 | `/privacy`、`/terms` | 附录 F 大纲成文 |

### 2.7 人工发 Key 运营 SOP（M5 前）

1. 收到表单 → 核对邮箱真实性（回信验证）；
2. 服务端执行：`harness-cloud key issue --tenant <email> --label free-signup --plan free`；
3. 邮件模板发送（含 Key + 三步接入指引 + 支持邮箱）；
4. 登记到私有台账（日期/邮箱/Key 前缀/来源），每月对账用量与转化；
5. 滥用特征（多账号刷免费额度）→ 拉黑邮箱域并记录。

---

## 3. 架构与协议细化

### 3.1 调用时序（IDE 与 CI 两条主链路）

```mermaid
sequenceDiagram
    participant A as Agent (IDE)
    participant N as nginx (mcp.pallastrade.cn)
    participant S as harness-cloud
    participant DB as SQLite
    A->>N: POST /mcp (initialize, Bearer Key)
    N->>S: proxy (limit_req 后)
    S->>DB: 校验 Key 哈希+租户+配额
    S-->>A: 200 {serverInfo} + Mcp-Session-Id
    A->>N: POST /mcp (tools/call, 同一 Session)
    S->>DB: 业务处理 + usage_counters+1 + audit_logs
    S-->>A: tool result
    Note over A,DB: CI 链路
    participant C as GitHub Actions
    C->>N: POST /verify (task_id, commit, CI 产物)
    S->>DB: 校验门禁/证据链
    S-->>C: {pass:true|false, reasons[]}
```

### 3.2 MCP Streamable HTTP 实现约定（v0）

| 项 | 约定 |
|---|---|
| 端点 | `POST /mcp`（JSON-RPC 单条）；`GET /mcp` v0 返回 405（不支持 SSE 推送，客户端回退请求-响应）；`DELETE /mcp` 结束会话 |
| 会话 | `initialize` 响应头下发 `Mcp-Session-Id`（UUIDv4）；后续请求必须携带；无效/缺失 → `400` + `{"code":"SESSION_REQUIRED"}` |
| 协议版本 | 请求头 `MCP-Protocol-Version: 2025-03-26` 必须匹配，否则 400 |
| Content-Type | 请求 `application/json`；响应 `application/json`（v0 不做 SSE 内联流） |
| 鉴权 | `Authorization: Bearer hk_...`（所有方法必须）；失败 401 |
| 体积 | 请求体 ≤ 256KB（应用层校验 + nginx `client_max_body_size 1m` 缓冲）；超限 413 |
| 超时 | 单请求处理 ≤ 30s；nginx `proxy_read_timeout 60s`（/verify 120s） |
| 并发 | 单会话串行（v0）；不同会话/租户并发 |
| 探活 | `GET /healthz`（无鉴权，仅回 `{ok:true,version}`） |
| 探活（带鉴权） | `GET /readyz`（校验 DB 可读写） |

### 3.3 HTTP 状态码与错误体映射

| HTTP | 场景 | 响应体 |
|---|---|---|
| 200 | 正常 JSON-RPC 结果 | `{"jsonrpc":"2.0","id":n,"result":…}` |
| 400 | 协议/会话头缺失、JSON 解析失败 | `{"code":"BAD_REQUEST","message":…}` |
| 401 | Key 缺失/无效/吊销 | `{"code":"UNAUTHORIZED"}` |
| 403 | 租户停用 | `{"code":"TENANT_DISABLED"}` |
| 404 | 未知路径 | 文本 404 |
| 405 | GET /mcp（v0） | `{"code":"SSE_NOT_SUPPORTED"}` |
| 413 | 请求体超限 | `{"code":"PAYLOAD_TOO_LARGE"}` |
| 429 | 秒级限流 / 月配额 | `{"code":"RATE_LIMITED"｜"QUOTA_EXCEEDED","retryAfter":2}` + `Retry-After` 头 |
| 500 | 未捕获异常（已记 audit） | `{"code":"INTERNAL","requestId":"…"}` |
| 503 | 维护模式（env 开关） | `{"code":"MAINTENANCE","until":"…"}` |

工具级业务失败仍是 **JSON-RPC 200 + `isError:true`**（与本地版完全一致，客户端无需区分来源）。

### 3.4 云端工具 v0（6 个）——完整规格见附录 D

| 工具 | 一句话 | 租户数据 | 关键校验 |
|---|---|---|---|
| `gate_create` | 创建分阶段门禁 | tasks + gate_checks | 任务描述必填；类型自动识别（复用本地 `detectTaskType`） |
| `gate_status` | 读取门禁状态 | tasks + gate_checks | task_id 必须属于本租户 |
| `gate_clear` | 清除单项 | gate_checks | human-WAIT 禁裸清（沿用 D5）；仅本租户 |
| `standards_check` | 审查 diff 返回 findings | 无（纯计算） | diff ≤ 256KB；规则库版本随响应返回 |
| `record_evidence` | 记录证据 | evidences + usage | 类型枚举校验（复用 `EVIDENCE_TYPES`） |
| `finish_task` | 收口（强制校验） | tasks + evidences | 必备证据齐备才通过；否则 `EVIDENCE_REQUIRED` |

设计原则：**上下文当参数**（diff/文本由 Agent 传入）；**不读用户磁盘**；**与本地版工具同名同语义**，迁移零学习成本。

### 3.5 `/verify`（REST，M4）

请求：

```json
POST /verify
Authorization: Bearer hk_live_xxx
{
  "task_id": "TASK-…",
  "commit_sha": "abc1234",
  "ci": { "tests": "pass", "build": "pass", "coverage": 82.4 },
  "artifacts": [ { "type": "test", "summary": "vitest 214 passed", "hash": "sha256:…" } ]
}
```

响应：

```json
{ "pass": false, "reasons": ["证据缺 knowledge 类型", "gate 剩余 2 项未清"],
  "required_actions": ["record_evidence(type=knowledge)", "gate_clear(check_id=design-confirmed)"] }
```

### 3.6 限流与配额算法

- **秒级**：nginx `limit_req_zone $binary_remote_addr zone=mcp_rl:10m rate=2r/s;` + 应用层 per-key 令牌桶（rate/突发见档位表）；超限 429。
- **月配额**：`usage_counters(tenant_id, period, calls)`；每次 `tools/call` 事务内 +1（同事务写 audit）；跨月自动新行。
- **口径**：免费档 200/月；个人/团队不限（但保留公平使用条款 10k/月软上限告警）。
- **幂等**：同一 `(session, id)` 重放不计费（v0 简化为按请求计数，文档注明）。

---

## 4. 数据模型

### 4.1 表结构（SQLite，字段类型兼容 Postgres 迁移）

```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,            -- uuid
  email TEXT NOT NULL UNIQUE,     -- 唯一登录标识
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',  -- active|suspended
  created_at TEXT NOT NULL
);

CREATE TABLE api_keys (
  key_id TEXT PRIMARY KEY,        -- 短 id，用于管理
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  key_hash TEXT NOT NULL,         -- sha256(key+salt)
  prefix TEXT NOT NULL,           -- 展示用前 12 位
  label TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
);
CREATE INDEX idx_keys_tenant ON api_keys(tenant_id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
  title TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'standard',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, meta_json TEXT
);
CREATE INDEX idx_tasks_tenant ON tasks(tenant_id, created_at DESC);

CREATE TABLE gate_checks (
  task_id TEXT NOT NULL REFERENCES tasks(id), check_id TEXT NOT NULL,
  phase TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  note TEXT, cleared_at TEXT,
  PRIMARY KEY (task_id, check_id)
);

CREATE TABLE evidences (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
  type TEXT NOT NULL, summary TEXT NOT NULL,
  payload_hash TEXT, source TEXT NOT NULL DEFAULT 'mcp', created_at TEXT NOT NULL
);
CREATE INDEX idx_evid_task ON evidences(task_id);

CREATE TABLE usage_counters (
  tenant_id TEXT NOT NULL, period TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, period)
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT, key_id TEXT,
  action TEXT NOT NULL, tool TEXT, ip_hash TEXT, status INTEGER, latency_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_tenant_time ON audit_logs(tenant_id, created_at DESC);
```

### 4.2 保留策略

| 表 | 保留 | 删除机制 |
|---|---|---|
| tasks / gate_checks / evidences | 永久（租户可删账号时整体清除） | 删除租户 API |
| usage_counters | 24 个月 | 定时任务 |
| audit_logs | 180 天 | 每日任务删除过期行 |

### 4.3 备份与恢复

- 每日 03:30 `sqlite3 data/harness-cloud.db ".backup 'backups/db-YYYYMMDD.sqlite'"`，保留 7 份+每月 1 份；
- 恢复演练（季度）：停服务 → 替换 db → 启动 → `/readyz` + 抽查租户；
- 备份文件权限 600，且随磁盘监控（体积告警阈值 500MB）。

---

## 5. 部署方案（Runbook）

### 5.1 隔离矩阵（与 pallastrade 零耦合的完整清单）

| 维度 | pallastrade | harness-cloud | 隔离手段 |
|---|---|---|---|
| 目录 | `/opt/pallastrade/` | `/opt/harness-mcp/` | 独立树；互不读写 |
| Compose 项目 | `pallastrade-dev` | `harness-mcp` | `name:` 区分；容器名前缀 `harness-mcp-*` |
| Docker 网络 | 默认栈网络 | `harness-mcp-net`（专属） | 不 join 对方网络 |
| 端口 | 3102 / 3103 | `127.0.0.1:3110` | 仅本机监听；公网走 nginx |
| nginx | `sites-enabled/dev.pallastrade.cn` | `sites-enabled/mcp.pallastrade.cn` | 独立文件；互不修改 |
| 限流 zone | 无 | `/etc/nginx/conf.d/mcp-ratelimit.conf` | 独立文件提供 `limit_req_zone` |
| 证书 | `live/pallastrade.cn` | `live/mcp.pallastrade.cn` | certbot 独立签发；互不续期干预 |
| 部署机制 | pull-deploy + 状态文件 | `pull-deploy-harness.sh` + `/opt/harness-mcp/.pull-deploy-state` | 独立 lock `/tmp/pull-deploy-harness.lock` |
| 资源 | 现有负载 | `mem_limit 512m` / `cpus 0.75` | 硬上限；不挤占对方 |
| 日志 | docker logs | `logs/` 挂载 + json-file(10m×3) | 独立轮转 |
| 备份 | 各自数据卷 | `backups/`（db 7+1 份） | 独立目录 |
| 监控告警 | （现有） | 复用云监控 + 探活 cron | 新增独立探活 |

### 5.2 服务器目录结构

```text
/opt/harness-mcp/
├── repo/                     # git clone（deploy key 只读）
│   ├── deploy/               # docker-compose.mcp.yml / .env.mcp / nginx/mcp.pallastrade.cn.conf
│   └── service/              # 云端服务代码（M2 起；M3 后的私有增值层见 §9 D1）
├── data/
│   └── harness-cloud.db      # SQLite（bind mount 进容器）
├── logs/                     # 应用日志（轮转）
├── backups/                  # db-YYYYMMDD.sqlite
└── .pull-deploy-state        # 部署状态（哈希比对）
```

### 5.3 上线 Runbook（Step 0–12，逐步命令 + 预期 + 失败处理）

| Step | 操作 | 命令要点 | 预期/失败处理 |
|---|---|---|---|
| 0 | 预检 | `df -h`（剩余 ≥5G）；`free -m`；`docker system df` | 不满足则先清理 `docker builder prune -f`，否则停止 |
| 1 | DNS | 阿里云 DNS：`mcp` A → `<ECS_PUBLIC_IP>` | `nslookup mcp.pallastrade.cn` 解析成功；80/443 已放行 |
| 2 | 目录与代码 | `mkdir -p /opt/harness-mcp/{data,logs,backups}`；`git clone <repo> repo`（deploy key） | clone 成功；`ls repo/deploy` 见 compose/nginx |
| 3 | 环境变量 | 写 `deploy/.env.mcp`（附录 C 模板）；`chmod 600` | 文件不入库；缺项则服务启动报错退出 |
| 4 | 证书 | `certbot certonly --nginx -d mcp.pallastrade.cn` | `live/mcp.pallastrade.cn/fullchain.pem` 存在；**不动现有证书** |
| 5 | 构建启动 | `cd repo/deploy && docker compose -f docker-compose.mcp.yml --env-file .env.mcp up -d --build` | `docker ps` 见 `harness-mcp-app-1` healthy |
| 6 | 本机探活 | `curl -s localhost:3110/healthz` | `{"ok":true,...}`；失败→`docker logs harness-mcp-app-1` |
| 7 | nginx 同步 | 将附录 B 内容放入 repo 配置；`cp → sites-available → ln -s → nginx -t`（失败回滚）→ `systemctl reload nginx` | `nginx -t` 通过；失败自动回滚保留旧配置 |
| 8 | 公网冒烟 | `curl -sS https://mcp.pallastrade.cn/healthz` + 带 Key 的 `initialize` POST（附录 G 脚本） | 200 + `serverInfo`；401 场景返回 401 |
| 9 | 部署自动化（可选） | 配 cron `*/5`：`bash pull-deploy-harness.sh`（独立 lock/state） | 手动跑一次通过后再挂 cron |
| 10 | 备份与轮转 | cron 03:30 备份；`logrotate`/compose 日志上限 | `backups/` 出现当日文件 |
| 11 | 监控 | 云监控对准 `/healthz` + 磁盘/内存告警（阈值见 §7.1） | 触发一次测试告警 |
| 12 | 记录 | 私有运维笔记记录：IP、证书路径、cron、密钥存放 | 公开仓不出现敏感值 |

### 5.4 配置全文

- Compose：附录 A；nginx：附录 B；`.env.mcp.example` + Dockerfile：附录 C。
- 注意：所有配置文件随 `repo/` 版本化；服务器上只做 `cp/ln`，**不现场手改**（沿用 pallastrade 已验证的"版本化 + 原子同步"模式）。

### 5.5 变更管理与回滚

| 类型 | 流程 | 回滚 |
|---|---|---|
| 应用代码 | push → pull-deploy → 构建新镜像（tag 保留 3 个） | `docker compose up -d` 指定上一 tag |
| 配置（compose/env） | 随 repo 同步 | `git revert` 配置提交后重跑 |
| nginx | `nginx -t` 原子替换 | 自动回滚 + 手动 `cp` 上一版 |
| 数据 | 迁移脚本带 `--dry-run` | 恢复最近备份 |

### 5.6 容量与成本

| 用户规模 | 月调用量估 | 资源 | 成本/月 |
|---|---|---|---|
| <100 | <5 万 | 现 ECS 余量（512m 限额内） | ≈¥0 增量 |
| 100–1000 | 50–500 万 | 或需升配 2C/8G 或加 1 台 2C/4G | ¥100–300 |
| >1000 | >500 万 | 独立 2C/4G + 定期 PG 迁移 | ¥300–600 |

### 5.7 交付形态更新（2026-09-19 已实施，替代 §5.2 的 `repo/` 克隆与 §5.3 的 pull-deploy）

**变更**：用户决策不再依赖 GitHub 交付（不再开源发布；仓库暂留 GitHub 仅作代码备份，npm 发布链路已停用）：

| 原方案 | 现方案（已落地于仓库 `deploy/`） |
|---|---|
| §5.2 服务器 `git clone`（deploy key） | 服务器**不持仓**；`deploy/` 目录随每次发布由本机上传覆盖 |
| §5.3 Step 5 / §5.5 服务器 `docker compose build` | **本地构建**镜像 → `docker save` → `scp` → 服务器 `docker load`（服务器零构建） |
| §5.3 Step 9 `*/5 pull-deploy-harness.sh` cron | 本地 `deploy/publish-local.ps1` 主动推送 + 远端 `activate.sh`（探活失败自动回滚） |
| 附录 A compose `build:` 段 | 改为 `image: harness-mcp:${HARNESS_MCP_TAG}`（tag 即回滚点） |
| 附录 C `HARNESS_CLOUD_*` 键 | `HARNESS_API_KEY`（单静态 Key，ADR-0002 D4 现状）；多 Key 仍属 M5 |

**Runbook 与脚本**：`deploy/README.md`（Step 0–10 本地推送版、隔离矩阵、与附录的逐条差异）。

**回归守护**：`bin/deploy-contract.test.mjs` 把跨文件契约（端口 3110 / 健康路径 / env 键 / tag 变量 / 回滚与保留逻辑）钉死，防再次漂移。

---

## 6. 安全细化

### 6.1 威胁 → 控制 → 验证用例（每条必须可测）

| ID | 威胁 | 控制 | 验证用例（QA 步骤） |
|---|---|---|---|
| T-CLOUD-01 | Key 泄露 | 存哈希；可吊销；限流；`last_used_at` 异常告警 | 吊销后调用→401；连续 10rps→429 |
| T-CLOUD-02 | 租户串扰 | 全表带 `tenant_id`；查询强制注入租户条件 | 租户 A 的 Key 查租户 B 的 task→404 |
| T-CLOUD-03 | 配额滥用/DoS | 请求体 256KB；秒级限流；月配额；软上限告警 | 发送 300KB diff→413；超免费额度→429+文案 |
| T-CLOUD-04 | 注入类攻击 | 入参当纯数据；规则引擎无 eval/无回显执行；输出转义 | 提交含 `<script>`/控制字符的 diff→原样存 findings 无执行 |
| T-CLOUD-05 | 隐私 | 不存 diff 全文（只存 hash+摘要）；隐私政策；删号 API | 删号后 DB 无该租户任何行 |
| T-CLOUD-06 | 证书/DNS | 独立证书；HSTS；cron 续期监控；到期告警 | `curl -I` 见 HSTS；`certbot renew --dry-run` 通过 |
| T-CLOUD-07 | 挤压宿主 | mem/cpu 限额；预检；磁盘阈值；告警 | `docker stats` 长时间 ≤512m；`df` 低于阈值告警触发 |
| T-CLOUD-08 | 供应链 | 最小依赖；镜像固定 base digest；按周 `npm audit` | CI 中 audit job 通过 |

### 6.2 Key 生命周期操作

| 操作 | 命令（示意） | 说明 |
|---|---|---|
| 签发 | `harness-cloud key issue --tenant <email> --plan free --label signup` | 输出 Key 一次 |
| 吊销 | `harness-cloud key revoke --key-id <id>` | 即时生效 |
| 轮换 | issue 新 → 用户切换 → revoke 旧 | 双活窗口 ≤7 天 |
| 泄漏处置 | revoke + 通知 + 查 `audit_logs` 异常 | 30 分钟内完成 |

### 6.3 租户隔离的强制与测试

实现约定：数据访问层统一经 `TenantScopedDb(tenantId)` 包装，禁止直接裸查；所有列表/详情接口在 SQL 层拼接 `tenant_id = ?`。CI 必须包含"隔离测试套件"（10 组交叉访问断言）。

### 6.4 数据保留与隐私

- 保留矩阵见 §4.2；隐私政策大纲见附录 F；
- **删除租户**：一条 API 清除 tasks/gate_checks/evidences/api_keys/usage/audit 关联行（保留去标识化的月度计数用于财务对账）；
- 声明口径：不采集代码全文、不采集命令行输出、不上传本地路径。

### 6.5 nginx 安全指令明细

`limit_req_zone` 独立文件；`ssl_protocols TLSv1.2 TLSv1.3`；HSTS 预加载可选；`server_tokens off`；仅暴露 `/mcp` `/verify` `/healthz` `/readyz` 与静态站；其余 404；`proxy_set_header X-Real-IP`；无 CORS 通配。

---

## 7. 运维手册骨架

### 7.1 监控项与阈值

| 指标 | 来源 | 警告 | 严重 | 动作 |
|---|---|---|---|---|
| `/healthz` 探测 | cron/云监控 1min | 连续 2 次失败 | 连续 5 次 | 重启容器 → 查日志 |
| 内存（容器） | `docker stats` | >400m | >512m(OOM) | 查泄漏；临时升限 |
| 磁盘 `/` | `df -h` | <5G | <2G | 清 builder/备份轮转 |
| 429 比率 | audit 聚合 | >5% | >20% | 排查滥用/攻击 |
| 单 Key 异常 | audit | 突增 5× | 突增 20× | 联系用户/临时封 Key |
| 证书到期 | `certbot certificates` | <20 天 | <7 天 | 手动续期 |

### 7.2 告警渠道

首版：云监控短信/邮件 + 服务端 cron 探活脚本发邮件；升级路径：接入钉钉/飞书机器人。

### 7.3 日常清单

- **每日**：看 `/healthz`、磁盘、429 比率、审计异常；
- **每周**：`npm audit`、备份校验（抽一个库打开验证）、日志体积；
- **每月**：用量对账（台账 vs DB）、`certbot renew --dry-run`、恢复演练（季度做一次全量）。

### 7.4 事件处置预案（5 个场景）

| 场景 | 处置步骤 |
|---|---|
| 容器 OOM | `docker events` 确认 → `docker compose restart app` → 分析 audit 突增来源 → 临时升 `mem_limit` → 排期优化 |
| 磁盘满 | 停止 pull-deploy（删 lock）→ `docker builder prune -f` → 备份轮转清理 → 恢复 cron |
| 证书过期 | `certbot renew --force-renewal` → `nginx -t && reload` → 查续期 cron 是否异常 |
| Key 滥用 | revoke Key → 邮件通知 → 审计回溯 → 拉黑特征 |
| 服务不可用 | `curl /healthz` → 容器状态 → 重启 → 失败则回滚上一镜像 tag → 公告 503 文案 |

### 7.5 升级流程与回滚

发布：push → CI 测试通过 → （人工批准）→ 服务器 pull-deploy → 冒烟（附录 G 脚本）→ 记录版本。
回滚：`docker compose down` → 指定上一镜像 tag `up -d` → 冒烟通过 → 记录。

---

## 8. 实施计划（任务级 WBS）

### 8.1 里程碑拆解（每任务独立验收，均走本仓治理流程）

| 里程碑 | 任务 | 内容 | 验收 |
|---|---|---|---|
| **M1** | T1 | `bin/mcp-http.mjs`：HTTP 传输骨架（POST/会话头/鉴权钩子） | 本机 `curl` 完成 initialize+tools/call e2e |
| | T2 | 会话管理 + 限流中间件（内存令牌桶） | 单测覆盖 429 路径 |
| | T3 | 测试与文档：`mcp-http.test.mjs` + `docs/mcp.md` HTTP 段 | 全量测试通过；文档含本地 HTTP 示例 |
| **M2** | T4 | 云端服务骨架（service/ 目录、健康检查、维护模式开关） | 本地 compose 起服务，`/healthz` `/readyz` 通过 |
| | T5 | 部署包（附录 A/B/C 配置 + pull-deploy-harness.sh + 冒烟脚本） | 服务器按 §5.3 跑通一次，公网冒烟通过 |
| | T6 | 上线演练 + 回滚演练 | 演练记录：改配置→部署→回滚全程 ≤15 分钟 |
| **M3** | T7 | 数据层（§4 DDL + 迁移 + 备份脚本） | 备份/恢复演练通过 |
| | T8 | 租户与 Key 管理 CLI（issue/revoke/list） | 两租户隔离测试 10/10 |
| | T9 | 配额与计量（usage_counters + 429 文案） | 免费额度打满→正确拒绝 |
| **M4** | T10 | `/verify` 接口 + reasons 生成 | 用户示例仓实测：拦截一次、放行一次 |
| | T11 | CI 模板（附录 E）+ 用户文档 | 陌生人照文档 10 分钟接上 |
| **M5** | T12 | 站点 5 页 + Key 自助表单（静态表单即可） | 完整走通"表单→发 Key→接入→调用" |
| | T13 | 隐私政策/服务条款成文（附录 F 扩写） | 法律文本上线 |
| | T14 | 运营 SOP（§2.7）+ 台账模板 | 按 SOP 发出首 10 个 Key |

### 8.2 关键路径

T1 → T4 → T5 → T6（上线）→ T7 → T8/T9（可并行）→ T10 → T12 → T14。
建议节奏：M1+M2 是本轮重点（"能看到 URL 能用"），M3 完成即可发首批试用 Key。

### 8.3 风险登记册

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| ECS 内存不足导致挤压现有 dev | 中 | 高 | 512m 限额 + 预检 + 告警；超限前先升配 |
| 用户不接受代码片段上行 | 中 | 高 | 隐私政策透明 + 免费试用降低决策成本 |
| 公开仓泄露云端实现细节 | 低 | 中 | D1：增值层进私有仓；本 RFC 只留架构 |
| 单机故障 | 低 | 中 | 每日备份 + 15 分钟恢复演练；用户破千上高可用 |
| 免费额度被刷 | 中 | 低 | 邮箱验证 + 月配额 + 人工审核首版 |

---

## 9. 开放决策

| # | 决策 | 建议 | 影响 |
|---|---|---|---|
| D1 | 云端增值层（租户/配额/计费）代码放哪 | **M3 前建独立私有仓** `pallastrade-harness-cloud` | 决定源码保密边界 |
| D2 | 是否为 npm 1.10.0 加弃用提示引流 | 建议加（一句文案，指向托管服务） | 引流入口 |
| D3 | 免费额度 200 次/月 | 先按此执行，按转化数据调整 | 体验与成本平衡 |
| D4 | 测试子域 `mcp-test.pallastrade.cn` | 建议 M4 前建（与生产同栈不同库） | 降低试错风险 |
| D5 | 是否单独 staging 环境 | 建议先用"本地 compose + 测试子域"代替 | 成本 vs 安全 |
| D6 | 支付渠道（个人版收款） | 首版人工；M5 后评估国内聚合支付 | 合规与费率 |

---

## 附录 A：docker-compose.mcp.yml 全文

```yaml
# harness-cloud 生产栈（与 pallastrade 完全隔离；服务器路径 /opt/harness-mcp/repo/deploy）
name: harness-mcp

services:
  app:
    build:
      context: ../service
      dockerfile: Dockerfile
    env_file: .env.mcp
    ports:
      - "127.0.0.1:3110:3110"        # 仅本机监听，公网经 nginx
    volumes:
      - ../data:/data                 # SQLite 数据目录（bind mount，便于备份）
      - ../logs:/logs                 # 应用日志
    mem_limit: 512m
    cpus: 0.75
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3110/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
networks:
  default:
    name: harness-mcp-net            # 专属网络，不与 pallastrade 共享
```

## 附录 B：nginx 配置全文（含独立限流 zone）

```nginx
# /etc/nginx/conf.d/mcp-ratelimit.conf（独立文件，仅供本服务）
limit_req_zone $binary_remote_addr zone=mcp_rl:10m rate=2r/s;
```

```nginx
# /etc/nginx/sites-available/mcp.pallastrade.cn（版本化于 repo/deploy/nginx/）
server {
    listen 80;
    server_name mcp.pallastrade.cn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name mcp.pallastrade.cn;

    ssl_certificate     /etc/letsencrypt/live/mcp.pallastrade.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.pallastrade.cn/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    server_tokens off;
    add_header Strict-Transport-Security "max-age=31536000" always;

    client_max_body_size 1m;         # 应用层仍限 256KB

    location = /healthz { proxy_pass http://127.0.0.1:3110; }
    location = /readyz  { proxy_pass http://127.0.0.1:3110; }

    location = /mcp {
        limit_req zone=mcp_rl burst=20 nodelay;
        proxy_pass http://127.0.0.1:3110;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_read_timeout 60s;
    }

    location = /verify {
        limit_req zone=mcp_rl burst=10 nodelay;
        proxy_pass http://127.0.0.1:3110;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
    }

    location / { return 404; }       # 站点静态页 M5 再挂，与其他项目隔离
}
```

## 附录 C：.env.mcp.example 与 Dockerfile 全文

```bash
# /opt/harness-mcp/repo/deploy/.env.mcp（chmod 600；每行不得入库真实值）
PORT=3110
DATA_DIR=/data
NODE_ENV=production
HARNESS_CLOUD_TOKEN_SALT=<random-64hex>
HARNESS_CLOUD_ADMIN_KEY=<initial-admin-key>
HARNESS_CLOUD_MAINTENANCE=off        # on 时 /mcp /verify 返回 503
```

```dockerfile
# service/Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=3110 DATA_DIR=/data
EXPOSE 3110
USER node
CMD ["node", "server.mjs"]
```

## 附录 D：云端工具 JSON Schema（v0）

`gate_create`（完整示例）：

```json
{
  "name": "gate_create",
  "description": "Create the phased pre-coding gate for a task (hosted).",
  "inputSchema": {
    "type": "object",
    "required": ["task"],
    "additionalProperties": false,
    "properties": {
      "task":   { "type": "string", "maxLength": 200 },
      "type":   { "enum": ["feature", "bugfix", "style", "audit", "research", "docs", "refactor", "security", "test"] },
      "lite":   { "type": "boolean", "default": false }
    }
  }
}
```

`standards_check`（完整示例）：

```json
{
  "name": "standards_check",
  "description": "Run hosted standards/anti-pattern checks against a diff (context as argument).",
  "inputSchema": {
    "type": "object",
    "required": ["diff"],
    "additionalProperties": false,
    "properties": {
      "diff":   { "type": "string", "maxLength": 262144 },
      "paths":  { "type": "array", "items": { "type": "string" } },
      "profile": { "enum": ["quick", "full"], "default": "quick" }
    }
  }
}
```

其余 4 个工具字段表：

| 工具 | 必填 | 可选 | 返回要点 |
|---|---|---|---|
| `gate_status` | `task_id` | — | `{phase, remaining[], valid}` |
| `gate_clear` | `task_id`,`check_id` | `note` | `{cleared, state, remaining[]}`；human-WAIT→`HUMAN_CONFIRMATION_REQUIRED` |
| `record_evidence` | `task_id`,`type`,`summary` | `payload_hash` | `{evidence_id}` |
| `finish_task` | `task_id` | — | 成功 `{finished:true}`；缺证据 `EVIDENCE_REQUIRED + reasons[]` |

## 附录 E：用户 CI 示例（GitHub Actions）

```yaml
name: harness-verify
on: [pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: npm test -- --reporter=basic
      - name: Harness hosted gate
        env:
          HARNESS_KEY: ${{ secrets.HARNESS_KEY }}   # 用户自己配置
          HARNESS_TASK: ${{ vars.HARNESS_TASK }}    # 任务 ID（可用 commit 计划）
        run: |
          curl -sS -X POST https://mcp.pallastrade.cn/verify \
            -H "Authorization: Bearer $HARNESS_KEY" \
            -H "Content-Type: application/json" \
            -d "{\"task_id\":\"$HARNESS_TASK\",\"commit_sha\":\"$GITHUB_SHA\",
                 \"ci\":{\"tests\":\"pass\",\"build\":\"pass\"}}" | tee result.json
          node -e "process.exit(JSON.parse(require('fs').readFileSync('result.json')).pass?0:1)"
```

## 附录 F：隐私政策 / 服务条款大纲

隐私政策（必须写明）：

1. 收集范围：API 调用内容（含你提交的 diff/文本）、账号邮箱、调用元数据（时间/次数）；
2. 用途：提供治理判定、配额计量、反滥用；
3. 存储：不长期保存 diff 全文（仅哈希与摘要）；元数据保留期（§4.2）；
4. 共享：不向第三方出售/共享数据（法律要求除外）；
5. 用户权利：导出/删除账号（删除 API）；
6. 联系与投诉渠道。

服务条款（要点）：服务可用性目标（尽力而为）、滥用禁止、退款规则、免责（判定为辅助，不构成法律意见）、终止条件。

## 附录 G：上线检查清单

- [ ] DNS 解析 `mcp.pallastrade.cn` → `<ECS_PUBLIC_IP>`
- [ ] 独立证书签发且 `certbot renew --dry-run` 通过
- [ ] `df -h` ≥5G、`free -m` 通过；容器限额生效（`docker stats` 验证）
- [ ] `/healthz`、`/readyz` 公网 200；无 Key 访问 `/mcp` 返回 401
- [ ] 超限 429 / 超体 413 实测通过；维护模式 503 实测通过
- [ ] 两个测试租户交叉访问 404（隔离测试套件 10/10）
- [ ] 备份任务首次产出；恢复演练完成一次
- [ ] 监控/告警联通（触发一次测试告警）
- [ ] 审计日志可查（含 IP 哈希、状态、延迟）
- [ ] 私有运维记录已登记（IP/cron/密钥位置），公开仓无敏感值
