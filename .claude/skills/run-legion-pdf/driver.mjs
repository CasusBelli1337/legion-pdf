// REPL driver for Legion PDF on WSLg (X11 at :0). Run it inside tmux and
// send commands as lines of text; screenshots and evals come back on stdout.
// Build first: `npm run build` (the driver launches the packaged-out app).
import { _electron as electron } from 'playwright-core';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const APP_DIR = path.resolve(import.meta.dirname, '../../..');
const WORK_DIR = process.env.DRIVER_WORK_DIR || path.join(os.tmpdir(), 'legion-pdf-driver');
const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(WORK_DIR, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

let app = null;
let page = null;

const COMMANDS = {
  // launch [pdfPath...] — extra args are files to open, like a double-click.
  async launch(rest) {
    if (app) return console.log('already launched');
    const files = rest ? rest.split(/\s+/) : [];
    app = await electron.launch({
      executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
      args: [
        '--no-sandbox',
        '--disable-gpu',
        // Own profile dir: keeps the single-instance lock and recent-files
        // list away from any real instance of the app.
        `--user-data-dir=${path.join(WORK_DIR, 'udata')}`,
        APP_DIR,
        ...files,
      ],
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
      timeout: 30000,
    });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 2500));
    console.log(
      'launched.',
      app
        .windows()
        .map((w) => w.url())
        .join(' ')
    );
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  // drag x1 y1 x2 y2 — TRUSTED mouse drag via Playwright (viewport px).
  // Synthetic PointerEvents from eval fail on pointer-capture surfaces
  // (added 2026-08-25 for the text-box draw surface).
  async drag(rest) {
    if (!page) return console.log('ERROR: launch first');
    const [x1, y1, x2, y2] = (rest || '').split(/\s+/).map(Number);
    if ([x1, y1, x2, y2].some((n) => !Number.isFinite(n))) {
      return console.log('usage: drag x1 y1 x2 y2');
    }
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 8 });
    await page.mouse.up();
    console.log(`drag ${x1},${y1} -> ${x2},${y2} done`);
  },

  // mouseclick x y — trusted single click at viewport coordinates.
  async mouseclick(rest) {
    if (!page) return console.log('ERROR: launch first');
    const [x, y] = (rest || '').split(/\s+/).map(Number);
    if ([x, y].some((n) => !Number.isFinite(n))) return console.log('usage: mouseclick x y');
    await page.mouse.click(x, y);
    console.log(`mouseclick ${x},${y} done`);
  },

  // DOM click, not coordinates — reliable regardless of window stacking.
  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'OK';
    }, sel);
    console.log('click', sel, '->', r);
  },

  // Toolbar/dock buttons carry `title` attributes ("Save (Ctrl+S)", "Fill
  // Forms", "Next page"...). Matches title, aria-label, or text content.
  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')];
      const labelOf = (e) => e.title || e.getAttribute('aria-label') || e.textContent?.trim() || '';
      const el = els.find((e) => labelOf(e) === t) ?? els.find((e) => labelOf(e).includes(t));
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'OK: ' + labelOf(el);
    }, text);
    console.log('click-text', JSON.stringify(text), '->', r);
  },

  async type(text) {
    if (page) await page.keyboard.type(text, { delay: 20 });
    console.log('typed');
  },
  async press(key) {
    if (page) await page.keyboard.press(key);
    console.log('pressed', key);
  },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try {
      await page.waitForSelector(sel, { timeout: 15000 });
      console.log('found:', sel);
    } catch {
      console.log('TIMEOUT:', sel);
    }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try {
      console.log(JSON.stringify(await page.evaluate(expr)));
    } catch (e) {
      console.log('ERROR:', e.message);
    }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(
      await page.evaluate(
        (s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
        sel || null
      )
    );
  },

  async quit() {
    if (app) await app.close().catch(() => {});
    app = null;
    page = null;
  },
  help() {
    console.log('commands:', Object.keys(COMMANDS).join(', '));
  },
};

// Raw fd read keeps Electron from stealing the REPL's stdin.
const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

rl.on('line', async (line) => {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  if (!cmd) return rl.prompt();
  const fn = COMMANDS[cmd];
  if (!fn) {
    console.log('unknown:', cmd);
    return rl.prompt();
  }
  try {
    await fn(rest.join(' '));
  } catch (e) {
    console.log('ERROR:', e.message);
  }
  if (cmd === 'quit') {
    rl.close();
    process.exit(0);
  }
  rl.prompt();
});
rl.on('close', async () => {
  await COMMANDS.quit();
  process.exit(0);
});

console.log('legion-pdf driver ready');
rl.prompt();
