import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import {
  readSettings,
  writeSettingsAtomic,
  settingsPath,
  dataDir,
  installedStatuslinePath,
  configFilePath,
  commandString,
  isOurStatusLine,
  BACKUP_KEY,
} from '../lib/settings.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sourceStatusline = join(here, '..', 'statusline');
const force = process.argv.includes('--force');
const refreshInterval = clampRefresh(process.env.CC_USAGE_REFRESH, 10);

const DEFAULT_CONFIG = {
  style: 'blocks',
  barWidth: 10,
  color: true,
  multiLine: true,
  showModel: true,
  showEffort: true,
  showContext: true,
  showFiveHour: true,
  showSevenDay: true,
  showSessionTokens: true,
  showMonthTokens: true,
  tokenBreakdown: true,
  exactTokens: true,
  showCost: false,
  warnPercent: 70,
  critPercent: 90,
  limitPercent: 95,
  compactColumns: 80,
};

function clampRefresh(value, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(3600, n));
}

function main() {
  mkdirSync(dataDir(), { recursive: true });
  cpSync(sourceStatusline, join(dataDir(), 'statusline'), { recursive: true });

  if (!existsSync(configFilePath())) {
    writeFileSync(configFilePath(), `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8');
  }

  let settings;
  try {
    settings = readSettings();
  } catch (error) {
    console.error(`[cc-usage] ${settingsPath()} is not valid JSON; aborting to avoid data loss.`);
    console.error(`[cc-usage] ${error.message}`);
    process.exit(1);
  }

  const existing = settings.statusLine;
  if (existing && !isOurStatusLine(existing) && !force) {
    console.error('[cc-usage] A different statusLine is already configured.');
    console.error('[cc-usage] Re-run with --force to replace it (your current one is backed up and restored on uninstall).');
    process.exit(2);
  }
  if (existing && !isOurStatusLine(existing) && force) {
    settings[BACKUP_KEY] = existing;
  }

  settings.statusLine = {
    type: 'command',
    command: commandString(),
    padding: 0,
    refreshInterval,
  };
  writeSettingsAtomic(settings);

  console.log('[cc-usage] Status line installed.');
  console.log(`  settings: ${settingsPath()}`);
  console.log(`  script:   ${installedStatuslinePath()}`);
  console.log(`  config:   ${configFilePath()}`);
  console.log(`  refresh:  every ${refreshInterval}s`);
  console.log('[cc-usage] Send a message or start a new prompt to see it.');
}

main();
