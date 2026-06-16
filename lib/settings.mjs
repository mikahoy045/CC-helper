import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BACKUP_KEY = 'statusLineBackupCcUsage';

export function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

export function settingsPath() {
  return join(claudeDir(), 'settings.json');
}

export function dataDir() {
  return join(claudeDir(), 'cc-usage');
}

export function installedStatuslinePath() {
  return join(dataDir(), 'statusline', 'cc-usage.mjs');
}

export function configFilePath() {
  return join(dataDir(), 'config.json');
}

export function readSettings() {
  const path = settingsPath();
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export function writeSettingsAtomic(settings) {
  mkdirSync(claudeDir(), { recursive: true });
  const path = settingsPath();
  const tmp = `${path}.cc-usage.tmp`;
  writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

export function toPosix(path) {
  return path.split('\\').join('/');
}

export function commandString() {
  return `node "${toPosix(installedStatuslinePath())}"`;
}

export function isOurStatusLine(statusLine) {
  return Boolean(
    statusLine &&
    typeof statusLine.command === 'string' &&
    statusLine.command.includes('cc-usage'),
  );
}

export { BACKUP_KEY };
