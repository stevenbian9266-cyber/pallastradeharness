---
name: harness-skill-author
description: Use when the user runs "harness skill new --domain <x>" and the domain Skill body needs to be written, or when asked to author or maintain a domain Skill (SKILL.md) for a repository. Common phrasings include "skill new", "生成 skill", "写 SKILL", "skill-author".
---

# Harness Skill Author（Auto-Skills 方法论）

> 目标：**扫描新领域代码 → 产出结构化领域 SKILL.md**，注册进索引，经人确认后生效。

## 1. 输入

- `harness skill list --json`（现有 skill 风格参照）
- 新领域代码路径（`harness skill new` 生成的骨架已就位）
- 项目 `AGENTS.md` §0.1 / §0.2（权威文件与路由表）

## 2. 输出结构

```markdown
---
name: <domain>
description: Use when ... Common phrasings include "...".
---

# <Project> <Domain>

## 核心概念      ← 领域概念图：关键实体、关系、心智模型
## 常用操作      ← 本领域最常见的操作、命令、流程
## 常见问题与陷阱 ← 高频报错、反模式、规避方法
## 权威文件      ← 关键源码/文档路径（field-level 细节权威来源）
```

## 3. 起草规则

1. **frontmatter 必填** `name` + `description`；description 必须含**触发短语**（用户怎么说会命中它）
2. **描述要克制**：只写本领域知识，不重复其他 skill 内容；细节指向"权威文件"
3. **概念图优先**：先讲清实体关系（如 Product → Variant → Option），再讲操作
4. **陷阱要具体**：来自真实报错/事故，不要泛泛而谈
5. **权威文件真实**：路径必须真实存在，作为唯一 field-level 细节来源

## 4. 完成标准

- `npx harness skill check` 通过（结构校验）
- 已注册进 `AGENTS.md §0.1` 与 `ai/README.md`
- 人确认后移除骨架注释块
