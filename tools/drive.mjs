// Drive the page in a real browser and read what it actually renders.
//
//   node tools/drive.mjs steps.json
//
// The test suite checks behaviour; this checks what a reader sees. Most of
// the layout defects in this project's history — dots painted over body
// copy, a slider rendering as a browser-default blue stub, a headline
// sitting outside the reading column — passed the suite and were caught
// here.
//
// steps.json is an array, executed in order:
//   { "navigate": "file:///…/index.html", "settle": 1200 }
//   { "eval": "<expression>", "as": "label" }   evaluate, print the result
//   { "shot": "/abs/path.png" }                 screenshot the viewport
//   { "metrics": { "width": 390, "height": 844, "mobile": true } }
//   { "clickSel": "#year-next" }                a real mouse click
//   { "key": "Tab" }                            a real key press
//   { "wait": 500 }
//
// Console errors are reported at the end of every run.
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9400 + (process.pid % 300);
const steps = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--hide-scrollbars', '--window-size=1280,900',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.env.TMPDIR + 'cdp2-' + process.pid,
  'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    page = list.find((t) => t.type === 'page');
    if (page) break;
  } catch { /* not up */ }
  await sleep(100);
}
if (!page) { console.error('no target'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });

let nextId = 1;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push(m.params.entry.text);
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.text);
});
const send = (method, params = {}) => {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};

await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');

for (const s of steps) {
  if (s.navigate) { await send('Page.navigate', { url: s.navigate }); await sleep(s.settle ?? 800); continue; }
  if (s.metrics) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: s.metrics.width, height: s.metrics.height ?? 900,
      deviceScaleFactor: 1, mobile: !!s.metrics.mobile,
    });
    await sleep(s.settle ?? 350);
    continue;
  }
  if (s.key) {
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {
        type, key: s.key,
        code: s.key === 'Tab' ? 'Tab' : s.key,
        windowsVirtualKeyCode: s.key === 'Tab' ? 9 : 0,
        nativeVirtualKeyCode: s.key === 'Tab' ? 9 : 0,
      });
    }
    await sleep(120);
    continue;
  }
  if (s.clickSel) {
    const { result } = await send('Runtime.evaluate', {
      expression: `(() => { const e=document.querySelector(${JSON.stringify(s.clickSel)});
        const r=e.getBoundingClientRect();
        return JSON.stringify({x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)}); })()`,
      returnByValue: true,
    });
    const { x, y } = JSON.parse(result.value);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
    await sleep(150);
    continue;
  }
  if (s.wait) { await sleep(s.wait); continue; }
  if (s.shot) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(s.shot, Buffer.from(data, 'base64'));
    console.log(`[shot] ${s.shot}`);
    continue;
  }
  if (s.eval) {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression: s.eval, returnByValue: true, awaitPromise: true,
    });
    const label = s.as ? s.as + ': ' : '';
    console.log(label + (exceptionDetails
      ? 'THREW ' + (exceptionDetails.exception?.description ?? exceptionDetails.text)
      : JSON.stringify(result.value)));
  }
}

console.log(consoleErrors.length ? '--- console errors ---\n' + consoleErrors.slice(0, 6).join('\n') : '--- console clean ---');
ws.close(); chrome.kill(); process.exit(0);
