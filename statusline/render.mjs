const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

const EFFORT_COLORS = {
  low: ANSI.gray,
  medium: ANSI.cyan,
  high: ANSI.yellow,
  xhigh: ANSI.magenta,
  max: ANSI.magenta,
};

export function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function fmtDuration(seconds) {
  if (seconds == null) return '';
  const total = Math.floor(Number(seconds));
  if (!Number.isFinite(total)) return '';
  if (total <= 0) return 'now';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return `${secs}s`;
}

export function fmtTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e9) {
    const b = n / 1e9;
    return `${b >= 10 ? Math.round(b) : Math.round(b * 10) / 10}B`;
  }
  if (n >= 1e6) {
    const m = n / 1e6;
    return `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
  }
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}

export function bar(pct, width, glyphs) {
  const w = Math.max(1, Math.floor(width));
  const filled = Math.max(0, Math.min(w, Math.round((clampPct(pct) / 100) * w)));
  return glyphs.filled.repeat(filled) + glyphs.empty.repeat(w - filled);
}

function paint(text, codes, enabled) {
  if (!enabled || !codes) return text;
  const prefix = Array.isArray(codes) ? codes.join('') : codes;
  return prefix + text + ANSI.reset;
}

function levelColor(pct, cfg) {
  const p = clampPct(pct);
  if (p >= cfg.critPercent) return ANSI.red;
  if (p >= cfg.warnPercent) return ANSI.yellow;
  return ANSI.green;
}

function computeContextPct(usage, size) {
  const total = Number(size);
  if (!Number.isFinite(total) || total <= 0 || !usage) return null;
  const input = Number(usage.input_tokens) || 0;
  const created = Number(usage.cache_creation_input_tokens) || 0;
  const read = Number(usage.cache_read_input_tokens) || 0;
  return ((input + created + read) / total) * 100;
}

function effortTag(data, enabled) {
  const level = data.effort && data.effort.level;
  if (!level) return '';
  const color = EFFORT_COLORS[level] || ANSI.gray;
  const codes = level === 'max' ? [ANSI.bold, color] : color;
  return paint(`⚡${level}`, codes, enabled);
}

function marquee(text, width, now) {
  if (text.length <= width) return text;
  const full = `${text}   •   `;
  const offset = Math.floor(Number(now) || 0) % full.length;
  return `${full}${full}`.slice(offset, offset + width);
}

function truncateSkills(skills, width) {
  const shown = [];
  let used = 0;
  for (const skill of skills) {
    const cost = (shown.length ? 2 : 0) + skill.length;
    if (used + cost > width) break;
    shown.push(skill);
    used += cost;
  }
  const remaining = skills.length - shown.length;
  let text = shown.join(', ');
  if (remaining > 0) text += `${shown.length ? ' ' : ''}+${remaining}`;
  return text;
}

function skillsSegment(skills, cfg, enabled, now, compact) {
  if (!cfg.showSkills || !skills || !skills.length) return '';
  const icon = paint('🧩', ANSI.gray, enabled);
  if (compact) return `${icon} ${paint(String(skills.length), ANSI.cyan, enabled)}`;
  const joined = skills.join(', ');
  let text;
  if (joined.length <= cfg.skillsWidth) text = joined;
  else if (cfg.skillsMarquee) text = marquee(joined, cfg.skillsWidth, now);
  else text = truncateSkills(skills, cfg.skillsWidth);
  return `${icon} ${paint(text, ANSI.cyan, enabled)}`;
}

function modelSegment(data, cfg, enabled) {
  const name = (data.model && data.model.display_name) || 'Claude';
  const nameText = paint(name, [ANSI.bold, ANSI.cyan], enabled);
  const effort = cfg.showEffort ? effortTag(data, enabled) : '';
  return effort ? `${nameText} ${effort}` : nameText;
}

function costSegment(data, enabled) {
  const cost = data.cost && data.cost.total_cost_usd;
  if (cost == null) return '';
  return paint(`$${Number(cost).toFixed(2)}`, ANSI.gray, enabled);
}

function contextSegment(data, cfg, enabled, compact) {
  const cw = data.context_window || {};
  let pct = cw.used_percentage;
  if (pct == null) pct = computeContextPct(cw.current_usage, cw.context_window_size);
  const label = paint('ctx', ANSI.gray, enabled);
  if (pct == null) return `${label} ${paint('--', ANSI.gray, enabled)}`;
  const value = Math.round(clampPct(pct));
  const color = levelColor(value, cfg);
  const pctText = paint(`${value}%`, color, enabled);
  if (compact) return `${label} ${pctText}`;
  const barText = paint(bar(value, cfg.barWidth, cfg.glyphs), color, enabled);
  const size = Number(cw.context_window_size) || 0;
  const used = Number(cw.total_input_tokens) || 0;
  const tokens = size ? paint(`${fmtTokens(used)}/${fmtTokens(size)}`, ANSI.gray, enabled) : '';
  return `${label} ${barText} ${pctText}${tokens ? ` ${tokens}` : ''}`;
}

function windowSegment(label, win, cfg, enabled, now, compact) {
  if (!win) return '';
  const value = Math.round(clampPct(win.used_percentage));
  const resetsIn = win.resets_at != null ? Number(win.resets_at) - now : null;
  const countdown = resetsIn != null ? fmtDuration(resetsIn) : '';
  if (value >= cfg.limitPercent) {
    const text = `⛔ ${label} ${value}%${countdown ? ` · resets ${countdown}` : ''}`;
    return paint(text, [ANSI.bold, ANSI.red], enabled);
  }
  const labelText = paint(label, ANSI.gray, enabled);
  const color = levelColor(value, cfg);
  const pctText = paint(`${value}%`, color, enabled);
  const countdownText = countdown ? paint(`↻${countdown}`, ANSI.gray, enabled) : '';
  const tail = countdownText ? ` ${countdownText}` : '';
  if (compact) return `${labelText} ${pctText}${tail}`;
  const barText = paint(bar(value, cfg.barWidth, cfg.glyphs), color, enabled);
  return `${labelText} ${barText} ${pctText}${tail}`;
}

function fmtExact(value) {
  return String(Math.round(Number(value) || 0));
}

function tokenLine(tokens, cfg, enabled, compact) {
  if (!tokens) return '';
  const session = cfg.showSessionTokens ? tokens.session : null;
  const month = cfg.showMonthTokens ? tokens.month : null;
  if (!session && !month) return '';

  const gray = (text) => paint(text, ANSI.gray, enabled);
  const cyan = (text) => paint(text, ANSI.cyan, enabled);

  if (compact) {
    const values = [];
    if (session) values.push(cyan(fmtTokens(session.total)));
    if (month) values.push(cyan(fmtTokens(month.total)));
    return `${gray('Σ')} ${values.join(gray('/'))}`;
  }

  const value = (raw) => {
    if (!cfg.exactTokens) return cyan(fmtTokens(raw));
    const exact = fmtExact(raw);
    const abbr = fmtTokens(raw);
    return exact === abbr ? cyan(exact) : `${cyan(exact)} ${gray(`(${abbr})`)}`;
  };
  const separator = gray(' · ');
  const segments = [];

  if (session) {
    segments.push(`${gray('sess')} ${value(session.total)}`);
    if (cfg.tokenBreakdown) {
      segments.push(`${gray('fresh')} ${value(session.fresh)}`);
      segments.push(`${gray('cache')} ${value(session.cache)}`);
    }
  }
  if (month) {
    segments.push(`${gray('mo')} ${value(month.total)}`);
  }

  return `${gray('Σ spent')} ${segments.join(separator)}`;
}

export function renderStatus(data, cfg, now, columns = 0, extra = {}) {
  const enabled = cfg.color;
  const compact = columns > 0 && columns < cfg.compactColumns;
  const separator = paint(' · ', ANSI.gray, enabled);

  const head = [];
  if (cfg.showModel) head.push(modelSegment(data, cfg, enabled));
  if (cfg.showContext) head.push(contextSegment(data, cfg, enabled, compact));
  if (cfg.showCost) {
    const cost = costSegment(data, enabled);
    if (cost) head.push(cost);
  }
  const skills = skillsSegment(extra.skills, cfg, enabled, now, compact);
  if (skills) head.push(skills);
  const headLine = head.filter(Boolean).join(separator);

  const rateLimits = data.rate_limits || {};
  const usage = [];
  if (cfg.showFiveHour && rateLimits.five_hour) {
    usage.push(windowSegment('5h', rateLimits.five_hour, cfg, enabled, now, compact));
  }
  if (cfg.showSevenDay && rateLimits.seven_day) {
    usage.push(windowSegment('7d', rateLimits.seven_day, cfg, enabled, now, compact));
  }
  const usageLine = usage.filter(Boolean).join('   ');

  const lines = [headLine];
  if (usageLine) lines.push(usageLine);
  const tokens = tokenLine(extra.tokens, cfg, enabled, compact);
  if (tokens) lines.push(tokens);

  if (lines.length === 1) return lines[0];
  if (cfg.multiLine && !compact) return lines.join('\n');
  return lines.join(separator);
}
