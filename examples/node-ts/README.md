# Node.js + TypeScript 参考项目（Tier A）

最小 TypeScript 项目，展示 Harness 接入方式。

## 接入步骤

```bash
npm i -D pallastrade-harness
npx harness setup --preset single --tier lite --name node-ts-example
npx harness doctor
npx harness verify unit --task <TASK-ID>   # 运行 node --test
```

## 配置要点

- `harness.config.mjs`：`layers.app` → `src/`；`evidence.verifiers.unit` → `node --test **/*.test.mjs`
- 测试文件 `src/index.test.mjs` 被 `node --test` 自动发现（glob 由引擎展开）
- 测试直接 `import './index.ts'`：Node 23.6+ / 22.18+ 默认支持 type stripping；
  Node 22.6–22.17 需 `--experimental-strip-types`——已在示例自身的 `package.json#scripts.test` 中声明，
  因此运行环境由示例自己负责，不污染引擎核心测试（`npm run test:core` 只跑 `bin/*.test.mjs`）

## 运行

```bash
npm test                # 示例自身测试（含 strip-types 参数）
npm run test:examples   # 从仓库根运行同一份示例测试
npx harness verify unit # 或：走引擎验证器
```
