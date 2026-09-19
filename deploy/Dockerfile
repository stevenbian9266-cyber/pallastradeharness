# deploy/Dockerfile — harness 托管 MCP 服务镜像（本地构建，离线交付到服务器）
#
# 构建：deploy/build-local.ps1（或 docker build -f deploy/Dockerfile -t harness-mcp:<tag> .）
# 运行：docker compose -f deploy/docker-compose.mcp.yml --env-file deploy/.env.mcp up -d
#
# 设计要点：
#   - 引擎零运行时依赖 → 不跑 npm ci，只 COPY 运行所需资产（镜像小、构建快）
#   - 基础镜像可覆盖：--build-arg NODE_BASE=<mirror>/node:24-alpine（Docker Hub 不可达时用镜像站）
#   - npm registry 可覆盖：--build-arg NPM_REGISTRY=https://registry.npmjs.org（默认国内镜像）
#   - 启动带 --experimental-sqlite：Node 22 必需（node:sqlite 需显式开启），Node 24 同样接受该标志
#   - 非 root 运行；/data /logs 由 node 用户持有（bind mount 目标）
#   - 健康检查用 node 内置 fetch（不装 curl 保持镜像最小）
#
# 已知债（已登记后续任务）：引擎包有 4 个运行时依赖（glob/minimatch/pngjs/pixelmatch），其中 glob
# 是被 Cloud 链路经 bin/mcp.mjs → bin/project-brain.mjs 间接引入的，服务实际不用它；理想修法是抽出
# 纯信封模块（mcp-envelope）切断该传递依赖。当前先如实安装生产依赖。
ARG NODE_BASE=node:22-alpine
ARG NPM_REGISTRY=https://registry.npmmirror.com
FROM ${NODE_BASE}

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3110 \
    DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --registry=${NPM_REGISTRY} --no-audit --no-fund \
    && npm cache clean --force

COPY bin ./bin
COPY presets ./presets
COPY templates ./templates
COPY rules ./rules

RUN mkdir -p /data /logs && chown -R node:node /data /logs /app
USER node

EXPOSE 3110

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3110)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-sqlite", "bin/mcp-server.mjs", "--http"]
