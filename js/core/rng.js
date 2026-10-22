/* ==========================================================
   rng.js — 可确定复现的伪随机数
   ----------------------------------------------------------
   整个游戏的一切随机（刷怪、掉落、词条 roll、商店货架）
   都必须走这里。原因：多人联机时服务端与客户端必须能在
   相同种子 + 相同输入序列下得到完全一致的世界状态。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  class RNG {
    constructor(seed) {
      this.seed = (seed >>> 0) || 1;
      this.s = this.seed;
      this.calls = 0;
    }

    /** mulberry32 —— 32 位状态，足够快，分布良好 */
    next() {
      this.calls++;
      let t = (this.s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    float(a, b) { return a + this.next() * (b - a); }

    /** 闭区间整数 */
    int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }

    chance(p) { return this.next() < p; }

    sign() { return this.next() < 0.5 ? -1 : 1; }

    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

    /** 原地洗牌（Fisher-Yates） */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }

    /** 按权重抽取，weights 与 items 等长 */
    weighted(items, weights) {
      let total = 0;
      for (let i = 0; i < weights.length; i++) total += weights[i];
      let r = this.next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    }

    /** 指定范围内取 n 个不重复元素 */
    sample(arr, n) {
      const pool = arr.slice();
      this.shuffle(pool);
      return pool.slice(0, n);
    }

    /** 从对象 map 里按 value 权重抽一个 key */
    weightedKey(map) {
      const keys = Object.keys(map);
      const ws = keys.map((k) => map[k]);
      return this.weighted(keys, ws);
    }

    /** 生成一个独立子流：同一种子在任意调用顺序下都能复现 */
    fork(tag) {
      let h = this.seed ^ 0x9e3779b9;
      for (let i = 0; i < tag.length; i++) {
        h = Math.imul(h ^ tag.charCodeAt(i), 0x85ebca6b);
        h ^= h >>> 13;
      }
      return new RNG(h >>> 0);
    }
  }

  /** 全局共享流（表现层/非权威用途） */
  RG.RNG = RNG;
  RG.rng = new RNG((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
})(window);
