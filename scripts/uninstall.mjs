import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import {
  readSettings,
  writeSettingsAtomic,
  settingsPath,
  dataDir,
  isOurStatusLine,
  BACKUP_KEY,
} from '../lib/settings.mjs';

const keepFiles = process.argv.includes('--keep-files');

function main() {
  let settings;
  try {
    settings = readSettings();
  } catch (error) {
    console.error(`[cc-usage] ${settingsPath()} is not valid JSON; aborting.`);
    console.error(`[cc-usage] ${error.message}`);
    process.exit(1);
  }

  if (isOurStatusLine(settings.statusLine)) {
    if (settings[BACKUP_KEY]) {
      settings.statusLine = settings[BACKUP_KEY];
      delete settings[BACKUP_KEY];
      console.log('[cc-usage] Restored your previous statusLine.');
    } else {
      delete settings.statusLine;
      console.log('[cc-usage] Removed cc-usage statusLine from settings.');
    }
    writeSettingsAtomic(settings);
  } else {
    console.log('[cc-usage] cc-usage statusLine is not active; left settings untouched.');
  }

  const scriptDir = join(dataDir(), 'statusline');
  if (!keepFiles && existsSync(scriptDir)) {
    rmSync(scriptDir, { recursive: true, force: true });
    console.log(`[cc-usage] Removed installed scripts (${scriptDir}). Your config.json was kept.`);
  }

  console.log('[cc-usage] Send a message or restart to apply.');
}

main();
