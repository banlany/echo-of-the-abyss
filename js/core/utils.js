/* ==========================================================
   utils.js — 数学 / 几何 / 格式化小工具
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  const U = {
    TAU: Math.PI * 2,

    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    /** 帧率无关的指数插值 */
    damp(a, b, lambda, dt) { return U.lerp(a, b, 1 - Math.exp(-lambda * dt)); },

    sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; },

    rand(a, b) { return a + Math.random() * (b - a); },
    randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); },

    dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); },
    dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },

    angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },

    /** 最短角差，结果落在 [-PI, PI] */
    angleDiff(a, b) {
      let d = (b - a) % U.TAU;
      if (d > Math.PI) d -= U.TAU;
      if (d < -Math.PI) d += U.TAU;
      return d;
    },

    angleLerp(a, b, t) { return a + U.angleDiff(a, b) * t; },

    /** 点是否落在以 (cx,cy) 为心、朝向 dir、半角 halfArc、半径 r 的扇形内 */
    inCone(px, py, cx, cy, dir, halfArc, r) {
      const dx = px - cx, dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) return false;
      if (d2 < 1) return true;
      const a = Math.atan2(dy, dx);
      return Math.abs(U.angleDiff(dir, a)) <= halfArc;
    },

    /** 圆与圆是否相交 */
    circleHit(ax, ay, ar, bx, by, br) {
      const rr = ar + br;
      return U.dist2(ax, ay, bx, by) <= rr * rr;
    },

    /** 把 (x,y) 从 (cx,cy) 方向推出到半径 R 之外 */
    pushOut(x, y, cx, cy, R) {
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy) || 0.0001;
      return { x: cx + (dx / d) * R, y: cy + (dy / d) * R };
    },

    /** 数值缩写 1234 -> 1.2k */
    nf(v) {
      const n = Math.round(v);
      if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
      if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
      return String(n);
    },

    /** 保留 1 位小数，去掉多余的 .0 */
    f1(v) {
      const n = Math.round(v * 10) / 10;
      return Number.isInteger(n) ? String(n) : n.toFixed(1);
    },

    pct(v) { return Math.round(v * 100) + '%'; },

    /** 时间格式 01:23 */
    clock(sec) {
      sec = Math.max(0, sec);
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    },

    /** 由字符串生成稳定色相 */
    hashHue(str) {
      let h = 0;
      for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
      return h % 360;
    },

    /** hsl 便捷输出 */
    hsl(h, s, l, a) {
      return a === undefined
        ? `hsl(${h} ${s}% ${l}%)`
        : `hsl(${h} ${s}% ${l}% / ${a})`;
    },

    uid() { return (U._uid = (U._uid || 0) + 1); },

    /** 数组 swap-remove，返回是否删掉了元素 */
    swapRemove(arr, i) {
      const last = arr.length - 1;
      if (i !== last) arr[i] = arr[last];
      arr.pop();
    },

    /** 按 key 求和的深合并，用于词条汇总 */
    addInto(target, key, val) {
      target[key] = (target[key] || 0) + val;
    },
  };

  RG.U = U;
})(window);
