/* ==========================================================
   pixelart-actors.js — 像素角色 / 怪物贴图数据
   ----------------------------------------------------------
   每个 sprite 是一张 w×h 的调色板索引图：
     '.' = 透明，其余字符从 pal 里取色。
   这样零外部资源、可随时改色、可烘焙成 canvas 纹理。

   约定：立绘统一「正面向下」，渲染时不做旋转，
        只按移动方向水平翻转 —— 像素图旋转会毁掉像素感。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});
  RG.PIXEL_ART = RG.PIXEL_ART || {};

  const def = (name, pal, rows) => {
    RG.PIXEL_ART[name] = { w: rows[0].length, h: rows.length, pal, rows };
  };

  /* ==========================================================
     怪物（16×16）
     ========================================================== */

  // 深渊爬虫：宽扁甲虫，两只白眼
  def('grunt', { a: '#5d1626', b: '#ff5c78', w: '#fff0f4' }, [
    '................',
    '................',
    '................',
    '....aaaaaaaa....',
    '...abbbbbbbba...',
    '..abbbbbbbbbba..',
    '..abwwbbbbwwba..',
    '..abwwbbbbwwba..',
    '..abbbbbbbbbba..',
    '..abbbbbbbbbba..',
    '...abbbbbbbba...',
    '....aabbbbaa....',
    '...a..a..a..a...',
    '..a...a..a...a..',
    '................',
    '................',
  ]);

  // 疾行者：瘦长橙虫，四足
  def('runner', { a: '#7a3410', b: '#ffb84a', w: '#fff6dd' }, [
    '................',
    '.......aa.......',
    '......abba......',
    '.....abbbba.....',
    '....abbbbbba....',
    '...abwwbbwwba...',
    '...abwwbbwwba...',
    '...abbbbbbbba...',
    '....abbbbbba....',
    '.....abbbba.....',
    '......abba......',
    '.....a.bb.a.....',
    '....a..a..a.....',
    '...a...a...a....',
    '................',
    '................',
  ]);

  // 噬骨蜂群：小黄虫
  def('swarm', { a: '#7a6410', b: '#ffe066', w: '#fffbe0' }, [
    '................',
    '................',
    '................',
    '.....aaaa.......',
    '....abbbba......',
    '...abwwbbba.....',
    '...abwwbbba.....',
    '....abbbba......',
    '.....abba.......',
    '....a.ab.a......',
    '...a..a..a......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);

  // 血肉壮汉：方块体型，粗臂
  def('brute', { a: '#5e2420', b: '#c4544f', w: '#ffd9d4' }, [
    '................',
    '...aaaaaaaaaa...',
    '..abbbbbbbbbba..',
    '.abbbbbbbbbbbba.',
    '.abwwbbbbbbwwba.',
    '.abwwbbbbbbwwba.',
    '.abbbbbbbbbbbba.',
    'aabbbbbbbbbbbbaa',
    'aaabbbbbbbbbbaaa',
    'aa.abbbbbbbba.aa',
    '...abbbbbbbba...',
    '...abbbbbbbba...',
    '..aa.aaaaaa.aa..',
    '..aa........aa..',
    '................',
    '................',
  ]);

  // 吐酸者：绿色球体 + 大嘴
  def('spitter', { a: '#33621f', b: '#72c957', w: '#f0ffd8', d: '#1d3d12' }, [
    '................',
    '................',
    '.....aaaaaa.....',
    '....abbbbbba....',
    '...abbbbbbbba...',
    '...abwwbbwwba...',
    '...abwwbbwwba...',
    '...abbbbbbbba...',
    '....abdbbdba....',
    '.....abddba.....',
    '......aaaa......',
    '.....a....a.....',
    '....aa....aa....',
    '................',
    '................',
    '................',
  ]);

  // 爆裂虫：放射状尖刺
  def('bomber', { a: '#7a3d10', b: '#ff8a3d', w: '#ffe6c0' }, [
    '................',
    '.......a........',
    '...a...b...a....',
    '....a.abba.a....',
    '.....abbbba.....',
    '..a.abbbbbba.a..',
    '...abwwbbwwba...',
    '...abwwbbwwba...',
    '..a.abbbbbba.a..',
    '.....abbbba.....',
    '....a.abba.a....',
    '...a...b...a....',
    '.......a........',
    '................',
    '................',
    '................',
  ]);

  // 分裂囊：紫囊 + 裂纹
  def('splitter', { a: '#4a2470', b: '#b06bff', w: '#e8d4ff' }, [
    '................',
    '................',
    '.....aaaaaa.....',
    '....abbbbbba....',
    '...abbbbbbbba...',
    '...abbbbbbbba...',
    '...abbbwbbbba...',
    '...abbbbwbbba...',
    '...abbbbbwbba...',
    '....abbbbbba....',
    '.....abbbba.....',
    '......aaaa......',
    '.....a....a.....',
    '................',
    '................',
    '................',
  ]);

  // 虚影：下摆锯齿的幽灵
  def('wraith', { a: '#1f5c78', b: '#6fd6ff', w: '#e8fbff' }, [
    '................',
    '................',
    '.....aaaaaa.....',
    '....abbbbbba....',
    '...abbbbbbbba...',
    '...abwwbbwwba...',
    '...abwwbbwwba...',
    '...abbbbbbbba...',
    '...abbbbbbbba...',
    '...abbbbbbbba...',
    '...abbbbbbbba...',
    '...abcbcbcbca...',
    '...a.a.a.a.a....',
    '................',
    '................',
    '................',
  ]);

  // 重甲狱卒：六边形装甲 + 腰带
  def('jugger', { a: '#2b3168', b: '#7f8cff', w: '#e6e9ff', d: '#3a4180' }, [
    '................',
    '....aaaaaaaa....',
    '...abbbbbbbba...',
    '..abbbbbbbbbba..',
    '..abwwbbbbwwba..',
    '..abwwbbbbwwba..',
    '..abbbbbbbbbba..',
    '..abbddddddbba..',
    '..abbddddddbba..',
    '..abbbbbbbbbba..',
    '...abbbbbbbba...',
    '....abbbbbba....',
    '....aa....aa....',
    '...aa......aa...',
    '................',
    '................',
  ]);

  // 突刺者：尖锐头角
  def('charger', { a: '#6b1024', b: '#ff4d6d', w: '#ffe0e6' }, [
    '................',
    '................',
    '.......aa.......',
    '......abba......',
    '.....abbbba.....',
    '....abbbbbba....',
    '...abwwbbwwba...',
    '...abwwbbwwba...',
    '..abbbbbbbbbba..',
    '..abbbbbbbbbba..',
    '.aa.abbbbbba.aa.',
    '.aa..abbbba..aa.',
    '.....aaaaaa.....',
    '................',
    '................',
    '................',
  ]);

  /* ==========================================================
     角色（20×20）
     ========================================================== */

  // 雷恩 · 断钢剑客（青）
  def('rayn', { a: '#0d4c66', b: '#35d6ff', c: '#1a7fa9', w: '#eafcff' }, [
    '....................',
    '.......aaaaaa.......',
    '......abbbbbba......',
    '.....abbbbbbbba.....',
    '.....abbbbbbbba.....',
    '.....abwwbbwwba.....',
    '.....abwwbbwwba.....',
    '.....abbbbbbbba.....',
    '......abbbbbba......',
    '......accbbcca......',
    '.....abbbbbbbba.....',
    '....abbbbbbbbbba....',
    '....abbbbbbbbbba....',
    '....abbbbbbbbbba....',
    '....acbbbbbbbbca....',
    '....acbbbbbbbbca....',
    '.....aa......aa.....',
    '....aa........aa....',
    '....................',
    '....................',
  ]);

  // 薇拉 · 奥术编织者（紫，尖帽）
  def('vera', { a: '#3a1f5c', b: '#a06bff', c: '#6d3fb0', w: '#f2e6ff', d: '#4b2a78' }, [
    '....................',
    '........aa..........',
    '.......abba.........',
    '......abbbba........',
    '.....abbbbbba.......',
    '....abbbbbbbba......',
    '....abbbbbbbba......',
    '.....abwwbbwwa......',
    '.....abwwbbwwa......',
    '.....abbbbbbba......',
    '......abbbbba.......',
    '.....abbbbbbbba.....',
    '....abbbbbbbbbba....',
    '....abbbbbbbbbba....',
    '...abbbbbbbbbbbba...',
    '...accccccccccccca..',
    '...addddddddddddda..',
    '....aa........aa....',
    '....................',
    '....................',
  ]);

  // 凯 · 猎风游侠（绿，兜帽）
  def('kai', { a: '#1e4c2a', b: '#9dffb0', c: '#3f7d4d', w: '#eaffef' }, [
    '....................',
    '.........a..........',
    '........aba.........',
    '.......abbba........',
    '......abbbbba.......',
    '.....abbbbbbba......',
    '.....abbbbbbba......',
    '.....abwwbbwwa......',
    '.....abwwbbwwa......',
    '.....abbbbbbba......',
    '..a...abbbbba...a...',
    '..a..abbbbbbba..a...',
    '..a.abbbbbbbbba.a...',
    '..a.abbbbbbbbba.a...',
    '..aaabbbbbbbbbaaa...',
    '.....acccccccc......',
    '.....abbbbbbba......',
    '.....aa......aa.....',
    '....................',
    '....................',
  ]);

  // 格罗姆 · 深渊屠夫（橙红，宽肩）
  def('grom', { a: '#6b2a10', b: '#ff8a4a', c: '#b8552a', w: '#fff0e0' }, [
    '....................',
    '.....aaaaaaaaaa.....',
    '....abbbbbbbbbba....',
    '...abbbbbbbbbbbba...',
    '...abwwbbbbbbwwba...',
    '...abwwbbbbbbwwba...',
    '...abbbbbbbbbbbba...',
    '....abbbbbbbbbba....',
    '..aaabbbbbbbbbbaaa..',
    '.aaabbbbbbbbbbbbaaa.',
    '.aa.abbbbbbbbbba.aa.',
    '....abbbbbbbbbba....',
    '....abbbbbbbbbba....',
    '....abbbbbbbbbba....',
    '....acccccccccca....',
    '....abbbbbbbbbba....',
    '.....aa......aa.....',
    '....aa........aa....',
    '....................',
    '....................',
  ]);

  // 妮克斯 · 暗影行者（粉黑，面罩）
  def('nyx', { a: '#4a1226', b: '#ff6f9c', d: '#2a0a16', w: '#ffe6f0' }, [
    '....................',
    '.......aaaaaa.......',
    '......abbbbbba......',
    '.....abbbbbbbba.....',
    '.....aaddddddda.....',
    '.....addwdwddda.....',
    '.....addddddddda....',
    '......abbbbbba......',
    '......abbbbbba......',
    '.....abbbbbbbba.....',
    '....abbbbbbbbbba....',
    '....abbbbbbbbbba....',
    '.....abbbbbbbba.....',
    '.....abbbbbbbba.....',
    '.....abb....bba.....',
    '....aa........aa....',
    '....................',
    '....................',
    '....................',
    '....................',
  ]);

  // 艾拉 · 拾荒圣徒（金，光环）
  def('aela', { a: '#7a5c14', b: '#ffd76b', c: '#c9a337', w: '#fffce8' }, [
    '....................',
    '.......aaaaaa.......',
    '.....aa......aa.....',
    '....a..........a....',
    '.....aa......aa.....',
    '.......abbba........',
    '......abbbbba.......',
    '.....abwwbbwwa......',
    '.....abwwbbwwa......',
    '.....abbbbbbba......',
    '......abbbbba.......',
    '.....abbbbbbbba.....',
    '....abbbbbbbbbba....',
    '....abbbbbbbbbba....',
    '...abbbbbbbbbbbba...',
    '...acccccccccccca...',
    '...abbbbbbbbbbbba...',
    '....aa........aa....',
    '....................',
    '....................',
  ]);
})(window);
