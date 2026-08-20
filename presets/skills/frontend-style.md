---
name: {{SKILL_ID}}
description: Use when working on {{PROJECT_NAME}}'s {{SKILL_TITLE}} area — design tokens, colors, typography, spacing, border radius, components, style conventions. Common phrasings include "样式", "颜色", "字体", "布局", "UI", "设计系统", "token", "主题", "圆角", "风格". Provides style conventions and design token usage; defers to authoritative files below.
lastReviewedAt: {{TODAY}}
---

# {{PROJECT_NAME}} — {{SKILL_TITLE}}

> 由 `harness skill audit --generate` 自动创建（检测依据：{{DETECT_NOTE}}）。
> 这是通用基线模板，AI 协作时按本项目实际细化。

## 核心概念

- **设计 token 唯一实现处**：颜色/间距/字号/圆角集中定义（SCSS 变量或 CSS 变量），组件一律引用 token，禁止散落硬编码
- **语义色**：同一语义只允许一个色值（价格色/成功色/警告色/危险色全局唯一）
- **视觉一致性**：卡片圆角、按钮形状、页面背景、字体族全站统一
- **可访问性**：文字对比度达标；交互元素可点击区域足够大

## 常用操作

1. 取色/取间距：引用设计 token（`$var` / `var(--token)`），禁止硬编码 `#xxx` / 魔法数值
2. 新增组件样式：scoped + 类名语义化 + 尺寸用相对单位（rpx/rem）
3. 覆盖组件库样式：`::v-deep` / 深度选择器 + token
4. 响应式/适配：用 token 的间距与圆角分级，禁止逐页魔改

## 常见问题与陷阱

- ❌ 硬编码颜色 → 主题切换失效；用 token
- ❌ 同语义多色值（多个红色/绿色）→ 视觉混乱；收敛到语义色
- ❌ 内联样式 → 无法复用与覆盖；用类
- ❌ 字体/字重随意（semibold 等）→ 按设计系统字重白名单
- ❌ 页面背景不统一 → 全局页底色一致
- ❌ 圆角/间距不按分级 → 视觉失序；用分级 token

## 本项目权威文件

{{AUTHORITY_FILES}}

## 项目化待办（AI 填充）

- （AI：列出本项目 token 文件、语义色表、组件库与既有风格规范文档）
- （AI：补全本项目常用组件清单与既有反例）
