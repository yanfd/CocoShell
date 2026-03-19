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

// Strip ANSI escape sequences for classification, but keep for passthrough
function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[\d;]*[A-Za-z]|\x1B[()][AB012]|\x1B[=>]/g, '');
}

// Detect if a line is purely a terminal control sequence (cursor movement, clear, etc.)
const CONTROL_ONLY_RE = /^(\x1B\[[\d;]*[A-Za-z]|\x1B[()][AB012]|\r|\x1B[=>])*$/;

function flushLine(raw: string) {
  const clean = stripAnsi(raw);

  // Pass through blank lines and pure control sequences without classifying
  if (clean.trim() === '' || CONTROL_ONLY_RE.test(raw)) {
    if (spinner.isActive()) spinner.stop();
    if (clean.trim() !== '') process.stdout.write(raw + '\n');
    resetSilenceTimer();
    return;
  }

  if (spinner.isActive()) spinner.stop();
  if (silenceTimer) clearTimeout(silenceTimer);

  const { rendered } = parseLine(clean);
  console.log('  ' + rendered);

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

  buf += data;
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    flushLine(line);
  }
});

child.onExit(({ exitCode }: { exitCode: number }) => {
  if (buf.length > 0) flushLine(buf);
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
