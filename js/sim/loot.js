/* ==========================================================
   loot.js — 装备实例生成 / 掉落判定 / 商店货架
   ----------------------------------------------------------
   一件装备 = 基础模板 + 等级强度 + 随机浮动 + 稀有度倍率 + N 条词条
   所以 "断钢长剑" 每次掉的数值都不一样，捡到更好的会想换。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});
  const U = RG.U;

  let _uid = 0;

  /** 单条属性按 power/稀有度缩放 */
  function scaleStat(v, power, rarMult, roll) {
    const out = v * power * roll;
    return v > 0 ? out * rarMult : out; // 负面属性不因稀有度而变糟
  }

  /**
   * 生成一件装备实例
   * @param {string} baseId 模板 id
   * @param {object} opt { wave, rarity, rng, luck }
   */
  RG.makeItem = function (baseId, opt) {
    opt = opt || {};
    const base = RG.ITEM_BASES[baseId];
    if (!base) throw new Error('unknown item base: ' + baseId);
    const rng = opt.rng || RG.rng;
    const wave = Math.max(1, opt.wave || 1);
    const power = RG.itemPower(wave);
    const rarityId = opt.rarity || RG.rollRarity(rng, opt.luck || 0);
    const rar = RG.RARITY[rarityId];

    // 1. 固有属性
    const inherent = {};
    for (const k in base.stats) {
      const roll = rng.float(0.9, 1.0);
      inherent[k] = scaleStat(base.stats[k], power, rar.mult, roll);
    }

    // 2. 武器攻击参数
    let atk = null;
    if (base.attack) {
      atk = Object.assign({}, base.attack);
      const dr = rng.float(0.9, 1.06);
      atk.dmg = base.attack.dmg * power * rar.mult * dr;
      if (atk.tick) atk.tick = base.attack.tick; // 触发间隔不随强度变
      // 范围类参数只受 power 微弱影响
      if (atk.range) atk.range *= 1 + (power - 1) * 0.08;
      if (atk.aoe) atk.aoe *= 1 + (power - 1) * 0.08;
    }

    // 3. 词条
    const affixes = [];
    const used = [];
    for (let i = 0; i < rar.affixes; i++) {
      const af = RG.rollAffix(rarityId, power, rng, used);
      used.push(af.id);
      affixes.push(af);
    }

    // 4. 汇总
    const stats = {};
    for (const k in inherent) U.addInto(stats, k, inherent[k]);
    for (let i = 0; i < affixes.length; i++) U.addInto(stats, affixes[i].stat, affixes[i].value);
    // 百分比类属性做四位小数收尾
    for (const k in stats) stats[k] = Math.round(stats[k] * 10000) / 10000;

    // 5. 命名
    const prefix = rng.pick(RG.NAME_PREFIX[rarityId]);
    const name = prefix + base.name;

    // 6. 价格
    const price = Math.round((20 + wave * 6.5) * rar.priceMul * (1 + affixes.length * 0.18));

    return {
      uid: ++_uid,
      baseId: base.id,
      name,
      baseName: base.name,
      slot: base.slot,
      cat: base.cat,
      tag: base.tag,
      icon: base.icon,
      desc: base.desc,
      rarity: rarityId,
      rarityName: rar.name,
      color: rar.color,
      glow: rar.glow || rar.color,
      power,
      wave,
      inherent,
      affixes,
      stats,
      atk,
      price,
    };
  };

  /** 按槽位随机生成 */
  RG.rollItemForSlot = function (slot, opt) {
    const rng = (opt && opt.rng) || RG.rng;
    const pool = RG.poolForSlot(slot);
    const base = rng.pick(pool);
    return RG.makeItem(base.id, opt);
  };

  /** 随机槽位生成 */
  RG.rollRandomItem = function (opt) {
    const rng = (opt && opt.rng) || RG.rng;
    const slot = rng.weighted(['weapon', 'armor', 'trinket'], [34, 30, 36]);
    return RG.rollItemForSlot(slot, opt);
  };

  /** 装备强度评分：用于 "↑/↓" 对比提示 */
  RG.itemScore = function (it) {
    if (!it) return 0;
    let s = 0;
    const st = it.stats;
    s += (st.damage || 0) * 120;
    s += (st.attackSpeed || 0) * 100;
    s += (st.crit || 0) * 160;
    s += (st.critMult || 0) * 70;
    s += (st.maxHp || 0) * 0.9;
    s += (st.armor || 0) * 1.4;
    s += (st.moveSpeed || 0) * 100;
    s += (st.cdr || 0) * 120;
    s += (st.area || 0) * 70;
    s += (st.luck || 0) * 2.2;
    s += (st.pickup || 0) * 25;
    s += (st.regen || 0) * 12;
    s += (st.thorns || 0) * 1.1;
    s += (st.xpGain || 0) * 40;
    s += (st.goldGain || 0) * 40;
    s += (st.lifesteal || 0) * 1200;
    if (it.atk) {
      const dps = it.atk.dmg / Math.max(0.12, (it.atk.cd || 0.6));
      s += dps * 2.0;
      if (it.atk.count) s += it.atk.count * 8;
    }
    return s;
  };

  /* ---------------------- 商店 ---------------------- */

  /**
   * 生成商店货架
   * @param {object} opt { wave, luck, count, rng }
   */
  RG.makeShopStock = function (opt) {
    opt = opt || {};
    const rng = opt.rng || RG.rng;
    const wave = opt.wave || 1;
    const count = opt.count || 4;
    const luck = opt.luck || 0;
    const list = [];
    const slots = ['weapon', 'armor', 'trinket', 'trinket', 'weapon', 'armor'];
    rng.shuffle(slots);
    for (let i = 0; i < count; i++) {
      const slot = slots[i % slots.length];
      // 商店里稀有度略高于野外掉落
      const rarity = RG.rollRarity(rng, luck, 0.10);
      const item = RG.rollItemForSlot(slot, { wave: wave + 1, rarity, rng, luck });
      list.push({ item, price: item.price, sold: false });
    }
    return list;
  };

  /** 掉落概率表：随幸运略微上浮 */
  RG.dropChances = function (luck) {
    const lk = 1 + luck * 0.01;
    return {
      item: Math.min(0.24, 0.032 * lk),
      gold: Math.min(1, 0.44 * lk),
      heal: 0.035,
      eliteItem: 0.75,
    };
  };
})(window);
