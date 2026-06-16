import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function claudeDir(env) {
  return env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

export function cacheDir(env) {
  return join(claudeDir(env), 'cc-usage', 'cache');
}

export function readCache(env, name) {
  try {
    const path = join(cacheDir(env), name);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function writeCache(env, name, value) {
  try {
    mkdirSync(cacheDir(env), { recursive: true });
    const path = join(cacheDir(env), name);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(value), 'utf8');
    renameSync(tmp, path);
  } catch {
    /* best-effort cache */
  }
}
