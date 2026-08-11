## 变更类型

- [ ] 规则（`rules/`）
- [ ] 插件 / preset（`harness/plugins/` / `presets/`）
- [ ] 引擎（`bin/`）
- [ ] 文档（`docs/` / `README.md`）
- [ ] 发布 / CI（`.github/`）
- [ ] 其他

## 描述

（这段改动解决什么问题）

## 检查清单

- [ ] **引擎改动**：`npm test` 全绿 + `node --check bin/*.mjs` 语法自检
- [ ] **规则贡献**：附真实反例 + schema 合规（id/severity/pattern/fileGlob/message/fix），并在 `docs/rules.md` 登记
- [ ] **插件贡献**：提供 `plugins:list` / `init --preset` 可用的验证用例
- [ ] **文档改动**：`docs/` 对应页面已更新
- [ ] **版本变更**：`package.json` 版本号遵循 semver，README 发布信息已同步

## 关联

- Issue / 需求：
- 验证方式：
