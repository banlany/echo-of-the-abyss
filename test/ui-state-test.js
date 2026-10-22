/* ==========================================================
   ui-state-test.js — 界面状态机回归测试
   ----------------------------------------------------------
   覆盖「打开行囊 → 关闭 → 回到原状态」的所有路径。
   这类 bug 的共同点是：某个弹层把 phase 卡住而界面没恢复，
   模拟层就再也不推进了。

   用法： node test/ui-state-test.js
   ========================================================== */
const { spawn } = require('child_process');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9359;
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
function check(cond, label, extra) {
  if (cond) {
    console.log('  ✓ ' + label);
  } else {
    fails++;
    console.error('  ✗ ' + label + (extra ? '  → ' + extra : ''));
  }
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1600,900', '--no-first-run', '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      targets = await r.json();
      if (targets.length) break;
    } catch (e) { /* 等端口 */ }
    await sleep(150);
  }
  if (!targets) { console.error('无法连接 Chrome'); chrome.kill(); process.exit(1); }

  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception || {}).description);
    }
  };
  const send = (method, params) => new Promise((res) => {
    const i = ++id; pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });

  await new Promise((r) => { ws.onopen = r; });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?autostart=rayn&sim=0' });
  await sleep(2200);

  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
  const phase = () => ev('RG.game.world.phase');
  const screens = () => ev(`['screen-title','screen-levelup','screen-shop','screen-bag','screen-pause','screen-death']
      .filter(i => document.getElementById(i).classList.contains('show')).join(',') || 'none'`);
  const key = (code) => ev(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'${code}',bubbles:true,cancelable:true}))`);
  /** 连续点卡直到离开 levelup（一次经验可能触发多级） */
  const resolveLevelUp = async () => {
    let rounds = 0;
    while (await phase() === 'levelup' && rounds < 12) {
      const ok = await ev(`(()=>{const c=document.querySelector('#perkCards .perk-card'); if(!c) return false; c.click(); return true;})()`);
      if (!ok) break;
      rounds++;
      await sleep(220);
    }
    return { phase: await phase(), rounds };
  };
  const running = async () => {
    const a = await ev('RG.game.world.time');
    await sleep(420);
    const b = await ev('RG.game.world.time');
    return b > a;
  };

  console.log('\n=== 1. 战斗中开合行囊 ===');
  if (await phase() === 'levelup') await resolveLevelUp();   // 等待期间可能已升级
  check(await phase() === 'combat', '起始处于 combat');
  await key('Tab'); await sleep(250);
  check(await screens() === 'screen-bag', '行囊已打开', await screens());
  check(await ev('RG.game.world.paused') === true, '打开时暂停模拟');
  await key('Tab'); await sleep(250);
  check(await screens() === 'none', '关闭后无弹层', await screens());
  check(await running(), '模拟恢复推进');

  console.log('\n=== 2. 升级界面 → 行囊 → 升级界面（本次修复的 bug）===');
  await ev(`(()=>{const w=RG.game.world; w.gainXp(w.player.xpNext - w.player.xp + 1); })()`);
  await sleep(350);
  check(await phase() === 'levelup', '已进入升级', await phase());
  check(await screens() === 'screen-levelup', '升级弹层可见', await screens());

  await key('Tab'); await sleep(300);
  check(await screens() === 'screen-bag', '升级时能打开行囊', await screens());
  check(await phase() === 'levelup', '阶段仍为 levelup');

  await key('Tab'); await sleep(300);
  check(await screens() === 'screen-levelup', '关闭后回到升级三选一', await screens());

  // 用 Esc 再走一遍
  await key('Tab'); await sleep(250);
  await key('Escape'); await sleep(250);
  check(await screens() === 'screen-levelup', 'Esc 关闭也行', await screens());

  // 点卡继续（可能连续弹多张）
  const r = await resolveLevelUp();
  check(r.rounds >= 1, '卡片可点击（点了 ' + r.rounds + ' 次）');
  check(r.phase === 'combat', '选卡后回到 combat', r.phase);
  check(await running(), '模拟恢复推进');

  console.log('\n=== 3. 商店 → 行囊 → 商店 ===');
  await ev(`(()=>{const w=RG.game.world; w.waveTime = 0.01; })()`);
  await sleep(700);
  check(await phase() === 'shop', '波次结束进入商店', await phase());
  check(await screens() === 'screen-shop', '商店弹层可见', await screens());

  await key('Tab'); await sleep(300);
  check(await screens() === 'screen-bag', '商店里能开行囊', await screens());
  await key('Tab'); await sleep(300);
  check(await screens() === 'screen-shop', '关闭后回到商店', await screens());
  check(await phase() === 'shop', '阶段仍为 shop');

  console.log('\n=== 4. 下一波 → 暂停 → 行囊 → 暂停 ===');
  await ev(`document.getElementById('btnNextWave').click()`);
  await sleep(400);
  // 波间攒下的经验会在新一波开始时补发升级
  if (await phase() === 'levelup') await resolveLevelUp();
  check(await phase() === 'combat', '已进入下一波', await phase());

  await key('Escape'); await sleep(300);
  check(await screens() === 'screen-pause', '暂停弹层可见', await screens());
  await ev(`document.getElementById('btnOpenBag2').click()`); await sleep(300);
  check(await screens() === 'screen-bag', '暂停里能开行囊', await screens());
  await key('Escape'); await sleep(300);
  check(await screens() === 'screen-pause', '关闭后回到暂停', await screens());
  await ev(`document.getElementById('btnResume').click()`); await sleep(300);
  check(await screens() === 'none', '继续后关闭弹层', await screens());

  console.log('\n=== 5. 死亡后行囊应被拒绝 ===');
  await ev(`(()=>{const w=RG.game.world; w.player.invuln = 0; w.damagePlayer(1e9);})()`);
  await sleep(500);
  check(await phase() === 'dead', '已死亡', await phase());
  await key('Tab'); await sleep(300);
  check(await screens() === 'screen-death', '死亡时 Tab 无效', await screens());

  console.log('\n=== 汇总 ===');
  if (errors.length) {
    console.error('运行时异常:', errors.slice(0, 5));
    fails += errors.length;
  }
  if (fails === 0) console.log('全部通过 ✓');
  else { console.error(`${fails} 项失败 ✗`); process.exitCode = 1; }

  ws.close();
  chrome.kill();
  process.exit(process.exitCode || 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
