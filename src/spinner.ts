import chalk from 'chalk';
import { theme } from './theme.js';

export class Spinner {
  private frame = 0;
  private timer: NodeJS.Timeout | null = null;
  private message = '';
  private active = false;

  start(msg: string) {
    this.message = msg;
    this.active = true;
    this.frame = 0;
    process.stdout.write('\x1B[?25l'); // hide cursor
    this.render();
    this.timer = setInterval(() => this.render(), theme.spinnerInterval);
  }

  update(msg: string) {
    this.message = msg;
  }

  stop() {
    if (!this.active) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clearLine();
    process.stdout.write('\x1B[?25h'); // show cursor
    this.active = false;
  }

  isActive() {
    return this.active;
  }

  private render() {
    const icon = chalk.hex('#a29bfe')(theme.spinner[this.frame % theme.spinner.length]);
    const msg = chalk.hex('#b2bec3')(this.message);
    this.clearLine();
    process.stdout.write(`  ${icon}  ${msg}`);
    this.frame++;
  }

  private clearLine() {
    process.stdout.write('\r\x1B[2K');
  }
}
