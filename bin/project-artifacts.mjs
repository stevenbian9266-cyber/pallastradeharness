/**
 * project-artifacts.mjs — ProjectArtifact 契约的 Local 文件实现（Batch C / C01）
 *
 * 定位：Constitution 制品的**文件型清单**（单一事实源 = `harness/constitution/artifacts.json`）。
 *   - 不做数据库；Local Runtime 继续以文件形式存在（指令 C01）；
 *   - hash 可复算：`sha256:<hex>`（文件内容）；
 *   - drift 检测：清单记录 hash ≠ 当前文件 hash → `STALE`（供 C09 变更流守卫）。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createContract } from './contracts.mjs';
import { atomicWriteJson } from './state-store.mjs';

/** Constitution 根目录（制品 + 清单 + 快照 + 审批 + 变更提案）。 */
export function constitutionDir(rootDir, config) {
  return resolve(rootDir, config?.constitution?.dir || 'harness/constitution');
}

export function artifactsPath(rootDir, config) {
  return resolve(constitutionDir(rootDir, config), 'artifacts.json');
}

/** 内容哈希（`sha256:<hex>`）。 */
export function hashContent(text) {
  return `sha256:${createHash('sha256').update(String(text)).digest('hex')}`;
}

/** 单文件哈希；文件不存在 → null。 */
export function hashFile({ rootDir, path }) {
  const abs = resolve(rootDir, String(path).replaceAll('\\', '/'));
  if (!existsSync(abs)) return null;
  return hashContent(readFileSync(abs, 'utf-8'));
}

/** 多文件聚合哈希（排序后逐条 `path:hash`，缺失记 `missing`）——审批绑定用。 */
export function hashFiles({ rootDir, files = [] }) {
  const normalized = [...new Set(files.map(file => String(file).replaceAll('\\', '/').replace(/^\.\//, '')))].sort();
  const parts = normalized.map(path => `${path}:${hashFile({ rootDir, path }) ?? 'missing'}`);
  return hashContent(parts.join('\n'));
}

function normalizeRel(path) {
  return String(path).replaceAll('\\', '/').replace(/^\.\//, '');
}

/** 读取制品清单（不存在 → 空清单）。 */
export function readArtifactManifest({ rootDir, config }) {
  const path = artifactsPath(rootDir, config);
  if (!existsSync(path)) return { schemaVersion: '1.0', type: 'ArtifactManifest', artifacts: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return {
      schemaVersion: '1.0', type: 'ArtifactManifest',
      ...parsed,
      artifacts: Array.isArray(parsed?.artifacts) ? parsed.artifacts : [],
    };
  } catch {
    throw new TypeError(`artifact manifest is not valid JSON: ${path}`);
  }
}

export function writeArtifactManifest({ rootDir, config, manifest }) {
  const path = artifactsPath(rootDir, config);
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteJson(path, manifest);
  return path;
}

export function listArtifacts({ rootDir, config }) {
  return readArtifactManifest({ rootDir, config }).artifacts;
}

export function getArtifact({ rootDir, config, id }) {
  return listArtifacts({ rootDir, config }).find(artifact => artifact.id === id) || null;
}

/**
 * 注册/更新一个制品（校验 ProjectArtifact 契约；文件不存在即报错）。
 * @returns {object} ProjectArtifact
 */
export function upsertArtifact({
  rootDir, config, id, type, path,
  templateId = null, templateVersion = '1.0.0', artifactVersion = '1.0.0',
  now = new Date().toISOString(),
}) {
  const relPath = normalizeRel(path);
  const contentHash = hashFile({ rootDir, path: relPath });
  if (contentHash === null) throw new TypeError(`artifact path does not exist: ${relPath}`);
  const manifest = readArtifactManifest({ rootDir, config });
  const existing = manifest.artifacts.find(artifact => artifact.id === id);
  const artifact = createContract('ProjectArtifact', {
    id,
    type,
    path: relPath,
    template_id: templateId || `${id}-template`,
    template_version: templateVersion,
    artifact_version: artifactVersion,
    content_hash: contentHash,
    status: 'ACTIVE',
    created_at: existing?.created_at || now,
    updated_at: now,
    template_path: existing?.template_path,
  });
  manifest.artifacts = [...manifest.artifacts.filter(item => item.id !== id), artifact]
    .sort((a, b) => a.id.localeCompare(b.id));
  writeArtifactManifest({ rootDir, config, manifest });
  return artifact;
}

/**
 * 刷新状态：当前文件 hash vs 记录 hash。
 * @returns {{manifest: object, artifacts: object[], drift: Array<{id: string, path: string, kind: 'CHANGED'|'MISSING', recorded?: string, current?: string|null}>}}
 */
export function refreshArtifacts({ rootDir, config }) {
  const manifest = readArtifactManifest({ rootDir, config });
  const drift = [];
  for (const artifact of manifest.artifacts) {
    const current = hashFile({ rootDir, path: artifact.path });
    if (current === null) {
      artifact.status = 'STALE';
      drift.push({ id: artifact.id, path: artifact.path, kind: 'MISSING', recorded: artifact.content_hash, current: null });
    } else if (current !== artifact.content_hash) {
      artifact.status = 'STALE';
      drift.push({ id: artifact.id, path: artifact.path, kind: 'CHANGED', recorded: artifact.content_hash, current });
    } else if (artifact.status === 'STALE') {
      artifact.status = 'ACTIVE';
    }
  }
  return { manifest, artifacts: manifest.artifacts, drift };
}

/**
 * 刷新并**接受当前内容为新基线**（变更流 apply 使用）：
 *   - drift 中的 CHANGED 项 → `content_hash := 当前 hash`、状态回 ACTIVE；
 *   - MISSING 项不改变（不能接受"文件消失"为新基线）；
 *   - 返回值仍保留本次 drift 明细（供提案/审计记录）。
 * 普通只读检查用 `refreshArtifacts`（不落盘、不改基线）。
 */
export function saveRefreshedArtifacts({ rootDir, config }) {
  const result = refreshArtifacts({ rootDir, config });
  const drifted = new Map(result.drift.map(item => [item.id, item]));
  const now = new Date().toISOString();
  for (const artifact of result.manifest.artifacts) {
    const item = drifted.get(artifact.id);
    if (!item || item.kind === 'MISSING') continue;
    artifact.content_hash = item.current;
    artifact.status = 'ACTIVE';
    artifact.updated_at = now;
  }
  writeArtifactManifest({ rootDir, config, manifest: result.manifest });
  return result;
}

/** 相对包根/项目根的路径（记录审批文件清单用）。 */
export function relativeArtifactPath(rootDir, absPath) {
  return normalizeRel(relative(rootDir, absPath));
}
