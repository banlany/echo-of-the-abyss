/* ==========================================================
   perks.js — 升级特性（三选一）
   ----------------------------------------------------------
   属性类可叠加多层，机制类大多只能拿一次。
   apply() 必须是"幂等可重算"的：每次升级都会清空 stats
   后按 perkCounts 逐层重放，所以不能有副作用累积。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  const T = {
    common: { name: '普通强化', color: '#7fd7ff', weight: 58 },
    rare: { name: '稀有强化', color: '#b18cff', weight: 30 },
    epic: { name: '史诗强化', color: '#ffc861', weight: 12 },
  };
  RG.PERK_TIERS = T;

  RG.PERKS = [
    /* ---------------- 属性：普通 ---------------- */
    { id: 'sharp', name: '锋利', icon: '锋', tier: 'common', max: 9,
      desc: '所有伤害 <em>+12%</em>', apply: (s) => { s.damage += 0.12; } },

    { id: 'swift', name: '疾行', icon: '疾', tier: 'common', max: 8,
      desc: '移动速度 <em>+10%</em>', apply: (s) => { s.moveSpeed += 0.10; } },

    { id: 'bulwark', name: '铁壁', icon: '壁', tier: 'common', max: 9,
      desc: '护甲 <em>+20</em>', apply: (s) => { s.armor += 20; } },

    { id: 'vitality', name: '强健', icon: '命', tier: 'common', max: 9,
      desc: '最大生命 <em>+35</em>，立即回复同等生命', apply: (s, m, ctx) => { s.maxHp += 35; ctx.healOnApply = (ctx.healOnApply || 0) + 35; } },

    { id: 'haste', name: '迅捷', icon: '速', tier: 'common', max: 8,
      desc: '攻击速度 <em>+10%</em>', apply: (s) => { s.attackSpeed += 0.10; } },

    { id: 'precision', name: '精准', icon: '准', tier: 'common', max: 8,
      desc: '暴击率 <em>+6%</em>', apply: (s) => { s.crit += 0.06; } },

    { id: 'lethal', name: '致命', icon: '杀', tier: 'common', max: 8,
      desc: '暴击伤害 <em>+25%</em>', apply: (s) => { s.critMult += 0.25; } },

    { id: 'scholar', name: '博学', icon: '识', tier: 'common', max: 6,
      desc: '经验获取 <em>+18%</em>', apply: (s) => { s.xpGain += 0.18; } },

    { id: 'greed', name: '贪婪', icon: '财', tier: 'common', max: 6,
      desc: '金币获取 <em>+14%</em>', apply: (s) => { s.goldGain += 0.14; } },

    { id: 'magnet', name: '磁力', icon: '磁', tier: 'common', max: 6,
      desc: '拾取范围 <em>+35%</em>', apply: (s) => { s.pickup += 0.35; } },

    { id: 'fortune', name: '幸运', icon: '运', tier: 'common', max: 6,
      desc: '幸运 <em>+15</em>（提升掉落品质与数量）', apply: (s) => { s.luck += 15; } },

    { id: 'arcane', name: '秘法', icon: '法', tier: 'common', max: 6,
      desc: '冷却缩减 <em>+7%</em>', apply: (s) => { s.cdr += 0.07; } },

    { id: 'expand', name: '扩张', icon: '域', tier: 'common', max: 6,
      desc: '技能范围 <em>+12%</em>', apply: (s) => { s.area += 0.12; } },

    { id: 'renew', name: '回春', icon: '愈', tier: 'common', max: 5,
      desc: '每秒回复 <em>+0.8</em> 生命', apply: (s) => { s.regen += 0.8; } },

    { id: 'barbs', name: '荆棘皮肤', icon: '棘', tier: 'common', max: 6,
      desc: '反伤 <em>+12</em>', apply: (s) => { s.thorns += 12; } },

    { id: 'leech', name: '汲取', icon: '汲', tier: 'rare', max: 4,
      desc: '生命偷取 <em>+1.5%</em>', apply: (s) => { s.lifesteal += 0.015; } },

    /* ---------------- 属性：稀有 ---------------- */
    { id: 'multishot', name: '多重投射', icon: '多', tier: 'rare', max: 3,
      desc: '远程武器额外发射 <em>+1</em> 枚弹丸', apply: (s, m) => { m.multiShot = (m.multiShot || 0) + 1; } },

    { id: 'pierce', name: '贯穿', icon: '穿', tier: 'rare', max: 3,
      desc: '投射物额外穿透 <em>+1</em> 个敌人', apply: (s, m) => { m.pierceBonus = (m.pierceBonus || 0) + 1; } },

    { id: 'timelord', name: '时间扭曲', icon: '时', tier: 'rare', max: 3,
      desc: '冷却缩减 <em>+15%</em>，移速 <em>-5%</em>', apply: (s) => { s.cdr += 0.15; s.moveSpeed -= 0.05; } },

    { id: 'berserk', name: '巨兽之力', icon: '兽', tier: 'rare', max: 2,
      desc: '伤害 <em>+25%</em>，攻速 <em>-10%</em>', apply: (s) => { s.damage += 0.25; s.attackSpeed -= 0.10; } },

    { id: 'soulsiphon', name: '灵魂虹吸', icon: '魂', tier: 'rare', max: 3,
      desc: '击杀回复 <em>+1.5</em> 生命', apply: (s, m) => { m.killHeal = (m.killHeal || 0) + 1.5; } },

    /* ---------------- 机制：史诗 ---------------- */
    { id: 'execute', name: '处决', icon: '决', tier: 'epic', max: 1,
      desc: '对生命低于 <em>30%</em> 的敌人伤害 <em>翻倍</em>', apply: (s, m) => { m.execute = 1; } },

    { id: 'detonate', name: '爆裂', icon: '爆', tier: 'epic', max: 2,
      desc: '敌人死亡时爆炸，造成 <em>60%</em> 攻击力的范围伤害', apply: (s, m) => { m.killExplode = (m.killExplode || 0) + 1; } },

    { id: 'firebrand', name: '烈焰附魔', icon: '燃', tier: 'epic', max: 1,
      desc: '攻击附加灼烧，每秒造成 <em>30%</em> 攻击力伤害', apply: (s, m) => { m.fireEnchant = 1; } },

    { id: 'frostbrand', name: '寒霜附魔', icon: '冻', tier: 'epic', max: 1,
      desc: '命中使敌人减速 <em>30%</em>，持续 1.5 秒', apply: (s, m) => { m.frostEnchant = 1; } },

    { id: 'stormbrand', name: '雷霆附魔', icon: '雷', tier: 'epic', max: 1,
      desc: '<em>20%</em> 概率触发连锁闪电', apply: (s, m) => { m.stormEnchant = 1; } },

    { id: 'dashmaster', name: '冲刺大师', icon: '冲', tier: 'epic', max: 2,
      desc: '冲刺冷却 <em>-35%</em>，冲刺时对经过的敌人造成伤害', apply: (s, m) => { m.dashDamage = (m.dashDamage || 0) + 1; s.cdr += 0.05; } },

    { id: 'retaliate', name: '血偿', icon: '偿', tier: 'epic', max: 1,
      desc: '受到伤害时，向四周释放一圈血刃', apply: (s, m) => { m.retaliate = 1; } },

    { id: 'splitshot', name: '分裂弹', icon: '裂', tier: 'epic', max: 1,
      desc: '投射物命中后向两侧分裂出 <em>2</em> 枚小弹丸', apply: (s, m) => { m.splitShot = 1; } },

    { id: 'vampire', name: '血之契约', icon: '契', tier: 'epic', max: 1,
      desc: '最大生命 <em>-15%</em>，伤害 <em>+30%</em>，生命偷取 <em>+4%</em>', apply: (s) => { s.maxHp *= 0.85; s.damage += 0.30; s.lifesteal += 0.04; } },
  ];

  RG.PERK_MAP = {};
  RG.PERKS.forEach((p) => { RG.PERK_MAP[p.id] = p; });

  /**
   * 抽取 n 个候选特性（排除已满层的）
   * 稀有度越高出现概率越低，但幸运/等级会略微提升
   */
  RG.rollPerkChoices = function (rng, perkCounts, level, n) {
    const pool = RG.PERKS.filter((p) => (perkCounts[p.id] || 0) < p.max);
    const tierW = {
      common: T.common.weight,
      rare: T.rare.weight * (1 + level * 0.02),
      epic: T.epic.weight * (1 + level * 0.035),
    };
    const picked = [];
    const used = {};
    let guard = 0;
    while (picked.length < n && guard++ < 300) {
      const cands = pool.filter((p) => !used[p.id]);
      if (!cands.length) break;
      const weights = cands.map((p) => tierW[p.tier] || 10);
      const p = rng.weighted(cands, weights);
      used[p.id] = 1;
      picked.push(p);
    }
    return picked;
  };
})(window);
