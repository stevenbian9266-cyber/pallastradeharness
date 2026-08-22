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

## 运行

```bash
npm test    # 或：npx harness verify unit
```
