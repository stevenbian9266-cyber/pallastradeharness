# 基础规则集（starter rules）

项目无关的通用反模式与工程规范 starter 规则。`harness init` 会复制到项目，下面命令也可手动执行。

## 使用

```bash
cp node_modules/pallastrade-harness/rules/base-anti-patterns.json \
   harness/policies/anti-patterns.json
cp node_modules/pallastrade-harness/rules/base-standards.json \
   harness/standards/base-standards.json
```

## 规则清单

| id | severity | 模式 | 目标文件 | 说明 |
|---|---|---|---|---|
| STARTER-001 | warning | `style={{` | `**/*.{tsx,jsx}` | 内联样式对象 → 用 CSS 类/设计令牌 |
| STARTER-002 | warning | `#[0-9a-fA-F]{3,8}` | `**/*.{tsx,jsx,css}` | 硬编码十六进制色值 → 用设计令牌变量 |
| STARTER-003 | error | `console.(log|debug)(` | `**/*.{ts,tsx,js,jsx}` | 源码残留 console 日志 → 结构化 logger / 删除 |
| STARTER-004 | warning | `TODO\|FIXME` | `**/*.{ts,tsx,js,jsx,rb,py}` | 技术债标记 → 入 issue 跟踪 |
| STARTER-005 | error | 密钥/API key 前缀 | 源码/配置 | 密钥泄漏 → 移入 env / secret manager |

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

## 贡献

通用新规则请 PR 到 `base-anti-patterns.json`（`STARTER-006+`），并在上表登记。
项目特定规则留在用户项目 `harness/policies/anti-patterns.json`——不要并入本文件。

`base-standards.json` 的 Standard 必须使用唯一 `STD-<DOMAIN>-NNN` ID，并包含 authority、scope、severity、enforcement、evidence、fix、exception 和 knowledgeImpact。运行 `harness standards coverage` 检查机器执行覆盖率。
