import { readFileSync, existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { readCache, writeCache } from './cache.mjs';

export function extractSkills(text) {
  const order = [];
  for (const line of text.split('\n')) {
    if (!line || !line.includes('"Skill"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const message = entry.message;
    if (!message || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block && block.type === 'tool_use' && block.name === 'Skill' && block.input && block.input.skill) {
        order.push(String(block.input.skill));
      }
    }
  }
  const seen = new Set();
  const recentFirst = [];
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const skill = order[i];
    if (seen.has(skill)) continue;
    seen.add(skill);
    recentFirst.push(skill);
  }
  return recentFirst;
}

export function sessionSkills(env, transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  try {
    const stat = statSync(transcriptPath);
    const name = `sk-${basename(transcriptPath)}.json`;
    const cache = readCache(env, name);
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size && Array.isArray(cache.skills)) {
      return cache.skills;
    }
    const skills = extractSkills(readFileSync(transcriptPath, 'utf8'));
    writeCache(env, name, { mtimeMs: stat.mtimeMs, size: stat.size, skills });
    return skills;
  } catch {
    return [];
  }
}
