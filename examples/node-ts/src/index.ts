// 最小 TypeScript 示例（Tier A fixture）
export function greet(name) {
  return `Hello, ${name}!`;
}

/** 类型示例：保持 TS 语法以演示类型化接入 */
export interface Config {
  name: string;
  tiers: string[];
}
