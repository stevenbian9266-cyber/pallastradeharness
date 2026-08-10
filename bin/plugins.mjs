#!/usr/bin/env node
/**
 * plugins.mjs — 插件协议（roadmap §2.3）
 *
 * 让社区/项目通过统一接口扩展 harness：
 *
 *   Check 插件    { id, label, run(ctx) => { pass, evidence }, dependsOn? }
 *   Scanner 插件  { id, glob, exclude?, run({rootDir, files}) => violations[] }
 *   Preset        { id, name, layers?, gates?, docImpact?, scanners?, profiles? }
 *
 * 加载来源（两级）：
 *   1. 文件级：harness/plugins/*.mjs（export default { checks, scanners, presets }）
 *   2. 配置级：harness.config.mjs → plugins: { checks, scanners, presets }
 *
 * 用途：
 *   - gate：插件 check 追加到任务检查清单（id 前缀 plugin-）
 *   - check：执行插件 check.run + scanner.run（失败 → exit 1）
 *   - init：插件 preset 可被 --preset 引用
 */
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 加载所有插件（文件级 + 配置级），返回归一化数组。
 * @returns {{ checks: object[], scanners: object[], presets: object[], sources: string[] }}
 */
export async function loadPlugins(rootDir, config) {
  const checks = [];
  const scanners = [];
  const presets = [];
  const sources = [];

  // 1. 文件级：harness/plugins/*.mjs（下划线前缀文件跳过 = 可选加载）
  const pluginsDir = resolve(rootDir, 'harness', 'plugins');
  if (existsSync(pluginsDir)) {
    const files = readdirSync(pluginsDir).filter(f => f.endsWith('.mjs') && !f.startsWith('_'));
    for (const f of files) {
      try {
        const mod = await import(`${pathToFileURL(resolve(pluginsDir, f)).href}?t=${Date.now()}`);
        const p = mod.default || mod;
        if (p.checks) checks.push(...(Array.isArray(p.checks) ? p.checks : [p.checks]));
        if (p.scanners) scanners.push(...(Array.isArray(p.scanners) ? p.scanners : [p.scanners]));
        if (p.presets) presets.push(...(Array.isArray(p.presets) ? p.presets : [p.presets]));
        sources.push(`file:${f}`);
      } catch (e) {
        console.error(`❌ [plugin] failed to load ${f}: ${e.message}`);
      }
    }
  }

  // 2. 配置级：harness.config.mjs → plugins
  const cfg = config?.plugins;
  if (cfg) {
    if (cfg.checks) checks.push(...(Array.isArray(cfg.checks) ? cfg.checks : [cfg.checks]));
    if (cfg.scanners) scanners.push(...(Array.isArray(cfg.scanners) ? cfg.scanners : [cfg.scanners]));
    if (cfg.presets) presets.push(...(Array.isArray(cfg.presets) ? cfg.presets : [cfg.presets]));
    if (cfg.checks || cfg.scanners || cfg.presets) sources.push('config');
  }

  return { checks, scanners, presets, sources };
}

/** 校验插件结构，返回错误数组 */
export function validatePlugin(plugin, kind) {
  const errors = [];
  if (!plugin || typeof plugin !== 'object') return ['plugin must be an object'];
  if (kind === 'check') {
    if (!plugin.id) errors.push('check needs id');
    if (!plugin.label) errors.push('check needs label');
    if (typeof plugin.run !== 'function') errors.push(`check ${plugin.id || '?'} needs run(ctx)`);
  } else if (kind === 'scanner') {
    if (!plugin.id) errors.push('scanner needs id');
    if (!plugin.glob) errors.push(`scanner ${plugin.id || '?'} needs glob`);
    if (typeof plugin.run !== 'function') errors.push(`scanner ${plugin.id || '?'} needs run({rootDir, files})`);
  } else if (kind === 'preset') {
    if (!plugin.id) errors.push('preset needs id');
  }
  return errors;
}

/** 校验并归一化插件集，非法项跳过并警告 */
export function normalizePlugins({ checks = [], scanners = [], presets = [] }) {
  const validChecks = [];
  const validScanners = [];
  const validPresets = [];
  for (const c of checks) {
    const errs = validatePlugin(c, 'check');
    if (errs.length) console.warn(`⚠️ [plugin] invalid check: ${errs.join('; ')}`);
    else validChecks.push(c);
  }
  for (const s of scanners) {
    const errs = validatePlugin(s, 'scanner');
    if (errs.length) console.warn(`⚠️ [plugin] invalid scanner: ${errs.join('; ')}`);
    else validScanners.push(s);
  }
  for (const p of presets) {
    const errs = validatePlugin(p, 'preset');
    if (errs.length) console.warn(`⚠️ [plugin] invalid preset: ${errs.join('; ')}`);
    else validPresets.push(p);
  }
  return { checks: validChecks, scanners: validScanners, presets: validPresets };
}
