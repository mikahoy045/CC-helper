import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { claudeDir, readCache, writeCache } from './cache.mjs';

const MONTH_TTL_MS = 30000;

function projectsDir(env) {
  return join(claudeDir(env), 'projects');
}

function emptyComponents() {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
}

function addComponents(target, usage) {
  target.input += Number(usage.input_tokens) || 0;
  target.output += Number(usage.output_tokens) || 0;
  target.cacheCreate += Number(usage.cache_creation_input_tokens) || 0;
  target.cacheRead += Number(usage.cache_read_input_tokens) || 0;
}

export function deriveTotals(components) {
  const input = Number(components.input) || 0;
  const output = Number(components.output) || 0;
  const cacheCreate = Number(components.cacheCreate) || 0;
  const cacheRead = Number(components.cacheRead) || 0;
  const fresh = input + output + cacheCreate;
  const cache = cacheRead;
  return { input, output, cacheCreate, cacheRead, fresh, cache, total: fresh + cache };
}

export function sumEntries(text, sinceMs) {
  const components = emptyComponents();
  const seen = new Set();
  for (const line of text.split('\n')) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'assistant') continue;
    const message = entry.message;
    if (!message || !message.usage) continue;
    if (sinceMs != null) {
      const time = Date.parse(entry.timestamp);
      if (!Number.isFinite(time) || time < sinceMs) continue;
    }
    const key = `${message.id || ''}::${entry.requestId || ''}`;
    if (key !== '::') {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    addComponents(components, message.usage);
  }
  return components;
}

function sumFile(path, sinceMs) {
  try {
    return sumEntries(readFileSync(path, 'utf8'), sinceMs);
  } catch {
    return emptyComponents();
  }
}

function mergeComponents(target, source) {
  target.input += Number(source.input) || 0;
  target.output += Number(source.output) || 0;
  target.cacheCreate += Number(source.cacheCreate) || 0;
  target.cacheRead += Number(source.cacheRead) || 0;
}

function listJsonl(dir) {
  const files = [];
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.jsonl')) files.push(path);
    }
  };
  walk(dir);
  return files;
}

function sessionTokens(env, transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  try {
    const stat = statSync(transcriptPath);
    const name = `s-${basename(transcriptPath)}.json`;
    const cache = readCache(env, name);
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size && cache.components) {
      return deriveTotals(cache.components);
    }
    const components = sumFile(transcriptPath, null);
    writeCache(env, name, { mtimeMs: stat.mtimeMs, size: stat.size, components });
    return deriveTotals(components);
  } catch {
    return null;
  }
}

function monthTokens(env, now) {
  try {
    const date = new Date(now * 1000);
    const monthStartMs = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const name = `m-${monthKey}.json`;
    const cache = readCache(env, name) || { files: {}, components: null, computedAt: 0 };
    if (Date.now() - (cache.computedAt || 0) < MONTH_TTL_MS && cache.components) {
      return deriveTotals(cache.components);
    }
    const dir = projectsDir(env);
    if (!existsSync(dir)) return null;
    const files = listJsonl(dir);
    const nextFiles = {};
    const components = emptyComponents();
    for (const path of files) {
      let stat;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.mtimeMs < monthStartMs) continue;
      const prev = cache.files[path];
      const fileComponents = prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size && prev.components
        ? prev.components
        : sumFile(path, monthStartMs);
      nextFiles[path] = { mtimeMs: stat.mtimeMs, size: stat.size, components: fileComponents };
      mergeComponents(components, fileComponents);
    }
    writeCache(env, name, { files: nextFiles, components, computedAt: Date.now() });
    return deriveTotals(components);
  } catch {
    return null;
  }
}

export function collectTokenUsage(env, data, now, want) {
  const result = { session: null, month: null };
  if (want.session) result.session = sessionTokens(env, data && data.transcript_path);
  if (want.month) result.month = monthTokens(env, now);
  return result;
}
