# Harness 1.0 单项目示例

这个示例展示一个 `src/` + `test/` 项目如何声明层、知识源、风险路径和证据目录。

复制 `harness.config.mjs` 和 `harness/standards/project.json` 到项目后运行：

```bash
npx harness init
npx harness task start --title "新增：示例能力" --allow "src/**" --allow "test/**"
```

运行状态保存在 `.harness-state/`；不要将其提交到 Git。

