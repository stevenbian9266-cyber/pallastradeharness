# Ruby on Rails 参考项目（Tier A）

最小 Rails 项目结构，展示 Harness 接入方式。

## 接入步骤

```bash
bundle install
npx harness setup --preset rails --tier lite --name rails-example
npx harness doctor
npx harness verify unit --task <TASK-ID>   # 运行 bundle exec rspec
```

## 配置要点

- `harness.config.mjs`：`layers.app` → `app/`、`layers.spec` → `spec/`；`evidence.verifiers.unit` → `bundle exec rspec`
- 模型 `app/models/sample.rb` 与测试 `spec/sample_spec.rb` 构成最小闭环

## 运行（需 Ruby 环境）

```bash
bundle exec rspec
```
