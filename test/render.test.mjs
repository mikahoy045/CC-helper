import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDuration, fmtTokens, bar, clampPct, renderStatus } from '../statusline/render.mjs';
import { resolveConfig } from '../statusline/config.mjs';
import { sumEntries, deriveTotals } from '../statusline/tokens.mjs';
import { extractSkills } from '../statusline/skills.mjs';

const plainConfig = resolveConfig({ CC_USAGE_NO_COLOR: '1' });
const NOW = 1_700_000_000;

test('clampPct bounds values and handles junk', () => {
  assert.equal(clampPct(-5), 0);
  assert.equal(clampPct(150), 100);
  assert.equal(clampPct('42'), 42);
  assert.equal(clampPct('nope'), 0);
});

test('fmtDuration formats every magnitude', () => {
  assert.equal(fmtDuration(0), 'now');
  assert.equal(fmtDuration(-10), 'now');
  assert.equal(fmtDuration(45), '45s');
  assert.equal(fmtDuration(90), '1m');
  assert.equal(fmtDuration(3 * 3600 + 25 * 60), '3h 25m');
  assert.equal(fmtDuration(5 * 86400 + 3 * 3600), '5d 3h');
  assert.equal(fmtDuration(null), '');
});

test('fmtTokens uses k and M suffixes', () => {
  assert.equal(fmtTokens(0), '0');
  assert.equal(fmtTokens(950), '950');
  assert.equal(fmtTokens(68000), '68k');
  assert.equal(fmtTokens(200000), '200k');
  assert.equal(fmtTokens(1000000), '1M');
  assert.equal(fmtTokens(1250000), '1.3M');
  assert.equal(fmtTokens(45000000), '45M');
  assert.equal(fmtTokens(1350000000), '1.4B');
});

test('bar fills proportionally', () => {
  const glyphs = { filled: '#', empty: '-' };
  assert.equal(bar(0, 10, glyphs), '----------');
  assert.equal(bar(100, 10, glyphs), '##########');
  assert.equal(bar(50, 10, glyphs), '#####-----');
});

test('renderStatus shows context and both rate-limit windows', () => {
  const data = {
    model: { display_name: 'Opus' },
    context_window: { used_percentage: 34, context_window_size: 200000, total_input_tokens: 68000 },
    rate_limits: {
      five_hour: { used_percentage: 22, resets_at: NOW + 88 * 60 },
      seven_day: { used_percentage: 41, resets_at: NOW + (5 * 86400 + 3 * 3600) },
    },
  };
  const out = renderStatus(data, plainConfig, NOW, 200);
  const [line1, line2] = out.split('\n');
  assert.match(line1, /Opus/);
  assert.match(line1, /ctx/);
  assert.match(line1, /34%/);
  assert.match(line1, /68k\/200k/);
  assert.match(line2, /5h/);
  assert.match(line2, /22%/);
  assert.match(line2, /↻1h 28m/);
  assert.match(line2, /7d/);
  assert.match(line2, /↻5d 3h/);
});

test('renderStatus flags a reached rate limit with a reset countdown', () => {
  const data = {
    model: { display_name: 'Opus' },
    context_window: { used_percentage: 80, context_window_size: 200000, total_input_tokens: 160000 },
    rate_limits: {
      five_hour: { used_percentage: 100, resets_at: NOW + 42 * 60 },
    },
  };
  const out = renderStatus(data, plainConfig, NOW, 200);
  assert.match(out, /⛔ 5h 100% · resets 42m/);
});

test('renderStatus shows the effort indicator when present', () => {
  const data = {
    model: { display_name: 'Opus' },
    effort: { level: 'high' },
    context_window: { used_percentage: 20, context_window_size: 200000, total_input_tokens: 40000 },
  };
  const out = renderStatus(data, plainConfig, NOW, 200);
  assert.match(out, /Opus ⚡high/);
});

test('renderStatus omits the effort indicator when effort is absent', () => {
  const data = {
    model: { display_name: 'Opus' },
    context_window: { used_percentage: 20, context_window_size: 200000, total_input_tokens: 40000 },
  };
  const out = renderStatus(data, plainConfig, NOW, 200);
  assert.equal(out.includes('⚡'), false);
});

test('renderStatus omits the effort indicator when showEffort is false', () => {
  const data = {
    model: { display_name: 'Opus' },
    effort: { level: 'high' },
    context_window: { used_percentage: 20, context_window_size: 200000, total_input_tokens: 40000 },
  };
  const noEffort = resolveConfig({ CC_USAGE_NO_COLOR: '1', CC_USAGE_SHOW_EFFORT: '0' });
  const out = renderStatus(data, noEffort, NOW, 200);
  assert.equal(out.includes('⚡'), false);
});

