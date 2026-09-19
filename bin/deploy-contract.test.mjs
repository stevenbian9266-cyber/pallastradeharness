/**
 * deploy-contract.test.mjs — 部署资产契约测试（防跨文件漂移）
 *
 * 动机：`deploy/` 下的文件互相引用同一组常量（端口 3110、健康路径 /healthz、镜像 tag 变量、
 * env 键名）。任何一处单独改动都会让部署在服务器上才炸——用测试把契约钉死在这里。
 *
 * 覆盖：PRD AC-004（compose 形态）/AC-005（跨文件一致）/AC-006（回滚与保留）/
 *       AC-008（npm 发布停用）/AC-009（doctor 指向 compose）。
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(join(REPO_ROOT, rel), 'utf-8');

const COMPOSE = 'deploy/docker-compose.mcp.yml';
const DOCKERFILE = 'deploy/Dockerfile';
const ENV_EXAMPLE = 'deploy/.env.mcp.example';
const ACTIVATE = 'deploy/activate.sh';
const NGINX = 'deploy/nginx/mcp.pallastrade.cn.conf';
const NGINX_ZONE = 'deploy/nginx/mcp-ratelimit.conf';
const PUBLISH_WORKFLOW = '.github/workflows/publish.yml';

test('AC-004: compose 形态（镜像 tag 变量 / 仅本机监听 / 资源上限 / 日志轮转）', () => {
  const compose = read(COMPOSE);
  assert.match(compose, /image:\s*harness-mcp:\$\{HARNESS_MCP_TAG\}/, '镜像必须由 HARNESS_MCP_TAG 插值');
  assert.match(compose, /127\.0\.0\.1:3110:3110/, '只允许本机监听 3110');
  assert.match(compose, /mem_limit:\s*512m/);
  assert.match(compose, /cpus:\s*0\.75/);
  assert.match(compose, /restart:\s*unless-stopped/);
  assert.match(compose, /max-size:\s*"10m"/);
  assert.match(compose, /max-file:\s*"3"/);
  assert.match(compose, /name:\s*harness-mcp-net/, '专属网络');
  assert.ok(!/build:/.test(compose), '服务器不构建：compose 不得含 build:');
});

test('AC-005: 跨文件契约一致（端口 / 健康路径 / env 键 / tag 变量）', () => {
  const dockerfile = read(DOCKERFILE);
  const zone = read(NGINX_ZONE);
  const nginx = read(NGINX);
  const envExample = read(ENV_EXAMPLE);
  const activate = read(ACTIVATE);

  // 端口 3110 在四处一致
  for (const [file, content] of [[DOCKERFILE, dockerfile], [NGINX, nginx], [ENV_EXAMPLE, envExample], [ACTIVATE, activate]]) {
    assert.match(content, /3110/, `${file} 必须使用端口 3110`);
  }
  // nginx 反代目标 = 本机 3110
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3110;/);
  // 健康路径：容器/nginx/激活脚本三处一致
  assert.match(dockerfile, /\/healthz/, 'Dockerfile 健康检查打 /healthz');
  assert.match(nginx, /location = \/healthz/);
  assert.match(nginx, /location = \/readyz/);
  assert.match(activate, /\/healthz/, 'activate.sh 探活 /healthz');
  // nginx 独立限流 zone
  assert.match(zone, /limit_req_zone .*zone=mcp_rl/);
  assert.match(nginx, /limit_req zone=mcp_rl/);
  assert.match(nginx, /mcp\.pallastrade\.cn/);
  // env 模板键最小集
  for (const key of ['HARNESS_API_KEY', 'PORT=3110', 'DATA_DIR=/data', 'NODE_ENV=production']) {
    assert.ok(envExample.includes(key), `${ENV_EXAMPLE} 必须声明 ${key}`);
  }
  assert.match(envExample, /HARNESS_CLOUD_DB/);
  // 镜像运行形态
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /EXPOSE 3110/);
  assert.match(dockerfile, /--experimental-sqlite/, 'node:sqlite 需显式开启标志');
  assert.match(dockerfile, /ARG NODE_BASE=/, '基础镜像可覆盖（镜像站）');
  assert.match(dockerfile, /ARG NPM_REGISTRY=/, 'npm registry 可覆盖');
});

test('AC-006: activate.sh 具备回滚与镜像保留逻辑（语法校验可用时执行）', () => {
  const activate = read(ACTIVATE);
  assert.match(activate, /\.env\.tag\.prev/, '必须保留上一 tag 作为回滚点');
  assert.match(activate, /rolled back|回滚/);
  assert.match(activate, /KEEP_IMAGES=3/);
  assert.match(activate, /docker load/, '服务器只 load，不构建');
  assert.match(activate, /df -BG/, '磁盘预检（历史事故）');
  // 注意：脚本里的清理提示是 `docker builder prune`，故用 (?!er) 排除误匹配
  assert.ok(!/docker build(?!er)/.test(activate), 'activate.sh 不得构建镜像');

  const bash = ['C:/Program Files/Git/bin/bash.exe', 'bash'].find(candidate => {
    try {
      execFileSync(candidate, ['-c', 'true'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
  if (!bash) {
    // Windows 上无 bash（WSL 未装）时跳过语法校验，但仍验证文件存在
    assert.ok(existsSync(join(REPO_ROOT, ACTIVATE)));
    return;
  }
  const result = spawnSync(bash, ['-n', join(REPO_ROOT, ACTIVATE)], { encoding: 'utf-8' });
  assert.equal(result.status, 0, `bash -n failed: ${result.stderr}`);
});

test('AC-008: npm 发布链路已停用（工作流无 publish 触发）', () => {
  assert.ok(existsSync(join(REPO_ROOT, PUBLISH_WORKFLOW)), 'publish.yml 必须存在并显式声明停用');
  const workflow = read(PUBLISH_WORKFLOW);
  assert.ok(!/npm publish/.test(workflow), '不得再有 npm publish 步骤');
  assert.ok(!/registry-url/.test(workflow), '不得再配置 npm registry');
  assert.match(workflow, /workflow_dispatch/, '保留手动触发以便显式确认停用状态');
  assert.match(workflow, /停用|retired|disabled/i);
});

test('AC-009: 本仓 doctor 指向新 compose 文件', () => {
  const config = read('harness.config.mjs');
  assert.match(config, /composeCandidates:\s*\[[^\]]*deploy\/docker-compose\.mcp\.yml/);
});
