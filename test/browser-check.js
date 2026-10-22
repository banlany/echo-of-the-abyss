/* ==========================================================
   browser-check.js — 真实浏览器冒烟测试
   用 Chrome DevTools Protocol 打开游戏，跑一段时间，
   捕获所有 JS 异常 / console.error，最后截图。
   用法： node test/browser-check.js [场景] [秒数]
   ========================================================== */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9337;
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots');

const scenario = process.argv[2] || 'combat';
const SECONDS = Number(process.argv[3] || 6);

const URLS = {
  title: '',
  combat: '?autostart=rayn&sim=30',
  mage: '?autostart=vera&sim=60',
  shop: '?autostart=grom&sim=120&hold=shop',
  levelup: '?autostart=kai&sim=50&hold=levelup',
  death: '?autostart=nyx&sim=150&die=1',
  long: '?autostart=aela&sim=400',
  bag: '?autostart=rayn&sim=90&bag=1',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + (URLS[scenario] || '');
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1600,900',
    '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      targets = await r.json();
      if (targets.length) break;
    } catch (e) { /* not ready */ }
    await sleep(150);
  }
  if (!targets) { console.error('无法连接 Chrome'); chrome.kill(); process.exit(1); }

  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  let msgId = 0;
  const pending = new Map();
  const errors = [];
  const warns = [];

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push(`${d.text} @${d.url || ''}:${d.lineNumber}  ${d.exception ? d.exception.description : ''}`);
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      if (m.params.type === 'error') {
        errors.push('console.error: ' + m.params.args.map((a) => a.value || a.description || '').join(' '));
      } else if (m.params.type === 'warning') {
        warns.push(m.params.args.map((a) => a.value || '').join(' '));
      }
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push('log: ' + m.params.entry.text);
    }
  };

  const send = (method, params) => new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });

  await new Promise((r) => { ws.onopen = r; });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await send('Page.navigate', { url });
  await sleep(SECONDS * 1000);

  // 读一点运行时状态
  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const g = window.RG && window.RG.game;
      if (!g || !g.world) return JSON.stringify({ ready: false });
      const w = g.world, p = w.player;
      return JSON.stringify({
        ready: true,
        phase: w.phase,
        wave: w.wave,
        enemies: w.enemies.length,
        projectiles: w.projectiles.length,
        particles: w.particles.length,
        kills: w.kills,
        level: p.level,
        hp: Math.round(p.hp),
        maxHp: p.stats.maxHp,
        gold: p.gold,
        bonds: (p.bonds || []).filter(b => b.tier > 0).map(b => b.bond.name + '·' + b.tier),
        perks: Object.keys(p.perkCounts).length,
        screen: [...document.querySelectorAll('.screen.show')].map(e => e.id),
        fps: window.__fps || null,
      });
    })()`,
    returnByValue: true,
  });

  let state = null;
  try { state = JSON.parse(evalRes.result.value); } catch (e) { state = { raw: evalRes.result.value }; }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `browser-${scenario}.png`);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));

  console.log('\n--- 场景:', scenario, '---');
  console.log('状态:', JSON.stringify(state, null, 2));
  console.log('截图:', file);
  if (warns.length) console.log(`警告 ${warns.length} 条:`, warns.slice(0, 5));
  if (errors.length) {
    console.log(`\n❌ 运行时错误 ${errors.length} 条:`);
    errors.slice(0, 12).forEach((e) => console.log('  ', e));
  } else {
    console.log('\n✅ 无运行时错误');
  }

  ws.close();
  chrome.kill();
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
