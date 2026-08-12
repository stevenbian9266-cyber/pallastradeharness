---
name: harness-standards-audit
description: Use when the user runs "harness standards generate" and needs the standards JSON drafted, or when a project's standards coverage has gaps that need to be filled by reading business code. Also use when asked to audit or write machine-readable standards (Standard schema) for a repository. Common phrasings include "standards generate", "standards gap", "补全规范", "写规范", "audit standards".
---

# Harness Standards Audit（Auto-Standards 方法论）

> 目标：**读懂业务代码 → 产出符合 Standard schema 的机器可读规范**，让人确认后写回。
> 引擎不调用 LLM；本 Skill 是 AI 起草规范的方法论。

## 1. 输入

- `harness analyze`（技术栈/层/差距报告）
- `harness standards gap --format json`（领域代码 vs 规范覆盖缺口）
- `harness/standards/<name>.json`（现有规范，遵循其风格）
- 各缺口领域的代表性业务代码

## 2. 输出

一个符合 schema 的 `harness/standards/<name>.json`：

```json
{
  "schemaVersion": "1.0",
  "standards": [
    {
      "schemaVersion": "1.0",
      "type": "Standard",
      "id": "STD-<PROJECT>-<CATEGORY>-001",
      "category": "database",
      "title": "<一句话规范>",
      "authority": { "file": "<真实权威文件>", "section": "<真实章节>" },
      "scope": ["<匹配文件 glob>"],
      "severity": "error|warning",
      "enforcement": { "level": "documented|advisory|review-required|verified|blocking|critical", "type": "review|deterministic|evidence|deterministic+evidence", "verifier": "<仅 deterministic 时> " },
      "evidence": ["<证据类型>"],
      "fix": "<违规修复指引>",
      "exception": { "allowed": true, "requiresReason": true },
      "knowledgeImpact": ["<受影响知识资产>"]
    }
  ]
}
```

## 3. 起草规则（必须遵守）

1. **category 固定**：architecture / technology-selection / code-quality / database / api / security / ui-style / interaction / accessibility / testing / documentation / knowledge / deployment
2. **如实标注 enforcement**：只有存在确定性校验器（verifier）才标 `deterministic`；否则标 `advisory` 或 `review-required`
3. **authority 必须是真实文件**（不能编造章节），scope 必须是真实 glob
4. **每类至少 1 条**：只对"有代码的领域"补规范，不制造规范通胀
5. **从代码提炼**：读该领域代码 → 总结其约定/边界/风险点 → 转成规范条目
6. **继承通用项**：与 `rules/base-standards.json` 冲突时，项目规范优先但需说明

## 4. 完成标准

- `npx harness standards validate` 通过（schema 校验）
- `npx harness standards coverage --json` 显示缺口收敛
- 人确认后删除 JSON 中的 `draft` 字段并提交
