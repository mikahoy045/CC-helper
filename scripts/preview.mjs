import { resolveConfig } from '../statusline/config.mjs';
import { renderStatus } from '../statusline/render.mjs';
import { deriveTotals } from '../statusline/tokens.mjs';

const now = Math.floor(Date.now() / 1000);
const config = resolveConfig(process.env);

const scenarios = [
  {
    title: 'Healthy session',
    data: {
      model: { display_name: 'Opus' },
      effort: { level: 'high' },
      context_window: { used_percentage: 34, context_window_size: 200000, total_input_tokens: 68000 },
      rate_limits: {
        five_hour: { used_percentage: 22, resets_at: now + 88 * 60 },
        seven_day: { used_percentage: 41, resets_at: now + (5 * 86400 + 3 * 3600) },
      },
    },
  },
  {
    title: 'Approaching limits',
    data: {
      model: { display_name: 'Opus' },
      context_window: { used_percentage: 78, context_window_size: 200000, total_input_tokens: 156000 },
      rate_limits: {
        five_hour: { used_percentage: 84, resets_at: now + 42 * 60 },
        seven_day: { used_percentage: 73, resets_at: now + (2 * 86400 + 6 * 3600) },
      },
    },
  },
  {
    title: 'Rate limit reached',
    data: {
      model: { display_name: 'Opus' },
      effort: { level: 'max' },
      context_window: { used_percentage: 91, context_window_size: 1000000, total_input_tokens: 910000 },
      rate_limits: {
        five_hour: { used_percentage: 100, resets_at: now + 88 * 60 },
        seven_day: { used_percentage: 96, resets_at: now + (1 * 86400 + 4 * 3600) },
      },
    },
  },
  {
    title: 'No subscription rate limits (context only)',
    data: {
      model: { display_name: 'Sonnet' },
      context_window: { used_percentage: 12, context_window_size: 200000, total_input_tokens: 24000 },
    },
  },
];

const sampleTokens = [
  { session: deriveTotals({ input: 180000, output: 95000, cacheCreate: 220000, cacheRead: 745432 }), month: deriveTotals({ input: 4200000, output: 1800000, cacheCreate: 5200000, cacheRead: 33800000 }) },
  { session: deriveTotals({ input: 520000, output: 240000, cacheCreate: 610000, cacheRead: 5430000 }), month: deriveTotals({ input: 8100000, output: 3200000, cacheCreate: 9700000, cacheRead: 71000000 }) },
  { session: deriveTotals({ input: 1100000, output: 480000, cacheCreate: 1300000, cacheRead: 15620000 }), month: deriveTotals({ input: 95000000, output: 38000000, cacheCreate: 117000000, cacheRead: 1100000000 }) },
  { session: deriveTotals({ input: 32000, output: 18000, cacheCreate: 41000, cacheRead: 149000 }), month: deriveTotals({ input: 280000, output: 120000, cacheCreate: 350000, cacheRead: 2350000 }) },
];

for (const [index, scenario] of scenarios.entries()) {
  console.log(`\n  ${scenario.title}`);
  const columns = Number(process.env.COLUMNS) || 0;
  const rendered = renderStatus(scenario.data, config, now, columns, { tokens: sampleTokens[index] });
  for (const line of rendered.split('\n')) {
    console.log(`    ${line}`);
  }
}
console.log('');
