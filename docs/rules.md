---
layout: default
title: 规则集
---
# 基础规则集（starter rules）

仓库自带**跨语言、项目无关**的反模式与工程规范 starter 规则集，作为新项目的起点。`harness init` 会自动复制这两份文件且不覆盖已有项目规则。

## 使用

```bash
cp node_modules/pallastrade-harness/rules/base-anti-patterns.json \
   harness/policies/anti-patterns.json
cp node_modules/pallastrade-harness/rules/base-standards.json \
   harness/standards/base-standards.json
```

## 规则清单

{% raw %}
| id | severity | 模式 | 目标文件 | 说明 |
|---|---|---|---|---|
| STARTER-001 | warning | `style=&#123;&#123;` | `**/*.{tsx,jsx}` | 内联样式对象 → 用 CSS 类/设计令牌 |
| STARTER-002 | warning | `#[0-9a-fA-F]{3,8}` | `**/*.{tsx,jsx,css}` | 硬编码十六进制色值 → 设计令牌 |
| STARTER-003 | error | `console.(log|debug)(` | `**/*.{ts,tsx,js,jsx}` | 源码残留 console 日志 |
| STARTER-004 | warning | `TODO\|FIXME` | `**/*.{ts,tsx,js,jsx,rb,py}` | 技术债标记 |
| STARTER-005 | error | 密钥/API key 前缀 | 源码/配置 | 密钥泄漏 |
{% endraw %}

## Schema

```jsonc
{
  "rules": [
    {
      "id": "STARTER-001",          // 唯一 id
      "severity": "warning|error",  // error 阻塞提交，warning 提示
      "pattern": "...",             // RegExp 字符串（引擎 new RegExp 编译）
      "fileGlob": "**/*.{tsx,jsx}", // 扫描范围
      "excludeGlob": "...",         // 可选，排除范围（| 分隔多个 glob）
      "message": "...",             // 违规提示
      "fix": "..."                  // 修复建议
    }
  ]
}
```

## 项目特定规则

项目特定规则（如「必须用 SDK 禁止裸 fetch」「禁止绕过 store scope」）由项目自行维护在 `harness/policies/anti-patterns.json`——不要并入 starter 库。

通用新规则欢迎贡献到本仓库（见 [贡献指南](contributing.md)）。

## 工程规范注册表

`rules/base-standards.json` 提供 13 类 starter standards。项目通过 `harness/standards/**/*.json` 覆盖或扩充，并使用以下命令验证：

```bash
npx harness standards list
npx harness standards coverage
npx harness standards select --base origin/main
```

Schema、执行等级和 Supervisor 行为见[规范与开发监督](standards-supervisor.md)。
