/* ==========================================================
   items.js — 装备基础模板
   ----------------------------------------------------------
   槽位：weapon(武器) / armor(防具) / trinket(饰品 ×2)
   每件装备带 1 个羁绊标签(tag)，4 个槽位拼出羁绊组合。
   攻击类型决定手感，是武器之间最大的差异来源。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  /* 佩戴位定义
     ------------------------------------------------------------
     只有武器和防具需要"穿上"；饰品放进行囊（背包）就生效，
     因此没有独立的饰品佩戴位。 */
  RG.SLOTS = [
    { id: 'weapon', name: '武器' },
    { id: 'armor', name: '防具' },
  ];

  /** 行囊容量 */
  RG.BAG_SIZE = 12;

  /* ---------------------- 武器 ----------------------
     attack.type:
       meleeArc   扇形近战挥砍
       projectile 直线/散射投射物
       homing     追踪弹
       orbit      环绕自身的持续刀刃
       cone       扇形持续喷射
       chain      链式闪电
       nova       命中后范围爆炸
       boomerang  往返穿透
     -------------------------------------------------- */
  RG.WEAPONS = [
    {
      id: 'sword', name: '断钢长剑', icon: 'sword', tag: 'storm',
      desc: '标准剑术，挥砍迅捷。',
      attack: { type: 'meleeArc', cd: 0.40, dmg: 15, range: 82, arc: 110, knock: 150, color: '#8fd8ff' },
      stats: { attackSpeed: 0.05 },
    },
    {
      id: 'hammer', name: '碎地战锤', icon: 'hammer', tag: 'dragon',
      desc: '极慢的单次重击，命中后震荡周围。',
      attack: { type: 'meleeArc', cd: 1.25, dmg: 46, range: 104, arc: 170, knock: 420, shake: 9, aoe: 66, color: '#ffb56b' },
      stats: { armor: 8, moveSpeed: -0.06 },
    },
    {
      id: 'bow', name: '猎风长弓', icon: 'bow', tag: 'wind',
      desc: '双发箭矢，贯穿整条直线上的所有敌人。',
      attack: { type: 'projectile', cd: 0.78, dmg: 21, speed: 820, pierce: 99, count: 2, spread: 0.10, life: 1.35, size: 4, color: '#a8ff8f', trail: true },
      stats: { crit: 0.05 },
    },
    {
      id: 'staff', name: '奥术法杖', icon: 'staff', tag: 'shadow',
      desc: '发射自动追踪的奥术弹，必定命中。',
      attack: { type: 'homing', cd: 0.82, dmg: 17, speed: 330, turn: 5.5, count: 2, life: 3.0, size: 6, color: '#c79bff' },
      stats: { area: 0.10 },
    },
    {
      id: 'daggers', name: '影袭匕首', icon: 'dagger', tag: 'shadow',
      desc: '一次抛出三枚短刃，射程较短。',
      attack: { type: 'projectile', cd: 0.50, dmg: 10, speed: 700, pierce: 0, count: 3, spread: 0.34, size: 3, life: 0.55, color: '#dcd2ff' },
      stats: { crit: 0.07, critMult: 0.15 },
    },
    {
      id: 'blades', name: '嗜血旋刃', icon: 'blade', tag: 'blood',
      desc: '两枚刃轮永续环绕，接触即流血。',
      attack: { type: 'orbit', dmg: 11, count: 2, radius: 74, spin: 2.1, tick: 0.30, size: 15, color: '#ff7a8a' },
      stats: { moveSpeed: 0.04 },
    },
    {
      id: 'flamer', name: '炎息法杖', icon: 'flame', tag: 'fire',
      desc: '持续喷射火焰，覆盖锥形区域。',
      attack: { type: 'cone', cd: 0.14, dmg: 7, range: 138, arc: 150, color: '#ff9b3d', burn: 0.35 },
      stats: { damage: 0.05 },
    },
    {
      id: 'lightning', name: '雷枪', icon: 'bolt', tag: 'storm',
      desc: '释放一道连锁闪电，自动跳跃。',
      attack: { type: 'chain', cd: 0.95, dmg: 27, range: 230, jumps: 2, jumpRange: 170, falloff: 0.82, color: '#7de3ff' },
      stats: { cdr: 0.05 },
    },
    {
      id: 'frostorb', name: '霜核法球', icon: 'frost', tag: 'frost',
      desc: '缓慢飞行，命中后炸开寒霜。',
      attack: { type: 'nova', cd: 1.05, dmg: 21, speed: 400, aoe: 78, slow: 0.45, slowDur: 2.0, size: 8, color: '#8fe6ff' },
      stats: { area: 0.08, armor: 5 },
    },
    {
      id: 'boomerang', name: '回旋战刃', icon: 'boomerang', tag: 'wind',
      desc: '抛出后折返，全程穿透。',
      attack: { type: 'boomerang', cd: 0.85, dmg: 17, speed: 620, dist: 260, count: 2, color: '#ffd98a' },
      stats: { moveSpeed: 0.05 },
    },
  ];

  /* ---------------------- 防具 ---------------------- */
  RG.ARMORS = [
    { id: 'plate', name: '铁壁胸甲', icon: 'armor', tag: 'thorn', desc: '厚重板甲，牺牲速度换取生存。', stats: { armor: 34, maxHp: 25, moveSpeed: -0.07 } },
    { id: 'thornmail', name: '荆棘之铠', icon: 'armor', tag: 'thorn', desc: '表面布满倒刺，反弹伤害。', stats: { armor: 20, thorns: 14 } },
    { id: 'leather', name: '游侠皮甲', icon: 'leather', tag: 'wind', desc: '轻便灵活，不影响机动。', stats: { armor: 13, moveSpeed: 0.11, attackSpeed: 0.04 } },
    { id: 'robe', name: '秘法长袍', icon: 'robe', tag: 'frost', desc: '引导奥术，强化技能循环。', stats: { armor: 7, cdr: 0.11, area: 0.16 } },
    { id: 'berserker', name: '狂徒背心', icon: 'vest', tag: 'fire', desc: '不要防御，只要更快的刀。', stats: { attackSpeed: 0.20, damage: 0.09, maxHp: -15 } },
    { id: 'dragonscale', name: '龙鳞胸甲', icon: 'scale', tag: 'dragon', desc: '古龙遗鳞，全面强化。', stats: { armor: 24, maxHp: 45, damage: 0.07 } },
  ];

  /* ---------------------- 饰品 ---------------------- */
  RG.TRINKETS = [
    { id: 'bloodgem', name: '血玉坠', icon: 'amulet', tag: 'blood', desc: '缓慢愈合伤口。', stats: { maxHp: 55, regen: 1.1 } },
    { id: 'swiftboots', name: '疾风战靴', icon: 'boot', tag: 'wind', desc: '踏风而行。', stats: { moveSpeed: 0.15 } },
    { id: 'hawkeye', name: '鹰眼护符', icon: 'eye', tag: 'shadow', desc: '洞察要害。', stats: { crit: 0.09, critMult: 0.22 } },
    { id: 'powerring', name: '力量指环', icon: 'ring', tag: 'dragon', desc: '纯粹的力量。', stats: { damage: 0.13 } },
    { id: 'lodestone', name: '磁石护符', icon: 'magnet', tag: 'storm', desc: '把战利品吸过来。', stats: { pickup: 0.55, luck: 8 } },
    { id: 'luckydice', name: '幸运骰', icon: 'dice', tag: 'shadow', desc: '命运偏爱赌徒。', stats: { luck: 20, goldGain: 0.18 } },
    { id: 'hourglass', name: '时之沙漏', icon: 'hourglass', tag: 'frost', desc: '偷取时间。', stats: { cdr: 0.13 } },
    { id: 'furymask', name: '狂怒面具', icon: 'mask', tag: 'fire', desc: '怒火催动手速。', stats: { attackSpeed: 0.17, crit: 0.04 } },
    { id: 'tortoise', name: '龟甲符', icon: 'turtle', tag: 'thorn', desc: '稳如磐石。', stats: { armor: 22, maxHp: 35 } },
    { id: 'hunter', name: '猎手徽章', icon: 'badge', tag: 'blood', desc: '一击致命。', stats: { crit: 0.06, critMult: 0.38 } },
  ];

  /* 索引 */
  RG.ITEM_BASES = {};
  ['WEAPONS', 'ARMORS', 'TRINKETS'].forEach((cat) => {
    const slot = cat === 'WEAPONS' ? 'weapon' : cat === 'ARMORS' ? 'armor' : 'trinket';
    RG[cat].forEach((b) => {
      b.slot = slot;
      b.cat = cat;
      RG.ITEM_BASES[b.id] = b;
    });
  });

  /** 按槽位取候选池 */
  RG.poolForSlot = function (slot) {
    if (slot === 'weapon') return RG.WEAPONS;
    if (slot === 'armor') return RG.ARMORS;
    return RG.TRINKETS;
  };
})(window);
