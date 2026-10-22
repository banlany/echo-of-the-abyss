/* ==========================================================
   grid.js — 空间哈希（宽相碰撞）
   ----------------------------------------------------------
   割草场景动辄几百个实体，逐对检测是 O(n²)。
   这里用均匀网格把所有"可被命中"的实体按坐标分桶，
   射线/扇形/圆形查询只扫邻近桶。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  class SpatialHash {
    constructor(cellSize) {
      this.cell = cellSize || 96;
      this.buckets = new Map();
    }

    clear() { this.buckets.clear(); }

    _key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }

    insert(e) {
      const cx = Math.floor(e.x / this.cell);
      const cy = Math.floor(e.y / this.cell);
      const k = cx + ',' + cy;
      let b = this.buckets.get(k);
      if (!b) { b = []; this.buckets.set(k, b); }
      b.push(e);
    }

    rebuild(list) {
      this.clear();
      for (let i = 0; i < list.length; i++) {
        if (list[i].dead) continue;
        this.insert(list[i]);
      }
    }

    /**
     * 查询圆形范围内的实体，结果写入 out（会被清空）
     * @param {Array} out 复用数组，避免 GC
     */
    query(x, y, r, out) {
      out.length = 0;
      const c = this.cell;
      const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
      const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const b = this.buckets.get(cx + ',' + cy);
          if (!b) continue;
          for (let i = 0; i < b.length; i++) {
            const e = b[i];
            if (e.dead) continue;
            const rr = r + (e.r || 12);
            const dx = e.x - x, dy = e.y - y;
            if (dx * dx + dy * dy <= rr * rr) out.push(e);
          }
        }
      }
      return out;
    }

    /** 找最近的一个实体（round-robin 起点避免总是同一个） */
    nearest(x, y, r, filter) {
      const c = this.cell;
      const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
      const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
      let best = null, bestD = r * r;
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const b = this.buckets.get(cx + ',' + cy);
          if (!b) continue;
          for (let i = 0; i < b.length; i++) {
            const e = b[i];
            if (e.dead) continue;
            if (filter && !filter(e)) continue;
            const dx = e.x - x, dy = e.y - y;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = e; }
          }
        }
      }
      return best;
    }
  }

  RG.SpatialHash = SpatialHash;
})(window);
