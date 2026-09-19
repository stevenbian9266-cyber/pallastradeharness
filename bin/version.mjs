/**
 * version.mjs — 产品版本单一事实源（Batch A TASK-A03）
 *
 * 约定：`package.json#version` 是**唯一**产品版本来源；运行时（MCP serverInfo、
 * MCP 接入配置默认 spec 等）一律经由本模块读取，任何位置不得再硬编码版本号。
 *
 * 设计约束：
 *   - 只读本包自身清单（随 npm 包分发，永远与代码同步）
 *   - 零第三方依赖，纯 `node:fs` + `import.meta.url`
 *   - 进程内缓存一次读取结果（版本在同一进程生命周期内不可变）
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MANIFEST_PATH = fileURLToPath(new URL('../package.json', import.meta.url));

let cachedManifest = null;

/** 读取本包 package.json 清单（进程内缓存；解析失败即抛错，不静默降级）。 */
export function readHarnessManifest() {
  if (cachedManifest === null) {
    cachedManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  }
  return cachedManifest;
}

/** 产品名（= package.json#name）。 */
export function getHarnessName() {
  return String(readHarnessManifest().name);
}

/** 产品版本（= package.json#version）。 */
export function getHarnessVersion() {
  return String(readHarnessManifest().version);
}

/** 主.次 版本（`1.10.0` → `1.10`）；非法输入原样返回。 */
export function getMajorMinor(version = getHarnessVersion()) {
  const match = /^(\d+)\.(\d+)(?:\.|$)/.exec(String(version));
  return match ? `${match[1]}.${match[2]}` : String(version);
}

/** npm 包 spec（`<name>@<major.minor>`），用于 npx 供应链 pin 与配置生成。 */
export function getHarnessPackageSpec() {
  return `${getHarnessName()}@${getMajorMinor()}`;
}