test('renderStatus omits usage line when rate_limits are absent', () => {
  const data = {
    model: { display_name: 'Sonnet' },
    context_window: { used_percentage: 12, context_window_size: 200000, total_input_tokens: 24000 },
  };
  const out = renderStatus(data, plainConfig, NOW, 200);
  assert.equal(out.includes('\n'), false);
  assert.match(out, /Sonnet/);
  assert.match(out, /12%/);
});

test('renderStatus falls back to current_usage when used_percentage is missing', () => {
  const data = {
    model: { display_name: 'Opus' },
    context_window: {
      context_window_size: 200000,
      current_usage: { input_tokens: 40000, cache_creation_input_tokens: 10000, cache_read_input_tokens: 50000 },
    },
  };
  const out = renderStatus(data, plainConfig, NOW, 200);
  assert.match(out, /ctx/);
  assert.match(out, /50%/);
});

test('renderStatus shows -- when context is unknown', () => {
  const out = renderStatus({ model: { display_name: 'Opus' } }, plainConfig, NOW, 200);
  assert.match(out, /ctx --/);
});

const sampleTokens = {
  session: deriveTotals({ input: 100, output: 10, cacheCreate: 20, cacheRead: 30 }),
  month: deriveTotals({ input: 4200000, output: 1800000, cacheCreate: 5200000, cacheRead: 33800000 }),
};

test('renderStatus shows exact session digits with fresh/cache breakdown', () => {
  const data = {
    model: { display_name: 'Opus' },
    context_window: { used_percentage: 40, context_window_size: 200000, total_input_tokens: 80000 },
  };
  const out = renderStatus(data, plainConfig, NOW, 200, { tokens: sampleTokens });
  const spent = out.split('\n').pop();
  assert.match(spent, /Σ spent/);
  assert.match(spent, /sess 160/);
  assert.match(spent, /fresh 130/);
  assert.match(spent, /cache 30/);
  assert.match(spent, /mo 45000000 \(45M\)/);
});

test('renderStatus abbreviates tokens when exactTokens is off', () => {
  const cfg = resolveConfig({ CC_USAGE_NO_COLOR: '1', CC_USAGE_EXACT_TOKENS: '0' });
  const data = { model: { display_name: 'Opus' }, context_window: { used_percentage: 40, context_window_size: 200000 } };
  const out = renderStatus(data, cfg, NOW, 200, { tokens: sampleTokens });
  assert.match(out, /mo 45M/);
});

test('renderStatus drops the breakdown when tokenBreakdown is off', () => {
  const cfg = resolveConfig({ CC_USAGE_NO_COLOR: '1', CC_USAGE_TOKEN_BREAKDOWN: '0' });
  const data = { model: { display_name: 'Opus' }, context_window: { used_percentage: 40, context_window_size: 200000 } };
  const out = renderStatus(data, cfg, NOW, 200, { tokens: sampleTokens });
  const spent = out.split('\n').pop();
  assert.equal(spent.includes('fresh'), false);
  assert.match(spent, /sess 160/);
});

test('renderStatus omits token line when totals are null', () => {
  const data = { model: { display_name: 'Opus' }, context_window: { used_percentage: 40, context_window_size: 200000 } };
  const out = renderStatus(data, plainConfig, NOW, 200, { tokens: { session: null, month: null } });
  assert.equal(out.includes('Σ'), false);
});

test('deriveTotals splits fresh (billed) from cache reads', () => {
  const totals = deriveTotals({ input: 100, output: 10, cacheCreate: 20, cacheRead: 30 });
  assert.equal(totals.fresh, 130);
  assert.equal(totals.cache, 30);
  assert.equal(totals.total, 160);
});

