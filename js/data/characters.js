/* ==========================================================
   characters.js — 可选角色
   ----------------------------------------------------------
   6 个角色在 生命/护甲/移速/伤害/攻速/暴击/范围/幸运
   各维度有明确差异，并各自携带一条专属被动。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  RG.CHARACTERS = [
    {
      id: 'rayn', name: '雷恩', title: '断钢剑客', glyph: '剑', color: '#35d6ff',
      desc: '各项均衡的老兵，没有短板。',
      startWeapon: 'sword',
      base: {
        maxHp: 122, armor: 12, moveSpeed: 190, attackSpeed: 1.00, damage: 1.00,
        crit: 0.05, critMult: 1.50, pickup: 1.00, luck: 0, cdr: 0, area: 1.00,
        regen: 0, xpGain: 0, goldGain: 0, thorns: 0, lifesteal: 0,
      },
      passive: {
        id: 'bladecreed', name: '剑势',
        text: '每次击杀永久提升 <em>0.4%</em> 伤害（最多 +100%）',
        cap: 1.0, perKill: 0.004,
      },
      radar: [7, 6, 7, 8, 6],
    },
    {
      id: 'vera', name: '薇拉', title: '奥术编织者', glyph: '法', color: '#a06bff',
      desc: '玻璃大炮，技能范围与伤害极高。',
      startWeapon: 'staff',
      base: {
        maxHp: 96, armor: 7, moveSpeed: 178, attackSpeed: 0.95, damage: 1.20,
        crit: 0.03, critMult: 1.50, pickup: 1.00, luck: 6, cdr: 0.14, area: 1.30,
        regen: 0, xpGain: 0.05, goldGain: 0, thorns: 0, lifesteal: 0,
      },
      passive: {
        id: 'overload', name: '奥术过载',
        text: '技能范围额外 <em>+12%</em>，击杀时 <em>8%</em> 概率回满冷却',
        area: 0.12, procCd: 0.08,
      },
      radar: [4, 3, 5, 9, 9],
    },
    {
      id: 'kai', name: '凯', title: '猎风游侠', glyph: '弓', color: '#9dffb0',
      desc: '高速游走，靠机动性规避一切。',
      startWeapon: 'bow',
      base: {
        maxHp: 114, armor: 9, moveSpeed: 218, attackSpeed: 1.12, damage: 0.98,
        crit: 0.13, critMult: 1.60, pickup: 1.10, luck: 4, cdr: 0.04, area: 1.00,
        regen: 0, xpGain: 0, goldGain: 0, thorns: 0, lifesteal: 0,
      },
      passive: {
        id: 'windstep', name: '疾风步',
        text: '持续移动时攻速提升 <em>22%</em>，停止移动 0.6 秒后失效',
        speedBonus: 0.22, window: 0.6,
      },
      radar: [5, 4, 10, 7, 6],
    },
    {
      id: 'grom', name: '格罗姆', title: '深渊屠夫', glyph: '斧', color: '#ff8a4a',
      desc: '厚重的血牛，越残血越危险。',
      startWeapon: 'hammer',
      base: {
        maxHp: 178, armor: 32, moveSpeed: 164, attackSpeed: 0.86, damage: 1.10,
        crit: 0.02, critMult: 1.55, pickup: 0.95, luck: 0, cdr: 0, area: 1.06,
        regen: 0.3, xpGain: 0, goldGain: 0, thorns: 0, lifesteal: 0,
      },
      passive: {
        id: 'bloodlust', name: '嗜血',
        text: '生命越低伤害越高，最多 <em>+55%</em>',
        max: 0.55,
      },
      radar: [10, 9, 3, 8, 4],
    },
    {
      id: 'nyx', name: '妮克斯', title: '暗影行者', glyph: '影', color: '#ff6f9c',
      desc: '极致的暴击与速度，一次失误就会死。',
      startWeapon: 'daggers',
      base: {
        maxHp: 94, armor: 8, moveSpeed: 232, attackSpeed: 1.16, damage: 1.04,
        crit: 0.19, critMult: 1.95, pickup: 1.00, luck: 10, cdr: 0, area: 0.96,
        regen: 0, xpGain: 0, goldGain: 0.10, thorns: 0, lifesteal: 0,
      },
      passive: {
        id: 'shadowrun', name: '暗影疾行',
        text: '暴击后 1.2 秒移速 <em>+45%</em>，期间免疫减速',
        speed: 0.45, dur: 1.2,
      },
      radar: [4, 2, 10, 8, 10],
    },
    {
      id: 'aela', name: '艾拉', title: '拾荒圣徒', glyph: '光', color: '#ffd76b',
      desc: '成长飞快，靠资源滚雪球。',
      startWeapon: 'frostorb',
      base: {
        maxHp: 112, armor: 14, moveSpeed: 198, attackSpeed: 1.00, damage: 0.98,
        crit: 0.06, critMult: 1.50, pickup: 1.85, luck: 26, cdr: 0.06, area: 1.10,
        regen: 0.8, xpGain: 0.22, goldGain: 0.18, thorns: 0, lifesteal: 0,
      },
      passive: {
        id: 'blessing', name: '圣光庇护',
        text: '每 9 秒回复 <em>9%</em> 最大生命，击杀额外获得 <em>12%</em> 金币',
        interval: 9, healPct: 0.09, extraGold: 0.12,
      },
      radar: [7, 7, 6, 5, 5],
    },
  ];

  RG.CHAR_MAP = {};
  RG.CHARACTERS.forEach((c) => { RG.CHAR_MAP[c.id] = c; });

  RG.RADAR_LABELS = ['生存', '护甲', '机动', '输出', '暴击'];
})(window);
