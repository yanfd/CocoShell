import chalk from 'chalk';
import { theme } from './theme.js';

export type LineType = 'success' | 'error' | 'warn' | 'info' | 'progress' | 'kv' | 'plain';

export interface ParsedLine {
  type: LineType;
  dot: string;   // colored ⏺
  rendered: string;
}

const EMOJI_RE = /^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}✅❌⚠️🔴🟡🟢📂📝🔄🚀🔗⭐️\uFE0F✨]+\s*/u;
const HAS_EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}📂📝🔄🚀🔗✨]/u;
const ALREADY_PREFIXED_RE = /^[✓✗⚠ℹ·→]/;

const SUCCESS_RE = /\b(success|succeed|succeeded|done|complete|completed|finish|finished|ok|passed|built|compiled|uploaded|deployed|installed|created|found|ready|推送成功|已保存|已完成)\b/i;
const ERROR_RE = /\b(error|err|fail|failed|failure|fatal|exception|abort|aborted|crash|crashed|not found|no such file|permission denied|ENOENT|EACCES|EPERM)\b/i;
const WARN_RE = /\b(warn|warning|deprecated|caution|notice|skip|skipped|ignored|未检测到|自动合并失败)\b/i;
const INFO_RE = /^(info|note|hint|tip|\[info\]|\[note\])\b/i;
const PROGRESS_RE = /\[(=+>?-*)\]\s*(\d+)%?|\b(\d+)%\s*(done|complete|of|\/)|(downloading|uploading|progress).*\d+%/i;
const KV_RE = /^([\w\- .\u4e00-\u9fff]+?)[:=]\s*(.+)$/;

const DOTS: Record<LineType, string> = {
  success:  chalk.hex(theme.colors.success)('⏺'),
  error:    chalk.hex(theme.colors.error)('⏺'),
  warn:     chalk.hex(theme.colors.warn)('⏺'),
  info:     chalk.hex(theme.colors.info)('⏺'),
  progress: chalk.hex(theme.colors.accent)('⏺'),
  kv:       chalk.hex(theme.colors.dim)('⏺'),
  plain:    chalk.hex(theme.colors.dim)('⏺'),
};

function renderBadge(key: string, value: string): string {
  return chalk.hex(theme.colors.dim)(key) +
    chalk.hex(theme.colors.border)('=') +
    chalk.hex(theme.colors.accent)(value);
}

export function parseLine(raw: string): ParsedLine {
  const line = raw.trimEnd();

  if (ALREADY_PREFIXED_RE.test(line.trim())) {
    return { type: 'plain', dot: DOTS.plain, rendered: chalk.hex(theme.colors.muted)(line) };
  }

  const stripped = line.replace(EMOJI_RE, '').trim();

  if (PROGRESS_RE.test(stripped)) {
    return { type: 'progress', dot: DOTS.progress, rendered: renderProgress(line) };
  }

  if (ERROR_RE.test(stripped)) {
    return {
      type: 'error',
      dot: DOTS.error,
      rendered: chalk.hex(theme.colors.error)(line),
    };
  }

  if (SUCCESS_RE.test(stripped)) {
    return {
      type: 'success',
      dot: DOTS.success,
      rendered: chalk.hex(theme.colors.success)(line),
    };
  }

  if (WARN_RE.test(stripped)) {
    return {
      type: 'warn',
      dot: DOTS.warn,
      rendered: chalk.hex(theme.colors.warn)(line),
    };
  }

  if (INFO_RE.test(stripped)) {
    return {
      type: 'info',
      dot: DOTS.info,
      rendered: chalk.hex(theme.colors.info)(line),
    };
  }

  const kvm = stripped.match(KV_RE);
  if (kvm && kvm[1].length < 30 && !stripped.startsWith(' ') && !HAS_EMOJI_RE.test(line)) {
    const prefix = line.slice(0, line.length - stripped.length);
    return {
      type: 'kv',
      dot: DOTS.kv,
      rendered: prefix + renderBadge(kvm[1].trim(), kvm[2].trim()),
    };
  }

  return {
    type: 'plain',
    dot: DOTS.plain,
    rendered: chalk.hex(theme.colors.muted)(line),
  };
}

function renderProgress(line: string): string {
  const pctMatch = line.match(/(\d+)%/);
  if (pctMatch) {
    const pct = Math.min(100, parseInt(pctMatch[1], 10));
    const width = 20;
    const filled = Math.round((pct / 100) * width);
    const bar =
      chalk.hex(theme.colors.success)('█'.repeat(filled)) +
      chalk.hex(theme.colors.dim)('░'.repeat(width - filled));
    const label = chalk.hex(theme.colors.accent)(`${pct}%`);
    const rest = line.replace(/(\d+)%.*/, '').trim();
    return `${chalk.hex(theme.colors.muted)(rest)} ${bar} ${label}`;
  }
  return chalk.hex(theme.colors.muted)(line);
}
