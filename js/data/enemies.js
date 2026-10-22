/* ==========================================================
   enemies.js — 小怪图鉴
   ----------------------------------------------------------
   本作没有 BOSS，所有压力都来自数量、速度与组合。
   敌人分为几种行为原型：追击 / 远程 / 自爆 / 分裂 /
   高速闪避 / 重甲。波次越高，出现种类与密度越恐怖。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  RG.ENEMIES = [
    {
      id: 'grunt', name: '深渊爬虫', shape: 'bug',
      r: 14, hp: 20, speed: 64, dmg: 8, xp: 4, gold: 2,
      color: '#ff5c78', accent: '#ff9db0', weight: 100, minWave: 1,
      ai: 'chase',
    },
    {
      id: 'runner', name: '疾行者', shape: 'runner',
      r: 11, hp: 13, speed: 132, dmg: 6, xp: 5, gold: 2,
      color: '#ffb84a', accent: '#ffe0a0', weight: 62, minWave: 2,
      ai: 'chase', wobble: 0.4,
    },
    {
      id: 'swarm', name: '噬骨蜂群', shape: 'swarm',
      r: 8, hp: 7, speed: 146, dmg: 4, xp: 3, gold: 1,
      color: '#ffe066', accent: '#fff6c0', weight: 55, minWave: 3,
      ai: 'chase', pack: [3, 6],
    },
    {
      id: 'brute', name: '血肉壮汉', shape: 'brute',
      r: 23, hp: 88, speed: 46, dmg: 15, xp: 12, gold: 5,
      color: '#c4544f', accent: '#ff9a8f', weight: 40, minWave: 3,
      ai: 'chase', knockResist: 0.7, armor: 6,
    },
    {
      id: 'spitter', name: '吐酸者', shape: 'spitter',
      r: 14, hp: 26, speed: 50, dmg: 9, xp: 9, gold: 4,
      color: '#72c957', accent: '#c6f58f', weight: 34, minWave: 4,
      ai: 'ranged', keepDist: 240, fireCd: 2.3, bulletSpeed: 250, bulletDmg: 9,
    },
    {
      id: 'bomber', name: '爆裂虫', shape: 'bomber',
      r: 13, hp: 18, speed: 96, dmg: 22, xp: 8, gold: 3,
      color: '#ff8a3d', accent: '#ffd28a', weight: 30, minWave: 5,
      ai: 'bomber', fuseRange: 44, blastR: 66, blastDmg: 15, fuseTime: 0.85,
    },
    {
      id: 'splitter', name: '分裂囊', shape: 'splitter',
      r: 19, hp: 48, speed: 58, dmg: 10, xp: 10, gold: 4,
      color: '#b06bff', accent: '#dcbcff', weight: 26, minWave: 6,
      ai: 'chase', splitInto: 'splitling', splitCount: 2,
    },
    {
      id: 'splitling', name: '囊泡', shape: 'swarm',
      r: 10, hp: 10, speed: 118, dmg: 5, xp: 3, gold: 1,
      color: '#d3a6ff', accent: '#f0dcff', weight: 0, minWave: 99,
      ai: 'chase',
    },
    {
      id: 'wraith', name: '虚影', shape: 'wraith',
      r: 12, hp: 32, speed: 108, dmg: 11, xp: 11, gold: 5,
      color: '#6fd6ff', accent: '#bff2ff', weight: 24, minWave: 7,
      ai: 'chase', dodge: 0.18, phase: true,
    },
    {
      id: 'jugger', name: '重甲狱卒', shape: 'jugger',
      r: 27, hp: 180, speed: 38, dmg: 20, xp: 24, gold: 10,
      color: '#7f8cff', accent: '#c0c8ff', weight: 16, minWave: 9,
      ai: 'chase', knockResist: 0.92, armor: 22,
    },
    {
      id: 'charger', name: '突刺者', shape: 'runner',
      r: 14, hp: 42, speed: 74, dmg: 16, xp: 13, gold: 6,
      color: '#ff4d6d', accent: '#ffb0c0', weight: 20, minWave: 10,
      ai: 'charger', chargeSpeed: 470, chargeCd: 2.8, chargeTime: 0.42, chargeRange: 320,
    },
  ];

  RG.ENEMY_MAP = {};
  RG.ENEMIES.forEach((e, i) => { e.index = i; RG.ENEMY_MAP[e.id] = e; });

  /** 按波次过滤可用敌人 */
  RG.enemiesForWave = function (wave) {
    return RG.ENEMIES.filter((e) => e.weight > 0 && e.minWave <= wave);
  };

  /** 波次难度系数 */
  RG.waveScaling = function (wave) {
    return {
      hp: Math.pow(1.22, wave - 1) * (1 + (wave - 1) * 0.03),
      dmg: Math.pow(1.14, wave - 1),
      speed: 1 + Math.min(0.42, (wave - 1) * 0.022),
      density: 1 + (wave - 1) * 0.14,
    };
  };
})(window);
