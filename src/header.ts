import chalk from 'chalk';
import { theme } from './theme.js';
import { resolve, basename } from 'path';

function getWidth(): number {
  return Math.min(process.stdout.columns || 80, 100);
}

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[\d;]*m/g, '');
}

function pad(str: string, width: number): string {
  const len = stripAnsi(str).length;
  return str + ' '.repeat(Math.max(0, width - len));
}

export function printHeader(scriptPath: string, args: string[]) {
  const WIDTH = getWidth();
  const name = basename(resolve(scriptPath));
  const argStr = args.length ? chalk.hex(theme.colors.dim)(` ${args.join(' ')}`) : '';
  const title = chalk.bold.white(name) + argStr;
  const time = chalk.hex(theme.colors.dim)(new Date().toLocaleTimeString());

  const top = chalk.hex(theme.colors.border)('╭' + '─'.repeat(WIDTH - 2) + '╮');
  const titleLine =
    chalk.hex(theme.colors.border)('│') +
    ' ' +
    pad(title, WIDTH - 2 - stripAnsi(time).length - 1) +
    time +
    ' ' +
    chalk.hex(theme.colors.border)('│');
  const sep = chalk.hex(theme.colors.border)('├' + '─'.repeat(WIDTH - 2) + '┤');

  console.log();
  console.log(top);
  console.log(titleLine);
  console.log(sep);
}

export function printFooter(exitCode: number, durationMs: number) {
  const WIDTH = getWidth();
  const status =
    exitCode === 0
      ? chalk.hex(theme.colors.success)(`${theme.symbols.success} Exited successfully`)
      : chalk.hex(theme.colors.error)(`${theme.symbols.error} Exited with code ${exitCode}`);
  const dur = chalk.hex(theme.colors.dim)(`${(durationMs / 1000).toFixed(2)}s`);

  const sep = chalk.hex(theme.colors.border)('├' + '─'.repeat(WIDTH - 2) + '┤');
  const footerLine =
    chalk.hex(theme.colors.border)('│') +
    ' ' +
    pad(status, WIDTH - 2 - stripAnsi(dur).length - 1) +
    dur +
    ' ' +
    chalk.hex(theme.colors.border)('│');
  const bottom = chalk.hex(theme.colors.border)('╰' + '─'.repeat(WIDTH - 2) + '╯');

  console.log(sep);
  console.log(footerLine);
  console.log(bottom);
  console.log();
}
