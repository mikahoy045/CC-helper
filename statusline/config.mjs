import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULTS = {
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
  showSkills: true,
  skillsWidth: 32,
  skillsMarquee: true,
  showCost: false,
  warnPercent: 70,
  critPercent: 90,
  limitPercent: 95,
  compactColumns: 80,
};

const STYLES = {
  blocks: { filled: '█', empty: '░' },
  shade: { filled: '▓', empty: '░' },
  pipes: { filled: '|', empty: ' ' },
  ascii: { filled: '#', empty: '-' },
};

const BOOL_KEYS = ['color', 'multiLine', 'showModel', 'showEffort', 'showContext', 'showFiveHour', 'showSevenDay', 'showSessionTokens', 'showMonthTokens', 'tokenBreakdown', 'exactTokens', 'showSkills', 'skillsMarquee', 'showCost'];
const NUMBER_KEYS = ['barWidth', 'warnPercent', 'critPercent', 'limitPercent', 'compactColumns', 'skillsWidth'];

function configDir(env) {
  return env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

function configPath(env) {
  return env.CC_USAGE_CONFIG || join(configDir(env), 'cc-usage', 'config.json');
}

function loadFile(env) {
  try {
    const path = configPath(env);
    if (!existsSync(path)) return {};
    const raw = readFileSync(path, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function sanitize(source) {
  const result = {};
  if (typeof source.style === 'string') result.style = source.style;
  for (const key of BOOL_KEYS) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  for (const key of NUMBER_KEYS) {
    if (Number.isFinite(Number(source[key]))) result[key] = Number(source[key]);
  }
  return result;
}

function readBool(value, fallback) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function envOverrides(env) {
  const overrides = {};
  if (env.CC_USAGE_STYLE) overrides.style = env.CC_USAGE_STYLE;
  if (env.CC_USAGE_BAR_WIDTH) overrides.barWidth = Number(env.CC_USAGE_BAR_WIDTH);
  if (env.CC_USAGE_SINGLE_LINE != null) overrides.multiLine = !readBool(env.CC_USAGE_SINGLE_LINE, false);
  if (env.CC_USAGE_SHOW_COST != null) overrides.showCost = readBool(env.CC_USAGE_SHOW_COST, false);
  if (env.CC_USAGE_SHOW_EFFORT != null) overrides.showEffort = readBool(env.CC_USAGE_SHOW_EFFORT, true);
  if (env.CC_USAGE_SHOW_SESSION_TOKENS != null) overrides.showSessionTokens = readBool(env.CC_USAGE_SHOW_SESSION_TOKENS, true);
  if (env.CC_USAGE_SHOW_MONTH_TOKENS != null) overrides.showMonthTokens = readBool(env.CC_USAGE_SHOW_MONTH_TOKENS, true);
  if (env.CC_USAGE_TOKEN_BREAKDOWN != null) overrides.tokenBreakdown = readBool(env.CC_USAGE_TOKEN_BREAKDOWN, true);
  if (env.CC_USAGE_EXACT_TOKENS != null) overrides.exactTokens = readBool(env.CC_USAGE_EXACT_TOKENS, true);
  if (env.CC_USAGE_SHOW_SKILLS != null) overrides.showSkills = readBool(env.CC_USAGE_SHOW_SKILLS, true);
  if (env.CC_USAGE_SKILLS_WIDTH) overrides.skillsWidth = Number(env.CC_USAGE_SKILLS_WIDTH);
  if (env.CC_USAGE_SKILLS_MARQUEE != null) overrides.skillsMarquee = readBool(env.CC_USAGE_SKILLS_MARQUEE, true);
  if (env.NO_COLOR) overrides.color = false;
  if (readBool(env.CC_USAGE_NO_COLOR, false)) overrides.color = false;
  return overrides;
}

function clampInt(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function resolveConfig(env = process.env) {
  const merged = { ...DEFAULTS, ...sanitize(loadFile(env)), ...envOverrides(env) };
  const style = STYLES[merged.style] ? merged.style : DEFAULTS.style;
  merged.glyphs = STYLES[style];
  merged.barWidth = clampInt(merged.barWidth, 1, 40, DEFAULTS.barWidth);
  merged.warnPercent = clampInt(merged.warnPercent, 0, 100, DEFAULTS.warnPercent);
  merged.critPercent = clampInt(merged.critPercent, 0, 100, DEFAULTS.critPercent);
  merged.limitPercent = clampInt(merged.limitPercent, 0, 100, DEFAULTS.limitPercent);
  merged.compactColumns = clampInt(merged.compactColumns, 0, 500, DEFAULTS.compactColumns);
  merged.skillsWidth = clampInt(merged.skillsWidth, 6, 200, DEFAULTS.skillsWidth);
  return merged;
}

export { DEFAULTS, STYLES };