test('sumEntries sums token fields and dedupes by message id + requestId', () => {
  const line = JSON.stringify({
    type: 'assistant',
    requestId: 'req_1',
    timestamp: '2026-06-16T15:54:41.124Z',
    message: { id: 'msg_1', usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30 } },
  });
  const other = JSON.stringify({
    type: 'assistant',
    requestId: 'req_2',
    timestamp: '2026-06-16T15:55:00.000Z',
    message: { id: 'msg_2', usage: { input_tokens: 5, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
  });
  const text = [line, line, other].join('\n');
  const c = sumEntries(text, null);
  assert.deepEqual(c, { input: 105, output: 15, cacheCreate: 20, cacheRead: 30 });
  assert.equal(deriveTotals(c).total, 170);
});

test('sumEntries filters entries before the since timestamp', () => {
  const old = JSON.stringify({
    type: 'assistant',
    requestId: 'req_old',
    timestamp: '2026-05-31T23:00:00.000Z',
    message: { id: 'msg_old', usage: { input_tokens: 1000, output_tokens: 0 } },
  });
  const recent = JSON.stringify({
    type: 'assistant',
    requestId: 'req_new',
    timestamp: '2026-06-02T10:00:00.000Z',
    message: { id: 'msg_new', usage: { input_tokens: 7, output_tokens: 3 } },
  });
  const since = Date.parse('2026-06-01T00:00:00.000Z');
  assert.equal(deriveTotals(sumEntries([old, recent].join('\n'), since)).total, 10);
});

test('sumEntries ignores non-assistant and malformed lines', () => {
  const user = JSON.stringify({ type: 'user', message: { content: 'hi' } });
  const broken = '{not json';
  const assistant = JSON.stringify({
    type: 'assistant',
    requestId: 'r',
    message: { id: 'm', usage: { input_tokens: 42, output_tokens: 0 } },
  });
  assert.equal(deriveTotals(sumEntries([user, broken, assistant].join('\n'), null)).total, 42);
});

test('renderStatus shows invoked skills on the first line', () => {
  const data = { model: { display_name: 'Opus' }, context_window: { used_percentage: 28, context_window_size: 200000, total_input_tokens: 56000 } };
  const out = renderStatus(data, plainConfig, NOW, 200, { skills: ['web-search', 'context-engine'] });
  const first = out.split('\n')[0];
  assert.match(first, /🧩 web-search, context-engine/);
});

test('renderStatus omits the skills segment when none are loaded', () => {
  const data = { model: { display_name: 'Opus' }, context_window: { used_percentage: 28, context_window_size: 200000 } };
  const out = renderStatus(data, plainConfig, NOW, 200, { skills: [] });
  assert.equal(out.includes('🧩'), false);
});

test('skills marquee keeps within the configured width and advances over time', () => {
  const cfg = resolveConfig({ CC_USAGE_NO_COLOR: '1', CC_USAGE_SKILLS_WIDTH: '12' });
  const many = ['alpha-skill', 'beta-skill', 'gamma-skill', 'delta-skill'];
  const data = { model: { display_name: 'Opus' }, context_window: { used_percentage: 10, context_window_size: 200000 } };
  const at0 = renderStatus(data, cfg, 0, 200, { skills: many }).split('\n')[0];
  const at5 = renderStatus(data, cfg, 5, 200, { skills: many }).split('\n')[0];
  const window0 = at0.split('🧩 ')[1];
  const window5 = at5.split('🧩 ')[1];
  assert.equal(window0.length, 12);
  assert.notEqual(window0, window5);
});

test('skills truncate with a +N count when marquee is disabled', () => {
  const cfg = resolveConfig({ CC_USAGE_NO_COLOR: '1', CC_USAGE_SKILLS_WIDTH: '20', CC_USAGE_SKILLS_MARQUEE: '0' });
  const data = { model: { display_name: 'Opus' }, context_window: { used_percentage: 10, context_window_size: 200000 } };
  const out = renderStatus(data, cfg, NOW, 200, { skills: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'] });
  assert.match(out, /\+\d/);
});

test('extractSkills collects unique Skill invocations, most recent first', () => {
  const mk = (skill, id) => JSON.stringify({
    type: 'assistant',
    requestId: id,
    message: { id: `m-${id}`, content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] },
  });
  const noise = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } });
  const text = [mk('context-engine', 'a'), noise, mk('web-search', 'b'), mk('context-engine', 'c')].join('\n');
  assert.deepEqual(extractSkills(text), ['context-engine', 'web-search']);
});

test('compact mode drops bars on narrow terminals', () => {
  const data = {
    model: { display_name: 'Opus' },
    context_window: { used_percentage: 34, context_window_size: 200000, total_input_tokens: 68000 },
    rate_limits: { five_hour: { used_percentage: 22, resets_at: NOW + 60 } },
  };
  const out = renderStatus(data, plainConfig, NOW, 40);
  assert.equal(out.includes('█'), false);
  assert.equal(out.includes('\n'), false);
  assert.match(out, /34%/);
});
