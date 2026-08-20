#!/usr/bin/env bash
# warn_on_secrets.sh — PostToolUse 钩子：编辑/写入后警告硬编码密钥（v1.6.0）
# 由 `harness onboard --write` 生成。不阻止写入，但提示 AI 检查敏感信息。
set -uo pipefail

input=$(cat)

# 提取被编辑文件的路径（多个）
paths=$(printf '%s' "$input" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//; s/"$//')

if [ -z "$paths" ]; then
  exit 0
fi

for p in $paths; do
  if [ -f "$p" ]; then
    if grep -qE '(sk_live_|pk_live_|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|api[_-]?key[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9]{16,})' "$p"; then
      echo "WARN: $p 可能包含硬编码密钥/私钥。请改为环境变量或密钥服务，切勿提交。"
    fi
  fi
done

exit 0
