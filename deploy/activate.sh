#!/usr/bin/env bash
# deploy/activate.sh — 服务器侧激活脚本（离线交付；服务器**不做构建**）
#
# 用法（在服务器上，由 publish-local.ps1 远程调用，也可手动跑）：
#   bash activate.sh <tag> [product.tar.gz]
#
# 行为：
#   1) 预检磁盘（<5G 直接失败，提示清理）
#   2) gunzip | docker load 载入镜像
#   3) 写 .env.tag（旧值 → .env.tag.prev，作为回滚点）
#   4) docker compose up -d
#   5) 探活 127.0.0.1:3110/healthz（30×2s）
#   6) 探活失败 → 自动回滚上一 tag（非 0 退出）
#   7) 只保留最近 3 个 harness-mcp 镜像（不动其他项目）
set -euo pipefail

ROOT_DIR="${HARNESS_MCP_ROOT:-/opt/harness-mcp}"
DEPLOY_DIR="$ROOT_DIR/deploy"
DIST_DIR="$ROOT_DIR/dist"
ENV_FILE="$DEPLOY_DIR/.env.mcp"
TAG_FILE="$DEPLOY_DIR/.env.tag"
PREV_FILE="$DEPLOY_DIR/.env.tag.prev"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.mcp.yml"
KEEP_IMAGES=3
HEALTH_TRIES=30
HEALTH_SLEEP=2

log()  { printf '%s\n' "$*"; }
fail() { printf '❌ %s\n' "$*" >&2; exit 1; }

TAG="${1:-}"
ARTIFACT="${2:-$DIST_DIR/harness-mcp-${TAG}.tar.gz}"
[ -n "$TAG" ] || fail "usage: activate.sh <tag> [artifact.tar.gz]"
[ -f "$ENV_FILE" ] || fail "missing $ENV_FILE (copy deploy/.env.mcp.example and fill HARNESS_API_KEY)"
[ -f "$COMPOSE_FILE" ] || fail "missing $COMPOSE_FILE (uploaded from repo deploy/)"
[ -f "$ARTIFACT" ] || fail "missing artifact: $ARTIFACT"

# ── 1) 磁盘预检（历史事故：磁盘满导致部署挂起）────────────────
AVAIL_GB=$(df -BG --output=avail "$ROOT_DIR" | tail -1 | tr -dc '0-9')
if [ "${AVAIL_GB:-0}" -lt 5 ]; then
  fail "disk too low: ${AVAIL_GB}G available (<5G). Clean with: docker image prune -f; docker builder prune -f"
fi
log "✅ disk ok (${AVAIL_GB}G available)"

# ── 2) 载入镜像 ────────────────────────────────────────────
log "→ loading image from $(basename "$ARTIFACT")"
gunzip -c "$ARTIFACT" | docker load

# ── 3) 记录回滚点 ──────────────────────────────────────────
PREV_TAG=""
if [ -f "$TAG_FILE" ]; then
  PREV_TAG=$(cut -d= -f2 "$TAG_FILE")
fi
if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$TAG" ]; then
  printf 'HARNESS_MCP_TAG=%s\n' "$PREV_TAG" > "$PREV_FILE"
fi
printf 'HARNESS_MCP_TAG=%s\n' "$TAG" > "$TAG_FILE"
log "✅ active tag: $TAG${PREV_TAG:+ (previous: $PREV_TAG)}"

compose_up() {
  ( cd "$DEPLOY_DIR" && docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TAG_FILE" up -d --remove-orphans )
}

health_check() {
  local attempt=1
  while [ "$attempt" -le "$HEALTH_TRIES" ]; do
    if curl -fsS --noproxy '*' "http://127.0.0.1:3110/healthz" >/dev/null 2>&1; then
      log "✅ app healthy (attempt $attempt, $((attempt * HEALTH_SLEEP))s)"
      return 0
    fi
    sleep "$HEALTH_SLEEP"
    attempt=$((attempt + 1))
  done
  return 1
}

# ── 4/5) 起服务并探活 ──────────────────────────────────────
compose_up
if health_check; then
  # ── 7) 保留最近 N 个镜像 ──────────────────────────────────
  mapfile -t OLD < <(docker images --format '{{.Repository}}:{{.Tag}}' harness-mcp | tail -n +$((KEEP_IMAGES + 1)))
  for img in "${OLD[@]:-}"; do
    [ -n "$img" ] && docker rmi "$img" >/dev/null 2>&1 || true
  done
  log "✅ activated $TAG"
  exit 0
fi

# ── 6) 探活失败 → 回滚 ─────────────────────────────────────
log "❌ health check failed after $((HEALTH_TRIES * HEALTH_SLEEP))s"
docker logs --tail 40 harness-mcp-app >&2 || true
if [ -n "$PREV_TAG" ]; then
  printf 'HARNESS_MCP_TAG=%s\n' "$PREV_TAG" > "$TAG_FILE"
  compose_up
  if health_check; then
    log "✅ rolled back to $PREV_TAG (failed tag $TAG kept for inspection)"
    exit 1
  fi
  fail "rollback to $PREV_TAG also failed — manual intervention required"
fi
fail "no previous tag to roll back to"
