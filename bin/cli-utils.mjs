import { delimiter } from 'node:path';

export const EXIT_CODES = Object.freeze({
  OK: 0,
  POLICY_FAILURE: 1,
  USAGE_OR_CONFIG: 2,
  INTERNAL_ERROR: 3,
});

export class HarnessError extends Error {
  constructor(message, exitCode = EXIT_CODES.INTERNAL_ERROR, options = {}) {
    super(message, options);
    this.name = 'HarnessError';
    this.exitCode = exitCode;
  }
}

export class ConfigError extends HarnessError {
  constructor(message, options = {}) {
    super(message, EXIT_CODES.USAGE_OR_CONFIG, options);
    this.name = 'ConfigError';
  }
}

export function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] ?? null : null;
}

export function hasArg(args, flag) {
  return args.includes(flag);
}

export function getArgs(args, flag) {
  const values = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== flag) continue;
    for (let cursor = index + 1; cursor < args.length && !args[cursor].startsWith('--'); cursor++) {
      values.push(...args[cursor].split(',').map(value => value.trim()).filter(Boolean));
      index = cursor;
    }
  }
  return values;
}

export function parseFilesArg(args) {
  const values = getArgs(args, '--files');
  return values.length > 0 ? [...new Set(values)] : null;
}

export function npxCommand(platform = process.platform) {
  return platform === 'win32' ? 'npx.cmd' : 'npx';
}

export function pathList(value) {
  return String(value || '').split(delimiter).filter(Boolean);
}
