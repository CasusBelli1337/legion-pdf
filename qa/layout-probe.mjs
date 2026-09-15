/**
 * Proves the renderer's layout responder in the BUILT app: launches Legion PDF,
 * opens a PDF through the bridge, asks the renderer for one page's layout over
 * the real `layout:request` / `layout:response` channels from the main
 * process, and prints what came back. Run after `npm run build`:
 *
 *   DISPLAY=:0 node qa/layout-probe.mjs qa/fixtures/pleading-fixture.pdf 3
 */
import { _electron as electron } from 'playwright-core';
import * as os from 'node:os';
import * as path from 'node:path';

const say = (...parts) =>
  process.stdout.write(
    `${parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ')}\n`
  );

const APP_DIR = path.resolve(import.meta.dirname, '..');
const [, , file = 'qa/fixtures/pleading-fixture.pdf', pageArg = '1'] = process.argv;
const filePath = path.resolve(file);
const page = Number(pageArg);

const app = await electron.launch({
  executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
  args: [
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${path.join(os.tmpdir(), 'legion-pdf-layout-probe', 'udata')}`,
    APP_DIR,
  ],
  env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':0' },
  timeout: 30000,
});
const window = await app.firstWindow();
await window.waitForLoadState('domcontentloaded');
await new Promise((resolve) => setTimeout(resolve, 2500));

const session = await window.evaluate(
  (target) => window.librarius.file.open(target).then(({ id, pageCount }) => ({ id, pageCount })),
  filePath
);
say('opened', session);

const response = await app.evaluate(
  ({ ipcMain, BrowserWindow }, request) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no layout:response in 30s')), 30000);
      const listener = (_event, reply) => {
        if (reply.requestId !== request.requestId) return;
        ipcMain.off('layout:response', listener);
        clearTimeout(timer);
        resolve(reply);
      };
      ipcMain.on('layout:response', listener);
      BrowserWindow.getAllWindows()[0].webContents.send('layout:request', request);
    }),
  { requestId: 'probe-1', docId: session.id, page }
);

if (response.layout === null) {
  console.error('layout error:', response.error);
  await app.close();
  process.exit(1);
}
const { layout } = response;
const roles = {};
for (const run of layout.runs) roles[run.role] = (roles[run.role] ?? 0) + 1;
say('page', layout.page, 'size', layout.size, 'rotation', layout.rotation);
say('runs', layout.runs.length, 'roles', roles);
say('fonts', layout.fonts);
say(
  'images',
  layout.images.length,
  'rules',
  layout.rules.length,
  'printed',
  layout.printedPageNumber
);
say(
  'first body run',
  layout.runs.find((run) => run.role === 'body')
);
if (layout.runs.length === 0) {
  console.error('FAIL: no runs');
  await app.close();
  process.exit(1);
}
await app.close();
say('PROBE OK');
process.exit(0);
