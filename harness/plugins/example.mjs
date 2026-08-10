// 示例插件 — 演示插件协议（§2.3）
// 放到项目的 harness/plugins/ 目录，harness 自动加载。
// 也可在 harness.config.mjs 的 plugins 段配置（配置级加载）。
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default {
  // Check 插件：进入 gate 检查清单 + `harness check` 执行
  checks: [
    {
      id: 'no-todos',
      label: 'No TODO/FIXME comments in changed source files',
      run: async ({ rootDir, files }) => {
        const targets = (files || []).filter(f => /\.(ts|tsx|js|jsx|rb|py)$/.test(f));
        const hits = [];
        for (const f of targets) {
          const p = resolve(rootDir, f);
          if (!existsSync(p)) continue;
          const lines = readFileSync(p, 'utf-8').split('\n');
          lines.forEach((ln, i) => {
            if (/TODO|FIXME/.test(ln)) hits.push(`${f}:${i + 1}`);
          });
        }
        return hits.length
          ? { pass: false, evidence: `TODO/FIXME found: ${hits.join(', ')}` }
          : { pass: true, evidence: 'no TODO/FIXME in changed files' };
      },
    },
  ],

  // Scanner 插件：`harness check` 里执行，违规 → 失败
  scanners: [
    {
      id: 'console-log',
      glob: '**/*.{ts,tsx,js,mjs}',
      run: async ({ rootDir, files }) => {
        const targets = (files || []).filter(f => /\.(ts|tsx|js|mjs)$/.test(f));
        const violations = [];
        for (const f of targets) {
          const p = resolve(rootDir, f);
          if (!existsSync(p)) continue;
          const lines = readFileSync(p, 'utf-8').split('\n');
          lines.forEach((ln, i) => {
            if (/\bconsole\.(log|debug)\b/.test(ln)) violations.push(`${f}:${i + 1}: console.*`);
          });
        }
        return violations;
      },
    },
  ],

  // Preset：可被 `harness init --preset <id>` 引用（需内置注册，此处仅演示结构）
  presets: [
    { id: 'example', name: 'Example preset (layers + gates demo)', layers: [{ id: 'src', path: 'src', label: 'Source' }] },
  ],
};
