/* ==========================================================
   affixes.js — 稀有度 + 词条池
   ----------------------------------------------------------
   装备的"数值随机"由三层叠乘决定：
     最终值 = 基础值 × 等级强度 × 随机浮动 × 稀有度倍率
   因此同一把"断钢剑"在不同局/不同波次里数值都不同。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  /* ---------------------- 稀有度 ---------------------- */
  RG.RARITY = {
    // color 用于浅色（羊皮纸）界面；glow 用于暗色战场上的掉落光效
    common: { id: 'common', name: '普通', short: 'C', color: '#5e4c36', glow: '#c9b48c', mult: 1.0,  affixes: 0, priceMul: 1.0, weight: 50 },
    rare:   { id: 'rare',   name: '稀有', short: 'R', color: '#23578c', glow: '#5aa3ff', mult: 1.14, affixes: 1, priceMul: 1.5, weight: 28 },
    epic:   { id: 'epic',   name: '史诗', short: 'E', color: '#663a8c', glow: '#b06bff', mult: 1.32, affixes: 2, priceMul: 2.2, weight: 14 },
    legend: { id: 'legend', name: '传说', short: 'L', color: '#9a6212', glow: '#ffb020', mult: 1.55, affixes: 3, priceMul: 3.2, weight: 6 },
    mythic: { id: 'mythic', name: '神话', short: 'M', color: '#8c2f1c', glow: '#ff4d6d', mult: 1.85, affixes: 4, priceMul: 4.6, weight: 1.4 },
  };

  RG.RARITY_ORDER = ['common', 'rare', 'epic', 'legend', 'mythic'];

  /* ---------------------- 词条池 ----------------------
     stat 键与 player.stats 一一对应（见 world.js 的 recomputeStats）。
     kind: 'flat' 加算 / 'pct' 百分比加算
     ------------------------------------------------------ */
  RG.AFFIXES = [
    { id: 'hp',      name: '生命',     stat: 'maxHp',      kind: 'flat', min: 16,  max: 42,  weight: 12, fmt: (v) => '+' + Math.round(v) + ' 生命' },
    { id: 'armor',   name: '护甲',     stat: 'armor',      kind: 'flat', min: 6,   max: 16,  weight: 10, fmt: (v) => '+' + Math.round(v) + ' 护甲' },
    { id: 'damage',  name: '伤害',     stat: 'damage',     kind: 'pct',  min: 0.07, max: 0.17, weight: 14, fmt: (v) => '+' + Math.round(v * 100) + '% 伤害' },
    { id: 'atkspd',  name: '攻速',     stat: 'attackSpeed', kind: 'pct', min: 0.06, max: 0.15, weight: 13, fmt: (v) => '+' + Math.round(v * 100) + '% 攻速' },
    { id: 'spd',     name: '移速',     stat: 'moveSpeed',  kind: 'pct',  min: 0.04, max: 0.11, weight: 10, fmt: (v) => '+' + Math.round(v * 100) + '% 移速' },
    { id: 'crit',    name: '暴击率',   stat: 'crit',       kind: 'pct',  min: 0.03, max: 0.075, weight: 11, fmt: (v) => '+' + (v * 100).toFixed(1) + '% 暴击率' },
    { id: 'critdmg', name: '暴击伤害', stat: 'critMult',   kind: 'pct',  min: 0.12, max: 0.30, weight: 10, fmt: (v) => '+' + Math.round(v * 100) + '% 暴击伤害' },
    { id: 'cdr',     name: '冷却缩减', stat: 'cdr',        kind: 'pct',  min: 0.04, max: 0.09, weight: 8,  fmt: (v) => '+' + Math.round(v * 100) + '% 冷却缩减' },
    { id: 'area',    name: '范围',     stat: 'area',       kind: 'pct',  min: 0.05, max: 0.13, weight: 8,  fmt: (v) => '+' + Math.round(v * 100) + '% 技能范围' },
    { id: 'pickup',  name: '拾取',     stat: 'pickup',     kind: 'pct',  min: 0.12, max: 0.30, weight: 8,  fmt: (v) => '+' + Math.round(v * 100) + '% 拾取范围' },
    { id: 'luck',    name: '幸运',     stat: 'luck',       kind: 'flat', min: 4,   max: 11,  weight: 7,  fmt: (v) => '+' + Math.round(v) + ' 幸运' },
    { id: 'regen',   name: '回复',     stat: 'regen',      kind: 'flat', min: 0.3, max: 0.9, weight: 6,  fmt: (v) => '+' + v.toFixed(1) + '/秒 生命回复' },
    { id: 'thorns',  name: '荆棘',     stat: 'thorns',     kind: 'flat', min: 3,   max: 9,   weight: 5,  fmt: (v) => '+' + Math.round(v) + ' 反伤' },
    { id: 'xp',      name: '经验',     stat: 'xpGain',     kind: 'pct',  min: 0.06, max: 0.16, weight: 6,  fmt: (v) => '+' + Math.round(v * 100) + '% 经验获取' },
    { id: 'gold',    name: '贪婪',     stat: 'goldGain',   kind: 'pct',  min: 0.08, max: 0.20, weight: 6,  fmt: (v) => '+' + Math.round(v * 100) + '% 金币获取' },
    { id: 'lifesteal', name: '吸血',   stat: 'lifesteal',  kind: 'pct',  min: 0.01, max: 0.025, weight: 5, fmt: (v) => '+' + (v * 100).toFixed(1) + '% 生命偷取' },
    // 元属性：不参与数值浮动，固定 +1 格（见 rollAffix 的 fixed 分支）
    { id: 'bagspace', name: '行囊',    stat: 'bagSpace',   kind: 'flat', min: 1, max: 1, weight: 4, fixed: true, fmt: () => '+1 行囊格' },
  ];

  RG.AFFIX_MAP = {};
  RG.AFFIXES.forEach((a) => { RG.AFFIX_MAP[a.id] = a; });

  /* ---------------------- 名称前缀 ---------------------- */
  RG.NAME_PREFIX = {
    common: ['磨损的', '粗制的', '锈蚀的', '劣质的'],
    rare:   ['精钢的', '附魔的', '猎手的', '锐利的', '风蚀的'],
    epic:   ['深渊的', '雷鸣的', '血咒的', '噬魂的', '极寒的'],
    legend: ['湮灭的', '永劫的', '龙裔的', '星辰的'],
    mythic: ['虚空的', '终焉的', '混沌的'],
  };

  /* ---------------------- 生成一个词条 ---------------------- */
  /**
   * @param {string} rarityId 稀有度
   * @param {number} power    等级强度（随波次增长）
   * @param {RNG} rng
   * @param {string[]} exclude 已有词条 id，避免重复
   */
  RG.rollAffix = function (rarityId, power, rng, exclude) {
    const rar = RG.RARITY[rarityId];
    const pool = [];
    const weights = [];
    for (let i = 0; i < RG.AFFIXES.length; i++) {
      const a = RG.AFFIXES[i];
      if (exclude && exclude.indexOf(a.id) >= 0) continue;
      pool.push(a);
      weights.push(a.weight);
    }
    const a = rng.weighted(pool, weights);
    // 基础浮动 0.82 ~ 1.0，越高稀有度越靠上限
    let v;
    if (a.fixed) {
      v = a.min;                    // 固定值词条不做浮动/倍率放大
    } else {
      const rollQuality = rng.float(0.8, 1.0) * (0.9 + rar.affixes * 0.03);
      v = rng.float(a.min, a.max) * rollQuality * rar.mult;
      if (a.kind === 'pct') v = Math.round(v * 1000) / 1000;
      else v = Math.round(v * 10) / 10;
    }
    return {
      id: a.id,
      stat: a.stat,
      kind: a.kind,
      value: v,
      text: a.fmt(v),
    };
  };

  /**
   * 稀有度抽取，luck 越高越容易出高稀有度
   */
  RG.rollRarity = function (rng, luck, bonus) {
    const lk = 1 + (luck || 0) * 0.012 + (bonus || 0);
    const w = [];
    for (let i = 0; i < RG.RARITY_ORDER.length; i++) {
      const r = RG.RARITY[RG.RARITY_ORDER[i]];
      // 稀有度越高，幸运加成越明显
      w.push(r.weight * Math.pow(lk, i * 0.85));
    }
    return rng.weighted(RG.RARITY_ORDER, w);
  };

  /** 装备强度：随波次成长，让老装备自然淘汰 */
  RG.itemPower = function (wave) {
    return 1 + (wave - 1) * 0.19;
  };
})(window);
