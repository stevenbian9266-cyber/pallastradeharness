#!/usr/bin/env bash
# block_destructive_db.sh — PreToolUse 钩子：拦截破坏性数据库命令（v1.6.0）
# 由 `harness onboard --write` 生成。AI 执行这些命令前被 Claude Code 钩子拦截。
set -uo pipefail

# 读取工具输入（Claude Code hooks 通过 stdin 传入 JSON）
input=$(cat)

# 提取将要执行的命令
cmd=$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

# 破坏性命令特征
if printf '%s' "$cmd" | grep -qE 'DROP (TABLE|DATABASE)|TRUNCATE|DELETE FROM (?!.*WHERE)|ALTER TABLE.*DROP|SET SQL_SAFE_UPDATES|redis-cli.*FLUSHALL|FLUSHDB'; then
  echo "BLOCKED: 检测到破坏性数据库命令（不允许直接执行）：$cmd"
  echo "建议：先确认备份，通过迁移/受控脚本执行，并在执行前获得用户明确同意。"
  exit 2
fi

# force-push 到 main/master 也拦截
if printf '%s' "$cmd" | grep -qE 'push (-f|--force).* (main|master)$'; then
  echo "BLOCKED: 禁止 force-push 到 main/master。"
  exit 2
fi

exit 0
