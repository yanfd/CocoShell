#!/usr/bin/env node
import * as pty from 'node-pty';
import { resolve, extname, basename } from 'path';
import chalk from 'chalk';
import { parseLine } from './renderer.js';
import { Spinner } from './spinner.js';
import { printHeader, printFooter } from './header.js';
import { theme } from './theme.js';

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
  ${chalk.bold.white('cocoshell')} ${chalk.hex(theme.colors.dim)('<script> [args...]')}

  Runs any script with beautiful terminal output.

  ${chalk.hex(theme.colors.accent)('Examples:')}
    cocoshell ./deploy.sh
    cocoshell python3 build.py --env prod
    cocoshell npm run build
  `);
  process.exit(0);
}

const [scriptArg, ...scriptArgs] = args;
const ext = extname(scriptArg).toLowerCase();

function buildCommand(script: string, rest: string[]): { cmd: string; cmdArgs: string[] } {
  const resolved = resolve(script);
  if (ext === '.py') return { cmd: 'python3', cmdArgs: [resolved, ...rest] };
  if (ext === '.js' || ext === '.mjs') return { cmd: 'node', cmdArgs: [resolved, ...rest] };
  if (ext === '.ts') return { cmd: 'npx', cmdArgs: ['tsx', resolved, ...rest] };
  if (ext === '.rb') return { cmd: 'ruby', cmdArgs: [resolved, ...rest] };
  if (ext === '.sh' || ext === '.zsh' || ext === '.bash') {
    return { cmd: 'bash', cmdArgs: [resolved, ...rest] };
  }
  return { cmd: script, cmdArgs: [...rest] };
}

const { cmd, cmdArgs } = buildCommand(scriptArg, scriptArgs);

printHeader(scriptArg, scriptArgs);

const spinner = new Spinner();
let silenceTimer: NodeJS.Timeout | null = null;
const startTime = Date.now();

function resetSilenceTimer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    if (process.stdout.isTTY) spinner.start('working...');
  }, theme.silenceThreshold);
}

function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[\d;]*[A-Za-z]|\x1B[()][AB012]|\x1B[=>]/g, '');
}

const CONTROL_ONLY_RE = /^(\x1B\[[\d;]*[A-Za-z]|\x1B[()][AB012]|\r|\x1B[=>])*$/;

// Visual width of a string (accounts for wide chars like CJK/emoji = 2 cols)
function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    // CJK, emoji, wide blocks
    if (
      (cp >= 0x1100 && cp <= 0x115F) ||
      (cp >= 0x2E80 && cp <= 0x303E) ||
      (cp >= 0x3040 && cp <= 0xA4CF) ||
      (cp >= 0xAC00 && cp <= 0xD7A3) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE10 && cp <= 0xFE1F) ||
      (cp >= 0xFE30 && cp <= 0xFE4F) ||
      (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0xFFE0 && cp <= 0xFFE6) ||
      (cp >= 0x1F300 && cp <= 0x1FBFF)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

// Wrap a plain string to maxWidth, return array of lines
function wrapText(text: string, maxWidth: number): string[] {
  if (visualWidth(text) <= maxWidth) return [text];
  const lines: string[] = [];
  let cur = '';
  let curW = 0;
  for (const ch of text) {
    const cw = visualWidth(ch);
    if (curW + cw > maxWidth) {
      lines.push(cur);
      cur = ch;
      curW = cw;
    } else {
      cur += ch;
      curW += cw;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function getWidth(): number {
  return Math.min(process.stdout.columns || 80, 100);
}

// │ ⏺ <content>  — content area width = WIDTH - 2(border+space) - 3(dot+spaces)
function printFormattedLine(dot: string, rendered: string, clean: string) {
  const WIDTH = getWidth();
  const CONTENT_WIDTH = WIDTH - 6;
  const border = chalk.hex(theme.colors.border)('│');

  const wrapped = wrapText(clean, CONTENT_WIDTH);
  wrapped.forEach((seg, i) => {
    if (i === 0) {
      // Re-classify and render only the first segment (truncated clean text)
      const { rendered: r } = parseLine(seg);
      console.log(`${border} ${dot} ${r}`);
    } else {
      console.log(`${border}    ${chalk.hex(theme.colors.muted)(seg)}`);
    }
  });
}

function flushLine(raw: string) {
  const clean = stripAnsi(raw);

  if (clean.trim() === '' || CONTROL_ONLY_RE.test(raw)) {
    if (spinner.isActive()) spinner.stop();
    resetSilenceTimer();
    return;
  }

  if (spinner.isActive()) spinner.stop();
  if (silenceTimer) clearTimeout(silenceTimer);

  const { dot, rendered } = parseLine(clean);
  printFormattedLine(dot, rendered, clean);

  resetSilenceTimer();
}

resetSilenceTimer();

const cols = process.stdout.columns || 200;
const rows = process.stdout.rows || 40;

const child = pty.spawn(cmd, cmdArgs, {
  name: 'xterm-256color',
  cols,
  rows,
  cwd: process.cwd(),
  env: process.env as { [key: string]: string },
});

let buf = '';
let passthroughMode = false;
// currentLine simulates terminal line buffer for \r overwrite behavior
let currentLine = '';

function processChunk(data: string) {
  let i = 0;
  while (i < data.length) {
    const ch = data[i];
    if (ch === '\n') {
      flushLine(currentLine);
      currentLine = '';
      i++;
    } else if (ch === '\r') {
      // Check if followed by \n (Windows CRLF)
      if (data[i + 1] === '\n') {
        flushLine(currentLine);
        currentLine = '';
        i += 2;
      } else {
        // Pure \r: overwrite current line (git progress style)
        // Flush the current line as a progress update, then reset
        const clean = stripAnsi(currentLine).trim();
        if (clean) {
          // Only keep last \r-overwritten version — overwrite in place
          currentLine = '';
        }
        i++;
      }
    } else {
      currentLine += ch;
      i++;
    }
  }
}

child.onData((data: string) => {
  // Detect alternate screen (full-screen TUI like vim, fzf, etc.)
  if (data.includes('\x1b[?1049h')) {
    passthroughMode = true;
    if (spinner.isActive()) spinner.stop();
    if (silenceTimer) clearTimeout(silenceTimer);
  }
  if (data.includes('\x1b[?1049l')) {
    passthroughMode = false;
    resetSilenceTimer();
  }

  if (passthroughMode) {
    process.stdout.write(data);
    return;
  }

  processChunk(data);
});

child.onExit(({ exitCode }: { exitCode: number }) => {
  if (currentLine.trim()) flushLine(currentLine);
  if (spinner.isActive()) spinner.stop();
  if (silenceTimer) clearTimeout(silenceTimer);

  const duration = Date.now() - startTime;
  printFooter(exitCode, duration);
  process.exit(exitCode);
});

// Forward stdin to child (supports interactive prompts)
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on('data', (data: Buffer) => {
  child.write(data.toString());
});

process.on('SIGWINCH', () => {
  child.resize(process.stdout.columns || 80, process.stdout.rows || 40);
});
