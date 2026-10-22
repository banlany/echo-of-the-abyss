/* ==========================================================
   bonds.js — 羁绊（套装效果）
   ----------------------------------------------------------
   4 个装备槽，每件装备带 1 个 tag。同 tag 数量达到 2/3/4
   时逐级激活。这是构筑的核心乐趣：4 个槽位怎么分配。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  /**
   * 每个羁绊：
   *   tiers[i].need  达到几件激活
   *   tiers[i].apply(stats, mods)  修改属性 / 行为标记
   */
  RG.BONDS = [
    {
      id: 'fire', name: '烈焰', color: '#ff8a3d', glyph: '火',
      blurb: '攻击附加灼烧，让敌人在火里融化。',
      tiers: [
        { need: 2, text: '攻击附加 <em>35%</em> 攻击力的灼烧，持续 3 秒', apply: (s, m) => { m.burnOnHit = 0.35; } },
        { need: 4, text: '灼烧可叠加 <em>3</em> 层，强度提升至 <em>45%</em>', apply: (s, m) => { m.burnOnHit = 0.45; m.burnStacks = 3; } },
        { need: 6, text: '被灼烧的敌人死亡时 <em>爆裂</em>，灼烧周围敌人', apply: (s, m) => { m.burnOnHit = 0.52; m.burnStacks = 4; m.burnExplode = true; } },
      ],
    },
    {
      id: 'frost', name: '寒霜', color: '#7fdcff', glyph: '霜',
      blurb: '减速、冻结，把潮水冻在原地。',
      tiers: [
        { need: 2, text: '命中使敌人减速 <em>28%</em>，持续 1.6 秒', apply: (s, m) => { m.slowOnHit = 0.28; } },
        { need: 4, text: '额外 <em>10%</em> 概率冻结敌人 1 秒', apply: (s, m) => { m.slowOnHit = 0.36; m.freezeChance = 0.10; } },
        { need: 6, text: '每 <em>5.5 秒</em>释放冰霜新星，冻住全场近敌', apply: (s, m) => { m.slowOnHit = 0.42; m.freezeChance = 0.14; m.frostNova = 5.5; } },
      ],
    },
    {
      id: 'storm', name: '雷霆', color: '#8fe3ff', glyph: '雷',
      blurb: '连锁闪电在怪群里疯狂跳跃。',
      tiers: [
        { need: 2, text: '<em>22%</em> 概率触发连锁闪电', apply: (s, m) => { m.chainChance = 0.22; } },
        { need: 4, text: '闪电额外跳跃 <em>2</em> 次，概率提升至 <em>32%</em>', apply: (s, m) => { m.chainChance = 0.32; m.chainBonus = 2; } },
        { need: 6, text: '每 <em>4.5 秒</em>降下天雷，击中随机敌人', apply: (s, m) => { m.chainChance = 0.40; m.chainBonus = 3; m.thunder = 4.5; } },
      ],
    },
    {
      id: 'blood', name: '血怒', color: '#ff5c78', glyph: '血',
      blurb: '越杀越勇，血越少越凶。',
      tiers: [
        { need: 2, text: '击杀回复 <em>2</em> 点生命', apply: (s, m) => { m.killHeal = 2; } },
        { need: 4, text: '生命低于 40% 时伤害提升 <em>35%</em>', apply: (s, m) => { m.killHeal = 3; m.rage = 0.35; } },
        { need: 6, text: '击杀回复 <em>5</em> 点生命，狂暴时攻速 +<em>25%</em>', apply: (s, m) => { m.killHeal = 5; m.rage = 0.45; m.rageSpeed = 0.25; } },
      ],
    },
    {
      id: 'shadow', name: '影刃', color: '#b18cff', glyph: '影',
      blurb: '暴击流派，一次暴击引发连锁。',
      tiers: [
        { need: 2, text: '暴击率 +<em>12%</em>', apply: (s, m) => { s.crit += 0.12; } },
        { need: 4, text: '暴击时向最近敌人弹射一枚暗影弹', apply: (s, m) => { s.crit += 0.16; s.critMult += 0.20; m.shadowBolt = 1; } },
        { need: 6, text: '暴击伤害 +<em>60%</em>，暗影弹一次 <em>2</em> 枚', apply: (s, m) => { s.crit += 0.20; s.critMult += 0.60; m.shadowBolt = 2; } },
      ],
    },
    {
      id: 'thorn', name: '荆棘', color: '#7ddc9a', glyph: '棘',
      blurb: '反伤构筑，让贴身变成自杀。',
      tiers: [
        { need: 2, text: '反伤效果 <em>翻倍</em>', apply: (s, m) => { s.thorns *= 2; m.thornMul = 2; } },
        { need: 4, text: '受到伤害时向四周爆出尖刺', apply: (s, m) => { s.thorns *= 2.6; s.armor += 15; m.thornMul = 2.6; m.thornBurst = 1; } },
        { need: 6, text: '反伤 <em>×4</em>，爆刺范围翻倍', apply: (s, m) => { s.thorns *= 4; s.armor += 30; s.maxHp *= 1.12; m.thornMul = 4; m.thornBurst = 2; } },
      ],
    },
    {
      id: 'wind', name: '疾风', color: '#9dffb0', glyph: '风',
      blurb: '极致机动，敌人永远打不到你。',
      tiers: [
        { need: 2, text: '移速 +<em>12%</em>，攻速 +<em>10%</em>', apply: (s, m) => { s.moveSpeed += 0.12; s.attackSpeed += 0.10; } },
        { need: 4, text: '<em>12%</em> 概率完全闪避伤害', apply: (s, m) => { s.moveSpeed += 0.10; m.dodge = 0.12; } },
        { need: 6, text: '<em>22%</em> 闪避，冲刺冷却减半', apply: (s, m) => { s.moveSpeed += 0.16; s.attackSpeed += 0.12; m.dodge = 0.22; m.dashFast = 1; } },
      ],
    },
    {
      id: 'dragon', name: '巨龙', color: '#ffc861', glyph: '龙',
      blurb: '古龙血脉，全面强化并释放龙息。',
      tiers: [
        { need: 2, text: '伤害 / 攻速 / 护甲 / 生命 各 +<em>8%</em>', apply: (s, m) => { s.damage += 0.08; s.attackSpeed += 0.08; s.armor *= 1.12; s.maxHp *= 1.08; } },
        { need: 4, text: '每 <em>8 秒</em>释放龙息新星', apply: (s, m) => { s.damage += 0.10; s.attackSpeed += 0.08; s.armor *= 1.18; s.maxHp *= 1.10; m.dragonNova = 8; } },
        { need: 6, text: '全属性 +<em>18%</em>，龙息伤害翻倍', apply: (s, m) => { s.damage += 0.18; s.attackSpeed += 0.15; s.armor *= 1.28; s.maxHp *= 1.18; m.dragonNova = 7; m.dragonNovaMul = 2; } },
      ],
    },
  ];

  RG.BOND_MAP = {};
  RG.BONDS.forEach((b) => { RG.BOND_MAP[b.id] = b; });

  /** 统计标签数量。传入生效装备数组（或旧的槽位对象） */
  RG.countTags = function (items) {
    const counts = {};
    const list = Array.isArray(items) ? items : Object.keys(items || {}).map((k) => items[k]);
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (!it || !it.tag) continue;
      counts[it.tag] = (counts[it.tag] || 0) + 1;
    }
    return counts;
  };

  /** 返回当前激活的羁绊列表 [{bond, tier, count, nextNeed}] */
  RG.resolveBonds = function (items) {
    const counts = RG.countTags(items);
    const out = [];
    for (const bid in counts) {
      const bond = RG.BOND_MAP[bid];
      if (!bond) continue;
      const n = counts[bid];
      let tier = 0;
      for (let i = 0; i < bond.tiers.length; i++) {
        if (n >= bond.tiers[i].need) tier = i + 1;
      }
      const next = bond.tiers[tier];
      if (n < 2) continue; // 1 件不激活，但仍显示
      out.push({ bond, tier, count: n, nextNeed: next ? next.need : 0 });
    }
    // 未激活的也返回（count>=1）
    for (const bid in counts) {
      if (out.some((o) => o.bond.id === bid)) continue;
      const bond = RG.BOND_MAP[bid];
      if (!bond) continue;
      out.push({ bond, tier: 0, count: counts[bid], nextNeed: bond.tiers[0].need });
    }
    out.sort((a, b) => b.tier - a.tier || b.count - a.count);
    return out;
  };

  /** 把已激活的羁绊效果写进 stats / mods */
  RG.applyBonds = function (items, stats, mods) {
    const counts = RG.countTags(items);
    const activated = [];
    for (const bid in counts) {
      const bond = RG.BOND_MAP[bid];
      if (!bond) continue;
      const n = counts[bid];
      for (let i = 0; i < bond.tiers.length; i++) {
        if (n >= bond.tiers[i].need) {
          bond.tiers[i].apply(stats, mods);
          activated.push({ bond, tier: i + 1 });
        }
      }
    }
    return activated;
  };
})(window);
