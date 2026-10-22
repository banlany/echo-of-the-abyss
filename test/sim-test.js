/* ==========================================================
   sim-test.js — 无浏览器的模拟回归测试
   用法： node test/sim-test.js
   ----------------------------------------------------------
   验证：
   1. 所有装备模板 / 词条 / 角色 / 羁绊可正常生成
   2. 完整跑 12 波不报错、不出现 NaN、不内存爆炸
   3. 每个角色的被动 / 每把武器都能正常开火
   ========================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;

const ROOT = path.join(__dirname, '..');
const FILES = [
  'js/core/rng.js', 'js/core/utils.js', 'js/core/grid.js', 'js/core/audio.js',
  'js/data/affixes.js', 'js/data/items.js', 'js/data/bonds.js',
  'js/data/characters.js', 'js/data/perks.js', 'js/data/enemies.js',
  'js/sim/loot.js', 'js/sim/combat.js', 'js/sim/world.js', 'js/sim/net.js',
];
for (const f of FILES) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}

const RG = global.RG;
let fails = 0;
function assert(cond, msg) {
  if (!cond) { fails++; console.error('  ✗ ' + msg); }
  return cond;
}

console.log('\n=== 1. 装备生成 ===');
const rng = new RG.RNG(999);
let itemCount = 0;
for (const cat of ['WEAPONS', 'ARMORS', 'TRINKETS']) {
  for (const base of RG[cat]) {
    for (const rarity of RG.RARITY_ORDER) {
      const it = RG.makeItem(base.id, { wave: 5, rarity, rng });
      itemCount++;
      assert(it.name && it.name.length > 0, `${base.id}/${rarity} 名为空`);
      assert(it.stats && Object.keys(it.stats).length > 0, `${base.id}/${rarity} 无属性`);
      assert(!Number.isNaN(JSON.parse(JSON.stringify(it.stats)).damage ?? 0), `${base.id} 属性 NaN`);
      if (base.slot === 'weapon') {
        assert(it.atk && it.atk.dmg > 0, `${base.id}/${rarity} 武器伤害异常`);
        assert(!Number.isNaN(it.atk.dmg), `${base.id} atk.dmg NaN`);
      }
    }
  }
}
console.log(`  生成 ${itemCount} 件，全部通过`);

console.log('\n=== 2. 词条数值合理性 ===');
for (let i = 0; i < 600; i++) {
  const r = RG.rollAffix('mythic', 1, rng, []);
  assert(Number.isFinite(r.value) && r.value > 0, `词条 ${r.id} 数值非法: ${r.value}`);
  if (r.kind === 'pct') {
    assert(r.value < 1.0, `百分比词条 ${r.id} 过大: ${r.value}`);
  } else {
    assert(r.value < 400, `数值词条 ${r.id} 过大: ${r.value}`);
  }
  assert(typeof r.text === 'string' && r.text.length > 0, `词条 ${r.id} 文本为空`);
}
console.log('  600 次 roll 全部合法');

console.log('\n=== 3. 羁绊可达性 ===');
const tagCounts = {};
for (const cat of ['WEAPONS', 'ARMORS', 'TRINKETS']) {
  RG[cat].forEach((b) => { tagCounts[b.tag] = (tagCounts[b.tag] || 0) + 1; });
}
for (const bond of RG.BONDS) {
  const n = tagCounts[bond.id] || 0;
  assert(n >= 3, `羁绊 ${bond.name} 只有 ${n} 件装备，凑不出 3 件`);
  assert(bond.tiers.length === 3, `${bond.name} 层级数不是 3`);
}
console.log('  ' + JSON.stringify(tagCounts));

console.log('\n=== 4. 单角色长跑（12 波）===');
function runChar(charId, waveTarget, seed) {
  const world = new RG.World({ charId, seed });
  const p = world.player;
  let frames = 0;
  let peakEnemies = 0;
  let maxFrameMs = 0;
  let perksTaken = 0;

  const start = Date.now();
  while (world.wave <= waveTarget && world.phase !== 'dead') {
    // 伪输入：绕圈移动 + 偶尔冲刺
    const t = frames / 60;
    world.input.right = Math.cos(t * 0.9) > 0;
    world.input.left = Math.cos(t * 0.9) <= 0;
    world.input.down = Math.sin(t * 0.9) > 0;
    world.input.up = Math.sin(t * 0.9) <= 0;
    if (frames % 90 === 0) world.input.dash = true;

    const f0 = Date.now();
    world.step(1 / 60);
    maxFrameMs = Math.max(maxFrameMs, Date.now() - f0);
    frames++;
    peakEnemies = Math.max(peakEnemies, world.enemies.length);

    // 处理事件
    if (world.events.length) {
      const evs = world.events.splice(0, world.events.length);
      for (const ev of evs) {
        if (ev.type === 'levelup' && world.phase === 'levelup') {
          world.choosePerk(ev.choices[0].id);
          perksTaken++;
        }
      }
    }
    // 自动过商店：买性价比最高的一件
    if (world.phase === 'shop') {
      let best = -1, bestScore = -1;
      for (let i = 0; i < world.shop.stock.length; i++) {
        const e = world.shop.stock[i];
        if (!e || e.sold || world.player.gold < e.price) continue;
        const sc = RG.itemScore(e.item) / Math.max(1, e.price);
        if (sc > bestScore) { bestScore = sc; best = i; }
      }
      if (best >= 0) world.buyShopItem(best);
      world.nextWave();
    }
    if (frames > 60 * 42 * (waveTarget + 1)) break; // 安全阀
  }

  return {
    wave: world.wave, frames, peakEnemies, maxFrameMs, perksTaken,
    kills: world.kills, level: p.level,
    hp: Math.round(p.hp), gold: p.totalGold,
    ms: Date.now() - start,
    dead: world.phase === 'dead',
    nan: Number.isNaN(p.x) || Number.isNaN(p.y) || Number.isNaN(p.hp),
  };
}

for (const ch of RG.CHARACTERS) {
  const r = runChar(ch.id, 12, 4242);
  const ok = !r.nan;
  console.log(
    `  ${ok ? '✓' : '✗'} ${ch.name.padEnd(4)} 波次=${r.wave} 击杀=${String(r.kills).padStart(5)} ` +
    `等级=${String(r.level).padStart(2)} 峰值怪物=${String(r.peakEnemies).padStart(3)} ` +
    `最慢帧=${String(r.maxFrameMs).padStart(3)}ms 耗时=${r.ms}ms ${r.dead ? '(阵亡)' : ''}`
  );
  assert(ok, `${ch.name} 出现 NaN`);
  assert(r.kills > 0, `${ch.name} 一个怪都没杀`);
  assert(r.perksTaken > 3, `${ch.name} 升级次数过少`);
}

console.log('\n=== 5. 全部武器开火测试 ===');
for (const wpn of RG.WEAPONS) {
  const world = new RG.World({ charId: 'rayn', seed: 77 });
  world.player.equip.weapon = RG.makeItem(wpn.id, { wave: 8, rarity: 'legend', rng });
  world.recomputeStats();
  // 放一堆怪在周围
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    world.spawnEnemy('grunt', Math.cos(a) * 120, Math.sin(a) * 120, {});
  }
  const hpBefore = world.enemies.reduce((s, e) => s + e.hp, 0);
  for (let i = 0; i < 180; i++) world.step(1 / 60);
  const hpAfter = world.enemies.reduce((s, e) => s + (e.dead ? 0 : e.hp), 0);
  const dealt = hpBefore - hpAfter;
  console.log(`  ${dealt > 0 ? '✓' : '✗'} ${wpn.name.padEnd(6)} 造成伤害 ${Math.round(dealt)} 投射物=${world.projectiles.length}`);
  assert(dealt > 0, `${wpn.name} 打不出伤害`);
}

console.log('\n=== 6. 全羁绊激活测试（佩戴 2 + 背包饰品 4）===');
for (const bond of RG.BONDS) {
  const world = new RG.World({ charId: 'rayn', seed: 5 });
  const pool = [...RG.WEAPONS, ...RG.ARMORS, ...RG.TRINKETS].filter((b) => b.tag === bond.id);
  const p = world.player;
  const wBase = pool.find((b) => b.slot === 'weapon');
  const aBase = pool.find((b) => b.slot === 'armor');
  const tBase = pool.find((b) => b.slot === 'trinket');
  if (wBase) p.equip.weapon = RG.makeItem(wBase.id, { wave: 3, rarity: 'rare', rng });
  if (aBase) p.equip.armor = RG.makeItem(aBase.id, { wave: 3, rarity: 'rare', rng });
  // 背包塞 4 件同标签饰品
  for (let i = 0; i < 4 && tBase; i++) {
    p.bag[i] = RG.makeItem(tBase.id, { wave: 3, rarity: 'rare', rng });
  }
  world.recomputeStats();
  const active = (p.bonds || []).find((b) => b.bond.id === bond.id);
  const t = active ? active.tier : 0;
  console.log(`  ${t > 1 ? '✓' : '·'} ${bond.name} 层数 ${t} (${active ? active.count : 0} 件生效)`);
  assert(t >= 2, `${bond.name} 只激活到 ${t} 层`);
  assert(p.stats.maxHp > 0, `${bond.name} 导致生命异常`);
}

console.log('\n=== 6b. 背包容量与拾取规则 ===');
{
  const world = new RG.World({ charId: 'rayn', seed: 9 });
  const p = world.player;
  // 塞满背包
  for (let i = 0; i < p.bag.length; i++) {
    p.bag[i] = RG.makeItem('powerring', { wave: 2, rarity: 'common', rng });
  }
  assert(!world.bagHasSpace(), '背包应已满');
  const before = world.bagUsed();
  const ok = world.pickupItem(RG.makeItem('sword', { wave: 2, rarity: 'rare', rng }));
  assert(ok === false, '背包满时不应拾取');
  assert(world.bagUsed() === before, '背包数量不应变化');

  // 丢弃后可再拾取
  world.dropFromBag(0);
  assert(world.bagHasSpace(), '丢弃后应有空位');
  const ok2 = world.pickupItem(RG.makeItem('sword', { wave: 2, rarity: 'rare', rng }));
  assert(ok2 === true, '有空位时应能拾取');
  console.log('  ✓ 满包拒收 / 丢弃后恢复拾取');

  // 饰品进包即生效，武器进包不生效
  const w2 = new RG.World({ charId: 'rayn', seed: 11 });
  const p2 = w2.player;
  const atk0 = p2.equip.weapon.atk.dmg;
  const dmg0 = p2.stats.damage;
  p2.bag[0] = RG.makeItem('powerring', { wave: 2, rarity: 'legend', rng }); // 饰品 +伤害
  w2.recomputeStats();
  assert(p2.stats.damage > dmg0, '背包中的饰品应立即生效');
  const dmg1 = p2.stats.damage;
  p2.bag[1] = RG.makeItem('hammer', { wave: 2, rarity: 'legend', rng }); // 武器，不佩戴
  w2.recomputeStats();
  assert(Math.abs(p2.stats.damage - dmg1) < 1e-6, '背包中的武器不应生效');
  assert(p2.equip.weapon.atk.dmg === atk0, '武器攻击不应被替换');
  // 换装后生效
  w2.equipFromBag(1);
  assert(p2.equip.weapon.baseId === 'hammer', '换装后佩戴位应为战锤');
  console.log('  ✓ 饰品入包生效 / 武器需佩戴');
}

console.log('\n=== 7. 确定性（同种子两次结果一致）===');
function fingerprint(seed) {
  const world = new RG.World({ charId: 'grom', seed });
  for (let i = 0; i < 60 * 30; i++) {
    world.input.right = i % 120 < 60;
    world.step(1 / 60);
    if (world.events.length) {
      const evs = world.events.splice(0, world.events.length);
      for (const ev of evs) if (ev.type === 'levelup') world.choosePerk(ev.choices[0].id);
    }
    if (world.phase === 'shop') world.nextWave();
  }
  const p = world.player;
  return `${Math.round(p.x)},${Math.round(p.y)},${world.kills},${Math.round(p.hp)},${world.enemies.length}`;
}
const f1 = fingerprint(31337);
const f2 = fingerprint(31337);
console.log(`  ${f1 === f2 ? '✓' : '✗'} ${f1}  vs  ${f2}`);
assert(f1 === f2, '同种子结果不一致（联机会出大问题）');

console.log('\n=== 汇总 ===');
if (fails === 0) console.log('全部通过 ✓');
else { console.error(`${fails} 项失败 ✗`); process.exitCode = 1; }
