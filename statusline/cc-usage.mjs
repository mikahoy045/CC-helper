#!/usr/bin/env node
import { resolveConfig } from './config.mjs';
import { renderStatus } from './render.mjs';
import { collectTokenUsage } from './tokens.mjs';

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let raw = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(raw);
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    setTimeout(finish, 1000).unref?.();
  });
}

async function main() {
  let data = {};
  try {
    const raw = await readStdin();
    if (raw && raw.trim()) data = JSON.parse(raw);
  } catch {
    data = {};
  }

  try {
    const config = resolveConfig(process.env);
    const now = Math.floor(Date.now() / 1000);
    const columns = Number(process.env.COLUMNS) || 0;
    const tokens = collectTokenUsage(process.env, data, now, {
      session: config.showSessionTokens,
      month: config.showMonthTokens,
    });
    const output = renderStatus(data, config, now, columns, { tokens });
    process.stdout.write(`${output}\n`);
  } catch {
    const name = (data.model && data.model.display_name) || 'Claude';
    process.stdout.write(`${name}\n`);
  }
}

main();
